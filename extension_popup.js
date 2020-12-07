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
    let div = document.createElement("div");
    div.id = host;

    let sectionTitle = document.createElement("h3");
    sectionTitle.appendChild(document.createTextNode("Host: " + host));
    div.appendChild(sectionTitle);

    let label_host = document.createElement("label");
    let checkbox_host = document.createElement("input");
    checkbox_host.type = "checkbox";    // make the element a checkbox
    checkbox_host.id = host+"checkbox";
    checkbox_host.name = host + "checkbox";      // give it a name we can check on the server side
    checkbox_host.value = host;
    label_host.appendChild(checkbox_host);   // add the box to the element
    sectionTitle.appendChild(label_host);

    document.getElementById('blocked_urls').appendChild(div);

    checkbox_host.addEventListener( 'change', function() {
    if(this.checked) {
        chrome.extension.sendRequest({method: 'add_host_exception', data: checkbox_host.value}, function(response) {});
    } else {
        chrome.extension.sendRequest({method: 'delete_host_exception', data: checkbox_host.value}, function(response) {});
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
        chrome.extension.sendRequest({method: 'add_url_exception', data: checkbox.value}, function(response) {});
    } else {
        chrome.extension.sendRequest({method: 'delete_url_exception', data: checkbox.value}, function(response) {});
    }
});
};

function get_allowed_hosts(){
    chrome.extension.sendRequest({method: 'get_allowed_hosts'}, function(response) {
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
    chrome.extension.sendRequest({method: 'get_blocked_urls'}, function(response) {
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
        }
        else{
            document.getElementById('blocked_urls').appendChild(document.createTextNode("There are no blocked urls in this tab"));
        }
	});
};

function checkEnabled(){
    onoffButton = document.getElementById('onoffButton');

    chrome.extension.sendRequest({method:'get_enabled'}, function(response){
        onoffButton.checked = response;
    });

    onoffButton.addEventListener( 'change', function() {
        chrome.extension.sendRequest({method: 'filterCheck', data: onoffButton.checked}, function(response) {});
    });
};

// Add listener to receive messages from background page
//chrome.extension.onRequest.addListener(function(request, sender, sendResponse) {
//	switch (request.method)
//	{
//	}
//});

// Run our script as soon as the document's DOM is ready.
document.addEventListener('DOMContentLoaded', function () {

    checkEnabled();

	get_blocked_urls();

    get_allowed_hosts();

	// Attach onclick event to button
	//$("#add-ten-to-ticker").click( function() {
	//	localTicker.addToTicker(10);
	//});
});
