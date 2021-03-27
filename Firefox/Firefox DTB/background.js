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

// Boolean that indicates if extension's filter is activated or not
var filter = true;

// Boolean to check is allowed sites should be saved between sessions
var save_allowed = true;

// Variables needed for the deep learning model to work
var model;
var dict;

// Info about current open tabs will be handled in this variable
var tabsInfo = new Map();

// User allowed urls/hosts are saved here. Set is used to avoid repeated appearences of an element
var user_allowed_urls = new Set();
var user_allowed_hosts = new Set();

// Exceptions elements to avoid some false positives that affect some websites functioning, stored in exceptions.json
var exceptions_matches;


//change badge color (badge shows the number of suspicious url blocked on a website)
browser.browserAction.setBadgeBackgroundColor({color:'#cf1b1b'});


loadModel();
load_dict();
loadEx();


browser.storage.sync.get(['allowed_urls'], function(result){
    if(result != undefined && Object.keys(result).length != 0){
        result.allowed_urls.forEach(item => user_allowed_urls.add(item));
        console.log("URLs recovered from memory: ", result.allowed_urls, user_allowed_urls);
    }
});

browser.storage.sync.get(['allowed_hosts'], function(result){
    if(result != undefined && Object.keys(result).length != 0){
        result.allowed_hosts.forEach(item => user_allowed_hosts.add(item));
        console.log("Hosts recovered from memory: ", result.allowed_hosts, user_allowed_hosts);
    }
});

// ############################################## WHITELIST FUNCTIONS ##############################################
// Whitelist to avoid some known false positives
async function loadEx(){
    let aux;
    await jQuery.getJSON("exceptions.json", function(result) {
        aux = result;
        for (var key in aux) {
            switch (key) {
                case "exception_matches":
                    exception_matches = aux[key];
                    break;
            }
        }
    });
}


// ############################## MODEL FUNCTIONS ###############################
//Load model
async function loadModel(){
    model = await tf.loadLayersModel('./model_tfjs-DNN/model.json');
    //model.summary();
}

//Load dictionary for preprocessing
async function load_dict(){
    await jQuery.getJSON("dict_url_raw.json", function(jsonDict) {
        dict = jsonDict;
        // Change character translated as "0" to avoid interference with padding.
        // Setup the next smallest value (dict.length)
        for (var key in dict) {
            if (dict.hasOwnProperty(key) && dict[key] == 0) {
                dict[key] = Object.keys(dict).length;
            }
        }
    });
}

//######################### URL PREPROCESSING #########################

function url_preprocessing(url){
    // Convert URL string to character array
    const url_array = Array.from(url);

    // Convert characters to numbers matching the DL model used dictionary (it depends on the training database)
    for (i=0; i < url_array.length; i++){
        if(dict != undefined && dict.hasOwnProperty(url_array[i]))
            url_array[i]=dict[url_array[i]];
    }

    // Left padding & truncate
    return Array(200).fill(0).concat(url_array).slice(url_array.length);
}


//######################### INFERENCE TASK ############################
// Returns an integer value depending if the url must be blocked or not (puede ser float y poner un threshold??)
function processResult(prepro_url){
    let result = model.predictOnBatch(tf.tensor(prepro_url,[1, 200]));
    result = result.reshape([2]);
    result = result.argMax(); // Correct value but still inside a tensor
    return result.arraySync(); // Returns the tensor data as a nested array. As it is one value, it returns one int
}


//######################### tabInfo related functions #########################


