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

function create_host_section(host){


    let hostdiv = document.createElement("div");
    hostdiv.id = host+"header";
    let sectionTitle = document.createElement("h4");
    sectionTitle.id = host+"title";
    sectionTitle.appendChild(document.createTextNode(host));

    hostdiv.style.borderBottom = "2px solid #f1f1f1";
    hostdiv.style.paddingBottom = "10px";


    let label_host = document.createElement("label");
    let checkbox_host = document.createElement("input");
    checkbox_host.type = "checkbox";    // make the element a checkbox
    checkbox_host.id = host + "checkbox";
    checkbox_host.name = host + "checkbox";      // give it a name we can check on the server side
    checkbox_host.value = host;
    label_host.appendChild(checkbox_host);   // add the box to the element
    sectionTitle.appendChild(label_host);

    //in the title we have the host name + the checkbox, we want to add a hide button for the urls
    let contentdiv = document.createElement("div");
    contentdiv.id = host;
    contentdiv.style.display = "none";

    hostdiv.appendChild(sectionTitle);
    hostdiv.appendChild(contentdiv);

    let hideButton = document.createElement("input");
    hideButton.type = "button";
    hideButton.value = "v";
    hideButton.className = "unfoldBtn";
    hideButton.onclick = function(){
        if(document.getElementById(host).style.display == "none"){
            document.getElementById(host).style.display = "block";
        }
        else {
            document.getElementById(host).style.display = "none";
        }
    };

    sectionTitle.appendChild(hideButton);

    document.getElementById('blocked_urls').appendChild(hostdiv);


    checkbox_host.addEventListener( 'change', function() {
    if(this.checked) {
        browser.runtime.sendMessage({method: 'add_host_exception', data: checkbox_host.value});
    } else {
        browser.runtime.sendMessage({method: 'delete_host_exception', data: checkbox_host.value});
        };
    });
}


function createURLCheckbox(item){
    // create the necessary elements
    let label= document.createElement("label");
    //let description = document.createTextNode(item.url);
    let checkbox = document.createElement("input");

    checkbox.type = "checkbox";    // make the element a checkbox
    checkbox.name = "checkbox:"+ item.url;      // give it a name we can check on the server side
    checkbox.value = item.url;         // make its value "pair"
    checkbox.checked = item.check;

    label.appendChild(checkbox);   // add the box to the element
    label.appendChild(document.createTextNode(item.url)); // add the description to the element
    label.appendChild(document.createElement("br"));

    // add the label element to your div
    document.getElementById(item.host).appendChild(label);

    checkbox.addEventListener( 'change', function() {
    if(this.checked) {
        browser.runtime.sendMessage({method: 'add_url_exception', data: checkbox.value});
    } else {
        browser.runtime.sendMessage({method: 'delete_url_exception', data: checkbox.value});
    }
});
};

function get_allowed_hosts(){
    browser.runtime.sendMessage({method: 'get_allowed_hosts'}, function(response) {
        //alert(JSON.stringify(response));
        if(response && response.length > 0){
            for (let i in response){
                    checkbox = document.getElementById(response[i]+"checkbox");
                    if(checkbox != null){
                        checkbox.checked = true;
                    }
                }
            }
        });
};


function get_blocked_urls(){
    browser.runtime.sendMessage({method: 'get_blocked_urls'}, function(response) {
        //alert(JSON.stringify(response));
        if(response && response.length > 0){
            let host_array = [];
            for (let i in response){//blocked urls are divided by sections
                url = response[i];
                if(!host_array.includes(url.host)){
                    host_array.push(url.host);
                    create_host_section(url.host);
                }
                createURLCheckbox(url);
            }
            document.getElementById('blocked_urls').appendChild(document.createElement("br"));
            let auxMessage= document.createTextNode("Changes will be applied after reloading the page");
            document.getElementById('blocked_urls').appendChild(auxMessage);
        }
        else{
            document.getElementById('blocked_urls').appendChild(document.createElement("br"));
            document.getElementById('blocked_urls').appendChild(document.createTextNode("There are no blocked urls in this tab"));
        }
        document.getElementById('blocked_urls').appendChild(document.createElement("br"));
        document.getElementById('blocked_urls').appendChild(document.createElement("br"));
	});
};

function checkEnabled(){
    onoffButton = document.getElementById('onoffButton');

    browser.runtime.sendMessage({method:'get_enabled'}, function(response){
        onoffButton.checked = response;
    });

    onoffButton.addEventListener('change', function() {
        browser.runtime.sendMessage({method: 'filterCheck', data: onoffButton.checked});
    });
};

function checkSave_allowed(){
    saveButton = document.getElementById('saveButton');

    browser.runtime.sendMessage({method:'get_enabled_SA'}, function(response){
        saveButton.checked = response;
    });

    saveButton.addEventListener('change', function() {
        browser.runtime.sendMessage({method: 'save_allowed_changed', data: saveButton.checked});
    });
};


// Run our script as soon as the document's DOM is ready.
document.addEventListener('DOMContentLoaded', function () {

    checkEnabled();

    checkSave_allowed();

});


get_blocked_urls();

get_allowed_hosts();
