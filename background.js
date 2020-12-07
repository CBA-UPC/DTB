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

//Javascript que va detras del manifestjson
//############################################## GLOBAL VARIABLES ##############################################

var filter = true;

var model;
var dict;
// Here we will save tabId, tab url, number of blocked url and its lists
var tabsInfo = new Map();

var user_allowed_urls = new Set();
var user_allowed_hosts = new Set();

loadModel();
load_dict();



function isURL(str) {
  const pattern = new RegExp('^(https?:\\/\\/)?'+ // protocol
    '((([a-z\\d]([a-z\\d-]*[a-z\\d])*)\\.)+[a-z]{2,}|'+ // domain name
    '((\\d{1,3}\\.){3}\\d{1,3}))'+ // OR ip (v4) address
    '(\\:\\d+)?(\\/[-a-z\\d%_.~+]*)*'+ // port and path
    '(\\?[;&a-z\\d%_.~+=-]*)?'+ // query string
    '(\\#[-a-z\\d_]*)?$','i'); // fragment locator
  return !!pattern.test(str);
}


//function to create a new entry for tabsInfo
function newInfo (tabId){
    chrome.tabs.get(tabId,
        function(tab) {
            let aux_url, auxhost;
            if(isURL(tab.url)){
                aux_url = new URL(tab.url);
                aux_host = aux_url.host;

                let info = {
                    id: tabId,
                    url: tab.url,
                    blocked_index: [],
                    blocked: [],
                    host: aux_host
                };
                tabsInfo.set(tabId,info);
            }
            else {
                console.log("error", tab.url);
            }
        }
    );
}


//change badge color (badge shows the number of suspicious url blocked on a website)
chrome.browserAction.setBadgeBackgroundColor({color:'#FF5733'});

//############################################## LISTENERS ##############################################
// esta funcion se ejecuta al ser instalado
chrome.runtime.onInstalled.addListener(
    function(){
        //meter aqui una url de bienvenida o algo sabes
        loadModel();
        load_dict();
    }
);


//cargar modelo al iniciar navegador
chrome.runtime.onStartup.addListener(
    function() {
        loadModel();
        load_dict();
    }
);


// ############################################## FUNCIONES PARA EL MODELO ##############################################

//Load model
async function loadModel(){
    model = await tf.loadLayersModel('./model_tfjs-DNN/model.json');
    //model.summary();
}

//load dictionary for preprocessing
async function load_dict(){
    await jQuery.getJSON("dict_url_raw.json", function(json) {
        dict = json
        //al caracter que tiene el 0 asignado como traduccion se lo cambiamos para que no interfiera con el padding, se le da el valor de dict.length que es el immediatamente mas peque siguiente
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



function updateTabInfo (idTab, aux_URL){
    chrome.tabs.get(idTab,
        function(tab) {
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
            chrome.browserAction.setBadgeText(
                {tabId: idTab, text: ((tabsInfo.get(idTab).blocked.length).toString())}
            );
        }
    );
}



// ############################################## REQUEST PROCESSING ##############################################
chrome.webRequest.onBeforeRequest.addListener(
    function(details){ //this is a callback function executed when details of the webrequest are available
        //check if extension is enabled
        if(!filter){
            return;
        }

        const request_url = details.url;
        const idTab = details.tabId;

        if(idTab >= 0 && !tabsInfo.has(idTab)){
            newInfo(idTab);
        }

        //allow requests that have same host or are present in excepcions list
        let aux_url = new URL(request_url);
        if(tabsInfo.has(idTab)){
            if(aux_url.host == tabsInfo.get(idTab).host){
                //console.log(request_url, " and ", tabsInfo.get(idTab).url, " have same host, allowed connection" );
                return;
            }
        }

        let suspicious = 0;
        let prepro_url = url_preprocessing(request_url);
        if(model != undefined) {
            suspicious = processResult(prepro_url);
        }

        //if it is classified as tracking, is added to tab info
        if (suspicious && tabsInfo.has(idTab)){
            //console.log("Classified as suspicous", request_url, aux_url.host, " Web host:", tabsInfo.get(idTab).host);
            //console.log(aux_url);
            updateTabInfo(idTab,aux_url);
            if (user_allowed_hosts.has(aux_url.host) || user_allowed_urls.has(request_url)) {
                //console.log("Allowed by excepcions list: ", request_url);
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
        if(changeInfo.status == "loading" && tabsInfo.has(tabId)){
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
        //console.log(tabsInfo);
        tabsInfo.delete(tabId);
    }
)


// ############################################## CONNECTIONS WITH POPUP ##############################################
chrome.extension.onRequest.addListener(function(request, sender, sendResponse) {
	switch (request.method)
	{
    case 'get_enabled':
        sendResponse(filter);
        break;
    case 'filterCheck':
        filter = request.data;
        break;

    // URL excepction management
    case 'add_url_exception':
        user_allowed_urls.add(request.data);
        console.log("message received ", request.data);
        if(tabsInfo.has(current_tab)){
            let i = tabsInfo.get(current_tab).blocked_index.indexOf(request.data);
            tabsInfo.get(current_tab).blocked[i].check =true;
        }
        break;
    case 'delete_url_exception':
        if(user_allowed_urls.has(request.data)){
            user_allowed_urls.delete(request.data);
            if(tabsInfo.has(current_tab)){
                let i = tabsInfo.get(current_tab).blocked_index.indexOf(request.data);
                tabsInfo.get(current_tab).blocked[i].check =false;
            }
        }
        break;

    // host excepction managemen
        case 'add_host_exception':
            user_allowed_hosts.add(request.data);
            console.log("message received ", request.data);
            break;
        case 'delete_host_exception':
            if(user_allowed_hosts.has(request.data)){
                user_allowed_hosts.delete(request.data);
            }
            break;

    case 'get_allowed_hosts':
        sendResponse(Array.from(user_allowed_hosts));
        break;
    case 'get_blocked_urls':
        if(tabsInfo.has(current_tab)){
            //console.log("Request received, sending data...", tabsInfo.get(current_tab).blocked, "user_allowed_urls ", user_allowed_urls);
            sendResponse(tabsInfo.get(current_tab).blocked);
        }
        else {
            sendResponse();
        }
        break;
	}
});