//function to create a new entry for tabsInfo
function newInfo (tabId){
    browser.tabs.get(tabId,
        function(tab) {
            if (browser.runtime.lastError) {
                // roundabout to avoid error "no tab with id xxx"
                console.log("There's an error, sorry: ",chrome.runtime.lastError.message);
                return;
            }
            let aux_host;
            try {
                if(tab.url == undefined){
                    return;
                }

                aux_host = new URL(tab.url).host;

                let baseHost = aux_host.split(".");
                baseHost = baseHost.slice(baseHost.length-2, baseHost.length);
                baseHost = (baseHost[0]+"."+baseHost[1]);

                let info = {
                    id: tabId,
                    url: tab.url,
                    blocked_index: [],
                    blocked: [],
                    host: aux_host,
                    baseHost: baseHost,
                };
                tabsInfo.set(tabId,info);
            } catch (e) {
                // Show error when loaded something that is not a website (e.g. local files)
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

        browser.browserAction.setBadgeText(
            {tabId: idTab, text: ((tabsInfo.get(idTab).blocked.length).toString())}
        );
}

//######################### other functions #########################
// Function to skip some exceptions (falses positives like CDNs)
function isException(aux_URL, tabHost){
    if(aux_URL.href == "https://www.google.com/recaptcha/api.js"){
        return true;
    }
    for(var key in exception_matches){
        if(aux_URL.host.includes(exception_matches[key]["url_host"]) &&
            (exception_matches[key]["tab_host"] === "*" || tabHost.includes(exception_matches[key]["tab_host"]))){
            return true;
        }
    }
    return false;
}


function saveStorageURLS(){
    if (save_allowed) {
        let arrayURLs = Array.from(user_allowed_urls.values());

        browser.storage.sync.set({ ['allowed_urls'] : arrayURLs }, function(){
            console.log('URLs saved succesfully: ', arrayURLs);
        });
    }
}

function saveStorageHosts(){
    if (save_allowed) {
        let arrayHosts = Array.from(user_allowed_hosts.values());

        browser.storage.sync.set({ ['allowed_hosts'] : arrayHosts }, function(){
            console.log('Hosts saved succesfully', arrayHosts);
        });
    }

}






// ############################################## REQUEST PROCESSING ##############################################
browser.webRequest.onBeforeRequest.addListener(
    function(details){
        //Callback function executed when details of the webrequest are available

        //Check if extension is enabled
        if(!filter){
            return;
        }

        const request_url = details.url;
        const idTab = details.tabId;

        //Needed when tab created in background
        if(idTab >= 0 && !tabsInfo.has(idTab)){
            newInfo(idTab);
        }

        if(tabsInfo.get(idTab) == undefined){
            return;
        }

        let aux_URL = new URL(request_url);
        let tabHost = tabsInfo.get(idTab).host;

        // Allow first party requests
        if(aux_URL.host.includes(tabsInfo.get(idTab).baseHost)){
            return;
        }

        // Allow exceptions (mostly CDN's)
        if(isException(aux_URL, tabHost)){
            //console.log("Allowed by exceptions list: ", request_url);
            return;
        }

        let suspicious = 0; // Here will be stored the url once is preprocessed
        let prepro_url = url_preprocessing(request_url);
        suspicious = processResult(prepro_url);


        // If suspicious, add it to tab info and show it on popup
        if (suspicious && tabsInfo.has(idTab)){
            //console.log("Classified as suspicious", aux_URL, aux_URL.host, " Web host:", tabHost);
            updateTabInfo(idTab,aux_URL);

            // Allow user allowed hosts and requests, needs to be here to be showed to the user
            if (user_allowed_hosts.has(aux_URL.host) || user_allowed_urls.has(request_url)) {
                //console.log("Allowed by user exceptions list: ", request_url);
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
// Creates new tabInfo when tab is visited (onActivated) and is not already registered
browser.tabs.onActivated.addListener(
    function(activeInfo){
        current_tab = activeInfo.tabId;
        if(tabsInfo.has(activeInfo.tabId)){
            return;
        }
        newInfo(activeInfo.tabId);
        //console.log(tabsInfo);
    }
);


// Creates new tabInfo when page is reloaded or url is changed (onUpdated)
browser.tabs.onUpdated.addListener(
    function(tabId, changeInfo){
        if((changeInfo.status == "loading") && tabsInfo.has(tabId)){
            newInfo(tabId);
            browser.browserAction.setBadgeText(
                {tabId: tabId, text: ('')}
            );
        }
    }
);


// Remove tabInfo when a tab is closed (onRemove)
browser.tabs.onRemoved.addListener(
    function(tabId){
        if(!tabsInfo.has(tabId)){
            return;
        }
        tabsInfo.delete(tabId);
    }
);

// Save allowed sites in storage when a window is closed
browser.windows.onRemoved.addListener(function (windowid){
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

    // URL exception management
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
    case 'reload_tab':
        var code = 'window.location.reload();';
        browser.tabs.executeScript(current_tab, {code: code});
        break;
	}

    // Needed to prevent error "Unchecked runtime.lastError: The message port closed before a response was received." from appearing needlessly
    sendResponse();
});
