/*
 *
 * Copyright (C) 2020 Universitat Politècnica de Catalunya.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at:
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

//############################################## GLOBAL VARIABLES ##############################################

//Boolean that indicates if extension's filter is activated or not
var filter = true;

//Boolean to check is allowed sites should be saved between sessions
var save_allowed = true;

//Variables needed for the deep learning model to work
var model;
var dict;

//Info about current open tabs will be handled in this variable
var tabsInfo = new Map();

//User allowed urls/hosts are saved here. Set is used to avoid repeated appearences of an element
var user_allowed_urls = new Set();
var user_allowed_hosts = new Set();

//Whitelisted elements to avoid some false positives that affect some websites functioning, stored in whitelist.json
var whitelisted_matches;


//change badge color (badge shows the number of suspicious url blocked on a website)
chrome.browserAction.setBadgeBackgroundColor({color:'#cf1b1b'});


loadModel();
load_dict();
loadWL();


chrome.storage.sync.get(['allowed_urls'], function(result){
    if(result != undefined && Object.keys(result).length != 0){
        result.allowed_urls.forEach(item => user_allowed_urls.add(item));
        console.log("URLs recovered from memory: ", result.allowed_urls, user_allowed_urls);
    }
});

chrome.storage.sync.get(['allowed_hosts'], function(result){
    if(result != undefined && Object.keys(result).length != 0){
        result.allowed_hosts.forEach(item => user_allowed_hosts.add(item));
        console.log("Hosts recovered from memory: ", result.allowed_hosts, user_allowed_hosts);
    }
});

// ############################################## WHITELIST FUNCTIONS ##############################################
// purpose of this is to avoid false positive that affects website usability and correct functioning
async function loadWL(){
    let aux;
    await jQuery.getJSON("whitelist.json", function(result) {
        aux = result;
        for (var key in aux) {
            switch (key) {
                case "whitelisted_matches":
                    whitelisted_matches = aux[key];
                    break;
            }
        }
    });
}


// ############################################## FUNCIONES PARA EL MODELO ##############################################

//Load model
async function loadModel(){
    model = await tf.loadLayersModel('./model_tfjs-DNN/model.json');
    //model.summary();
}

//load dictionary for preprocessing
async function load_dict(){
    await jQuery.getJSON("dict_url_raw.json", function(jsonDict) {
        dict = jsonDict;
        //al caracter que tiene el 0 asignado como traduccion se lo cambiamos para que no interfiera con el padding,
        //se le da el valor de dict.length que es el immediatamente mas peque siguiente
        for (var key in dict) {
            if (dict.hasOwnProperty(key) && dict[key] == 0) {
                dict[key] = Object.keys(dict).length;
            }
        }
    });
}

//######################### URL PREPROCESSING #########################

function url_preprocessing(url){
    //convertimos la url de string a array de caracteres
    const url_array = Array.from(url);

    //traducimos la url de caracteres a numeros segun el diccionario creado por la notebook (esta depende de la base de datos que utiliza para el training)
    for (i=0; i < url_array.length; i++){
        if(dict != undefined && dict.hasOwnProperty(url_array[i]))
            url_array[i]=dict[url_array[i]];
    }

    //padding a la izquierda
    return Array(200).fill(0).concat(url_array).slice(url_array.length);
}


//######################### INFERENCE TASK #########################
//With a processed url returns an int to say if it has to be blocked or not
function processResult(prepro_url){
    let result = model.predict(tf.tensor(prepro_url,[1, 200]));
    result = result.reshape([2]);
    result = result.argMax(); //aqui tiene el valor que toca pero sigue siendo un tensor
    return result.arraySync(); //Returns the tensor data as a nested array, as it is one value, it returns one int
}


//######################### tabInfo related functions #########################


//function to create a new entry for tabsInfo
function newInfo (tabId){
    chrome.tabs.get(tabId,
        function(tab) {
            if (chrome.runtime.lastError) {
                //roudabout to error "no tab with id xxx"
                console.log("Sorry for this: ",chrome.runtime.lastError.message);
                return;
            }
            let aux_host;
            try {
                if(tab.url == undefined){
                    return;
                }

                aux_host = new URL(tab.url).host;

                let info = {
                    id: tabId,
                    url: tab.url,
                    blocked_index: [],
                    blocked: [],
                    host: aux_host
                };
                tabsInfo.set(tabId,info);
            } catch (e) {
                //if you load something that's not a website, error, like local files
                console.log("Visited site is not an URL");
            }
        }
    );
}

function updateTabInfo (idTab, aux_URL){
        let check_value;
        if(user_allowed_hosts.has(aux_URL.host)){
            check_value = true;
        }
        else{
            check_value = user_allowed_urls.has(aux_URL.href);
        }

        let blocked_info = {
            url: aux_URL.href,
            host: aux_URL.host,
            check: check_value,
        }

        tabsInfo.get(idTab).blocked_index.push(aux_URL.href);
        tabsInfo.get(idTab).blocked.push(blocked_info);

        tabsInfo.set(idTab,  tabsInfo.get(idTab));

        chrome.browserAction.setBadgeText(
            {tabId: idTab, text: ((tabsInfo.get(idTab).blocked.length).toString())}
        );
}

//######################### other functions #########################
//this section is to ensure functionality in some cases were falses positves where dicovered
function isSpecialCase(aux_URL, tabHost){
    if(aux_URL.host.includes("fbcdn.net") && tabHost.includes("facebook.com")){
        return true; //visiting facebook
    }
    if(aux_URL.host.includes("twitchcdn.net") && tabHost.includes("twitch.tv")){
        return true; //visiting twitch
    }
    if(aux_URL.host.includes("lolstatic") && tabHost.includes("leagueoflegends.com")){
       return true;
    }
    if(aux_URL.host.includes("poecdn") && tabHost.includes("pathofexile.com")){
        return true;
    }
    if(aux_URL.host.includes("outlook") && tabHost.includes("outlook.live.com")){
        return true;
    }
    if(aux_URL == "https://www.google.com/recaptcha/api.js"){
        return true;
    }

    return false;
}


function saveStorageURLS(){
    if (save_allowed) {
        let arrayURLs = Array.from(user_allowed_urls.values());

        chrome.storage.sync.set({ ['allowed_urls'] : arrayURLs }, function(){
            console.log('URLs saved succesfully: ', arrayURLs);
        });
    }
}

function saveStorageHosts(){
    if (save_allowed) {
        let arrayHosts = Array.from(user_allowed_hosts.values());

        chrome.storage.sync.set({ ['allowed_hosts'] : arrayHosts }, function(){
            console.log('Hosts saved succesfully', arrayHosts);
        });
    }

}






// ############################################## REQUEST PROCESSING ##############################################
chrome.webRequest.onBeforeRequest.addListener(
    function(details){
        //this is a callback function executed when details of the webrequest are available

        //check if extension is enabled
        if(!filter){
            return;
        }

        const request_url = details.url;
        const idTab = details.tabId;

        //needed when tab created in background
        if(idTab >= 0 && !tabsInfo.has(idTab)){
            newInfo(idTab);
        }
        
        if(tabsInfo.get(idTab) == undefined){
            return;
        }

        let aux_URL = new URL(request_url);
        let tabHost = tabsInfo.get(idTab).host;

        //allow requests that have same host
        if(aux_URL.host.includes(tabHost)){
            return;
        }

        let suspicious = 0; //here will be stored the url once is preprocessed
        let prepro_url = url_preprocessing(request_url);

        suspicious = processResult(prepro_url);

        //if it is classified as tracking, is added to tab info
        if (suspicious && tabsInfo.has(idTab)){
            //console.log("Classified as suspicous", request_url, aux_URL.host, " Web host:", tabHost);

            //allow requests in some special cases where correct functionality is broken otherwise
            if(isSpecialCase(aux_URL, tabHost)){
                console.log("Allowed by special cases list: ", request_url);
                return;
            }

            //checks whitelist
            for(var key in whitelisted_matches){
                if(aux_URL.host.includes(whitelisted_matches[key])){
                    console.log("Allowed by matches whitelist: ", request_url);
                    return;
                }
            }

            //if its not whitelisted, show it on popup
            updateTabInfo(idTab,aux_URL);


            //if user has allowed it, don't cancel request
            if (user_allowed_hosts.has(aux_URL.host) || user_allowed_urls.has(request_url)) {
                console.log("Allowed by excepcions list: ", request_url);
                return;
            }

            return {cancel: true};
        };
    },
    {urls: ["<all_urls>"]},
    ["blocking"]
);



// ############################################## TABS LISTENERS ##############################################
var current_tab;
//on activated tab, creates new tabInfo if tab visited is not registered
chrome.tabs.onActivated.addListener(
    function(activeInfo){
        current_tab = activeInfo.tabId;
        if(tabsInfo.has(activeInfo.tabId)){
            return;
        }
        newInfo(activeInfo.tabId);
        console.log(tabsInfo);
    }
);


//on updated tab, creates new tabInfo when page is reloaded or url is changed
chrome.tabs.onUpdated.addListener(
    function(tabId, changeInfo){
        if(changeInfo.url != undefined && tabsInfo.has(tabId)){
            newInfo(tabId);
        }
        else{
            return;
        };

    }
);


//on removed, remove tabInfo when a tab is closed
chrome.tabs.onRemoved.addListener(
    function(tabId){
        if(!tabsInfo.has(tabId)){
            return;
        }
        tabsInfo.delete(tabId);
    }
);

//it save the allowed sites in storage when a window is closed
chrome.windows.onRemoved.addListener(function (windowid){
    saveStorageURLS();
    saveStorageHosts();
});


// ############################################## CONNECTIONS WITH POPUP ##############################################
browser.runtime.onMessage.addListener(function(request, sender, sendResponse) {
	switch (request.method)
	{
    case 'get_enabled':
        sendResponse(filter);
        break;
    case 'filterCheck':
        filter = request.data;
        break;

    case 'get_enabled_SA':
        sendResponse(save_allowed);
        break;
    case 'save_allowed_changed':
        save_allowed = request.data;
        break;

    // URL excepction management
    case 'add_url_exception':
        user_allowed_urls.add(request.data);
        if(tabsInfo.has(current_tab)){
            let i = tabsInfo.get(current_tab).blocked_index.indexOf(request.data);
            tabsInfo.get(current_tab).blocked[i].check =true;
        }
        saveStorageURLS();
        break;
    case 'delete_url_exception':
        if(user_allowed_urls.has(request.data)){
            user_allowed_urls.delete(request.data);
            if(tabsInfo.has(current_tab)){
                let i = tabsInfo.get(current_tab).blocked_index.indexOf(request.data);
                tabsInfo.get(current_tab).blocked[i].check =false;
            }
        }
        saveStorageURLS();
        break;
    // host excepction management
        case 'add_host_exception':
            user_allowed_hosts.add(request.data);
            saveStorageHosts();
            break;
        case 'delete_host_exception':
            if(user_allowed_hosts.has(request.data)){
                user_allowed_hosts.delete(request.data);
            }
            saveStorageHosts();
            break;

    case 'get_allowed_hosts':
        sendResponse(Array.from(user_allowed_hosts));
        break;
    case 'get_blocked_urls':
        if(tabsInfo.has(current_tab)){
            //console.log("Request received, sending data...", tabsInfo.get(current_tab).blocked);
            sendResponse(tabsInfo.get(current_tab).blocked);
        }
        break;
	}

    //this is to prevent error message "Unchecked runtime.lastError: The message port closed before a response was received." from appearing needlessly
    sendResponse();
});
