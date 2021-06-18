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

/*

*/
// Run our script as soon as the document's DOM is ready.
document.addEventListener('DOMContentLoaded', function () {
    getWhitelists();
    getBlockingMode();
    getSettings();
});

function setDebug(e) {
    browser.runtime.sendMessage({method: 'set_debug', data: e.target.checked})
}

function setOnlyScript(e) {
    browser.runtime.sendMessage({method: 'set_only_scripts', data: e.target.checked})
}

function getSettings() {
    debug_element = document.getElementById("debug_button");
    browser.runtime.sendMessage({method:'get_debug'}, function(response) {
        debug_element.checked = response
    })
    debug_element.addEventListener('change',setDebug)

    only_script_element = document.getElementById("only_script_button");
    browser.runtime.sendMessage({method:'get_only_scripts'}, function(response) {
        only_script_element.checked = response
    })
    only_script_element.addEventListener('change',setOnlyScript)

}

///////////////// AI BLOCK WHITELIST /////////////////

var blocking_mode_btns = document.getElementsByName('mode');
//var selected_blocking_mode = blocking_mode_btns[0]

function getBlockingMode() {
    browser.runtime.sendMessage({method:'get_blocking_mode'}, function(response){
        console.debug("blocking mode response is " + response)
        if (response == "weak") {
            var selected_round_button = document.getElementById("mode_weak");
            selected_round_button.checked = true;
        } else if (response == "normal") {
            var selected_round_button = document.getElementById("mode_normal");
            selected_round_button.checked = true;
        } else if (response == "hard") {
            var selected_round_button = document.getElementById("mode_hard");
            selected_round_button.checked = true
        } else if (response == "extreme") {
            selected_round_button = document.getElementById("mode_extreme");
            selected_round_button.checked = true;
        }
        selected_blocking_mode = selected_round_button
    });
}

for (var i = 0; i < blocking_mode_btns.length; i++) {
    blocking_mode_btns[i].addEventListener('change',update_blockmode)
}

function update_blockmode(e) {
    browser.runtime.sendMessage({method: 'set_blocking_mode', data: e.target.value});
    
} 

///////////////// PERMANENT WHITELIST /////////////////

///////// Page load.
//insert content into the whitelist text elements. the textbox will be filled by
//the hosts the user has whitelisted.
function getWhitelists(){
    whitelist_element = document.getElementById("permanent_whitelist");

    browser.runtime.sendMessage({method:'get_allowed_hosts'}, function(response){
        text_content = ""
        for (var i = 0; i < response.length; ++i) {
            text_content += response[i];
            if (i != response.length - 1) {
                text_content += '\n';
            }
        }
        whitelist_element.value = text_content;
    });

};

///////// Set listeners 
var permanent_whitelist = document.getElementById("permanent_whitelist");
permanent_whitelist.addEventListener('change',update_permanent);

//Update permanent whitelist function
function update_permanent(e) {
    if (e.target.id == "permanent_whitelist") {
        if (e.target.value) {
            console.debug("updating permanent whitelist")
            for (var i = 0; i < e.target.value.split('\n').length; ++i) {
                console.debug(e.target.value.split('\n')[i])
            }
            browser.runtime.sendMessage({method: 'set_permanent_whitelist', data: e.target.value.split('\n')})
        }    
    }
}

///////////////// SESSION WHITELIST /////////////////
var temp_whitelist = document.getElementById("temp_whitelist");
temp_whitelist.addEventListener('change', update_temp);

//Update temporal (session) whitelist function
function update_temp(e) {
    if (e.target.value) {
        for (var i = 0; i < e.target.value.split('\n').length; ++i) {
            console.debug(e.target.value.split('\n')[i])
        }
        browser.runtime.sendMessage({method: 'set_session_whitelist', data: e.target.value.split('\n')})
    }
}
