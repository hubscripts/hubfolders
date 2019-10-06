// ==UserScript==
// @name         Hub Folders
// @namespace    http://tampermonkey.net/
// @version      0.83
// @description  Adds support for grouping repos into folders on Github
// @license      MIT
// @author       hubscripts
// @match        https://github.com/*
// @grant        unsafeWindow
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_getResourceText
// @grant        GM.setValue
// @grant        GM.getValue
// @connect      raw.githubusercontent.com
// @icon         https://github.githubassets.com/pinned-octocat.svg
// @require      https://ajax.googleapis.com/ajax/libs/jquery/3.3.1/jquery.min.js
// @require      https://cdn.jsdelivr.net/gh/deplorable/js-yaml@master/dist/js-yaml.min.js
// @require      https://raw.githubusercontent.com/deplorable/json2yaml/master/src/json2yaml.js
// @require      https://unpkg.com/@github/details-dialog-element@latest
// @require      https://cdn.jsdelivr.net/gh/deplorable/slinky-for-hubfolders@master/dist/slinky.min.js
// @require      https://raw.githubusercontent.com/PulsarBlow/everest.js/master/dist/everest.min.js
// @resource     slinky_css https://cdn.jsdelivr.net/gh/deplorable/slinky-for-hubfolders@master/dist/slinky.min.css
// @run-at       document-end
// ==/UserScript==

/* globals $,unsafeWindow,jsyaml,ê */

window.folderbrowse_debug = false;
window.folderbrowse_settings_backup = null;
window.folderbrowse_settings = []; //default is empty

/*
    {
        accessToken : "xxxxxxxxx",
        repositoryName: 'username/reponame'
        //folderSettingsURL : calculated by the processSettingsData
        //yamlDataRetrieved : stored by receiveMessageInternal
    }
*/


//window.folderbrowse_settings_computed = []; //this will be used to store computed info
window.folderbrowse_settings_minrows = 1;
window.folderbrowse_settings_rows = 1;

async function loadFolderBrowseSettings(githubUsername) {
  if (githubUsername != "") {
      if (window.folderbrowse_debug) console.log("loadFolderBrowseSettings() for username: "+githubUsername+" ...");
      var theSettings = await GM.getValue("HubFolderBrowseSettings_"+githubUsername);
      if (window.folderbrowse_debug) console.log(theSettings);
      if (window.folderbrowse_debug) console.log(typeof theSettings);
      if (typeof theSettings == "string") {
          window.folderbrowse_settings = JSON.parse(theSettings);
          //window.folderbrowse_settings = theSettingsObject;
      }
      else {
          //setup a blank entry
          window.folderbrowse_settings = [{
              accessToken : "",
              repositoryName: ''
          }];
      }
      if (window.folderbrowse_debug) console.log(window.folderbrowse_settings);
  }
  else {
      //not logged in, or cannot find the username
  }
}

async function saveFolderBrowseSettings(githubUsername) {
    if (window.folderbrowse_debug) console.log("saveFolderBrowseSettings() for username: "+githubUsername+" ...");
    var clean_folderbrowse_settings = [];
    for (var i=0; i<window.folderbrowse_settings.length; i++) {
        if (window.folderbrowse_debug) console.log("saveFolderBrowseSettings row#"+i);
        clean_folderbrowse_settings.push({
            accessToken: window.folderbrowse_settings[i].accessToken,
            repositoryName: window.folderbrowse_settings[i].repositoryName
        });
    }

    await GM.setValue("HubFolderBrowseSettings_"+githubUsername, JSON.stringify(clean_folderbrowse_settings));
    if (window.folderbrowse_debug) console.log("saveFolderBrowseSettings... done");
}

(function() {
    'use strict';

    var settingsAreValid = false;
    var addFolderIsValid = false;
    var addRepoIsValid = false;
    var currentFolderIndexes = "-";


    function GM_wait()
    {
      if(typeof unsafeWindow.jQuery == 'undefined') {
        window.setTimeout(GM_wait,100);
      }
      else {
        unsafeWindow.jQuery(function() { usingJQuery(unsafeWindow.jQuery); });
      }
    }
    GM_wait();

    async function usingJQuery($) {

        //var cssBootstrap  = GM_getResourceText ("bootstrap_css");
        //GM_addStyle (cssBootstrap);

        var slinky = null;
        var activeUsername = "";

        var cssTxt = GM_getResourceText("slinky_css");
        GM_addStyle (cssTxt);


        function getUsername() {
            var rawUsername = $('summary img.avatar').attr('alt');
            if (typeof rawUsername != "undefined") {
              window.theGithubUsername = rawUsername.substring(1);
              if (window.folderbrowse_debug) console.log(window.theGithubUsername);
            }
            else {
                window.theGithubUsername = "";
            }
            return window.theGithubUsername;
        }

        function processSettingsData() {
            for (var t=0; t<window.folderbrowse_settings.length; t++) {
                var theRowID = "folderbrowse_settings_row_"+t;
                var theRowObject = window.folderbrowse_settings[t];
                var theRepoToken = "";
                var theRepoName = "";
                if (typeof theRowObject == "object") {
                    if (typeof theRowObject.accessToken == "string") {
                        theRepoToken = theRowObject.accessToken;
                    }
                    if (typeof theRowObject.repositoryName == "string") {
                        theRepoName = theRowObject.repositoryName;
                    }
                }
                if (theRepoName != "") {
                    var theCalculatedFolderSettingsURL = "https://raw.githubusercontent.com/"+theRepoName+"/master/hubfolders.yaml";
                    window.folderbrowse_settings[t].folderSettingsURL = theCalculatedFolderSettingsURL;
                }
                else {
                    window.folderbrowse_settings[t].folderSettingsURL = "";
                }
            }
        }

        function requestFolderSetting(settingIndex = -1) {
            if (window.folderbrowse_debug) console.log("requestFolderSetting()... for index:"+settingIndex);
            var folder_yaml_url = window.folderbrowse_settings[settingIndex].folderSettingsURL;
            var folder_reponame = window.folderbrowse_settings[settingIndex].repositoryName;
            var folder_yaml_token = window.folderbrowse_settings[settingIndex].accessToken;
            if (folder_yaml_url != "") {
                //var theYAML = "";
                var messageTxt  = JSON.stringify ({
                    "action" : "fetchURL",
                    "parameters" : folder_yaml_url,
                    "setting_entry_num" : settingIndex,
                    "reponame" : folder_reponame,
                    "headers": {
                        "Authorization" : "token "+folder_yaml_token
                    }
                });
                window.postMessage (messageTxt, "*");
            }
            if (window.folderbrowse_debug) console.log("requestFolderSetting()... done for index:"+settingIndex);
        }

        function saveFolderSetting(settingIndex = -1) {
            if (window.folderbrowse_debug) console.log("saveFolderSetting()... for index:"+settingIndex);
            var folder_yaml_url = window.folderbrowse_settings[settingIndex].folderSettingsURL;
            var folder_reponame = window.folderbrowse_settings[settingIndex].repositoryName;
            var folder_yaml_token = window.folderbrowse_settings[settingIndex].accessToken;
            var folder_yaml_data = window.folderbrowse_settings[settingIndex].yamlDataRetrieved;
            //alert(folder_yaml_data);
            if (folder_yaml_url != "") {
                //var theYAML = "";
                var messageTxt  = JSON.stringify ({
                    "action" : "saveYAML",
                    "parameters" : folder_yaml_url,
                    "setting_entry_num" : settingIndex,
                    "reponame" : folder_reponame,
                    "newYAMLData": folder_yaml_data,
                    "headers": {
                        "Authorization" : "token "+folder_yaml_token
                    }
                });
                window.postMessage (messageTxt, "*");
            }
            if (window.folderbrowse_debug) console.log("saveFolderSetting()... done for index:"+settingIndex);
        }


        function requestFolderSettings() {
            if (window.folderbrowse_debug) console.log("requestFolderSettings()...");
            for (var t=0; t<window.folderbrowse_settings.length; t++) {
                requestFolderSetting(t);
            }
            if (window.folderbrowse_debug) console.log("requestFolderSettings()... done.");
        }

        function getSidebarFolders() {
            var theViewButton = '<a id="sidebar-browse-folders" class="btn btn-sm btn-secondary" href="#">';
            theViewButton += ' Browse';
            theViewButton += '</a>';

            var theHTML = '<div class="js-repos-container folder-tree mb-3" data-pjax-container="">';
            theHTML += '<h2 class="f4 hide-sm hide-md mb-1 mt-4 f5 d-flex flex-justify-between flex-items-center">Folders '+theViewButton+'</h2>';
            theHTML += '</div>';
            return theHTML;
        }

        /*function dashboard_hideExplore() {
            $("aside[aria-label='Explore']").hide();
        }*/

        function getIconSVG_Popout() {
            return '<svg style="bottom:-3px;position:relative; color:#0366d6;" height="14" viewBox="0 0 48 48" width="16" xmlns="http://www.w3.org/2000/svg"><path d="M0 0h48v48H0z" fill="none"/><path d="M38 38H10V10h14V6H10c-2.21 0-4 1.79-4 4v28c0 2.21 1.79 4 4 4h28c2.21 0 4-1.79 4-4V24h-4v14zM28 6v4h7.17L15.51 29.66l2.83 2.83L38 12.83V20h4V6H28z"/></svg>';
        }

        function getIconSVG_Folder() {
            return '<svg class="octicon octicon-file-directory" viewBox="0 0 14 16" version="1.1" width="14" height="16" aria-hidden="true"><path fill-rule="evenodd" d="M13 4H7V3c0-.66-.31-1-1-1H1c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1V5c0-.55-.45-1-1-1zM6 4H1V3h5v1z"></path></svg>';
        }

        function getIconSVG_Cog() {
            return '<svg class="octicon octicon-gear" viewBox="0 0 14 16" version="1.1" width="14" height="16" aria-hidden="true"><path fill-rule="evenodd" d="M14 8.77v-1.6l-1.94-.64-.45-1.09.88-1.84-1.13-1.13-1.81.91-1.09-.45-.69-1.92h-1.6l-.63 1.94-1.11.45-1.84-.88-1.13 1.13.91 1.81-.45 1.09L0 7.23v1.59l1.94.64.45 1.09-.88 1.84 1.13 1.13 1.81-.91 1.09.45.69 1.92h1.59l.63-1.94 1.11-.45 1.84.88 1.13-1.13-.92-1.81.47-1.09L14 8.75v.02zM7 11c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3z"></path></svg>';
        }

        function getIconSVG_Repository() {
            return '<svg aria-label="Repository" class="octicon octicon-repo flex-shrink-0" viewBox="0 0 12 16" version="1.1" width="12" height="16" role="img"><path fill-rule="evenodd" d="M4 9H3V8h1v1zm0-3H3v1h1V6zm0-2H3v1h1V4zm0-2H3v1h1V2zm8-1v12c0 .55-.45 1-1 1H6v2l-1.5-1.5L3 16v-2H1c-.55 0-1-.45-1-1V1c0-.55.45-1 1-1h10c.55 0 1 .45 1 1zm-1 10H1v2h2v-1h3v1h5v-2zm0-10H2v9h9V1z"></path></svg>';
        }

        function getIconSVG_Star() {
            return '<svg class="octicon octicon-star v-align-text-bottom" viewBox="0 0 14 16" version="1.1" width="14" height="16" aria-hidden="true"><path fill-rule="evenodd" d="M14 6l-4.9-.64L7 1 4.9 5.36 0 6l3.6 3.26L2.67 14 7 11.67 11.33 14l-.93-4.74L14 6z"></path></svg>';
        }

        function getIconSVG_Cross() {
            return '<svg class="octicon octicon-x" viewBox="0 0 12 16" version="1.1" width="12" height="16" aria-hidden="true"><path fill-rule="evenodd" d="M7.48 8l3.75 3.75-1.48 1.48L6 9.48l-3.75 3.75-1.48-1.48L4.52 8 .77 4.25l1.48-1.48L6 6.52l3.75-3.75 1.48 1.48L7.48 8z"></path></svg>';
        }

        /*function repository_parentFolderButton() {
            var theHTML = "<li><a href='#' class='btn btn-sm'>"+getIconSVG_Folder()+" Parent Folders</a></li>";
            $('ul.pagehead-actions').prepend($(theHTML));
        }*/

        function folderButtonForHeader() {
            var theHTML = '<div class="Header-item mr-2 mr-sm-2 mr-md-2 mr-lg-3 flex-order-1 flex-lg-order-none">';
            theHTML += renderFolderBrowseDialog();
            theHTML += '<a aria-label="Browse Folders" class="Header-link folderbrowse-launcher position-relative tooltipped tooltipped-s js-socket-channel js-folderbrowse-launcher" data-hotkey="g f" data-ga-click="Header, browse folders, icon:read" data-channel="" href="#">';
            theHTML += '<span class="mail-status "></span>';
            theHTML += getIconSVG_Folder();
            theHTML += '</a>';
            theHTML += '</div>';
            $(theHTML).insertBefore($('.Header-link.notification-indicator.js-notification-indicator').parent());
            $('.folderbrowse-launcher').click(function () {
                openFolderBrowseDialog();
            });

            $('#sidebar-browse-folders').click(function() {
                openFolderBrowseDialog();
            });

            $('#btn-folderbrowse-addrepositorytofolder').click(function() {
              //alert('You can only add repositories by editing your hubfolders.yaml files directly at this stage!');
                folderBrowseDialog_addRepoMode();
            });

            $('#btn-folderbrowse-addnewfolder').click(function() {
                folderBrowseDialog_addFolderMode();
              //alert('You can only add folders by editing your hubfolders.yaml files directly at this stage!');
            });

            $('#btn-folderbrowse-edititems').click(function() {
                //folderBrowseDialog_addFolderMode();
                alert('Editing items and folders is not implemented at this stage!');
              //alert('You can only add folders by editing your hubfolders.yaml files directly at this stage!');
            });

            $('#btn-folderbrowse-settings').click(function() {
              folderBrowseDialog_settingsMode();
            });

            // settings page
            $('#btn-folderbrowse-savesettings').click(function() {
                folderBrowseDialog_saveSettings();
            });

            $('#btn-folderbrowse-cancelsettings').click(function() {
                folderBrowseDialog_cancelSettings();
            });

            //add folder page
            $('#btn-folderbrowse-addfolder-confirm').click(function() {
                folderBrowseDialog_addFolderConfirmed();
            });

            $('#btn-folderbrowse-addfolder-cancel').click(function() {
                folderBrowseDialog_cancelAddFolder();
            });

            //add repo page
            $('#btn-folderbrowse-addrepo-confirm').click(function() {
                folderBrowseDialog_addRepoConfirmed();
            });

            $('#btn-folderbrowse-addrepo-cancel').click(function() {
                folderBrowseDialog_cancelAddRepo();
            });

        }

        function folderBrowseDialog_cancelAddFolder() {
            if (emptySettings == true) {
                folderBrowseDialog_noSettingsMode();
            }
            else {
                folderBrowseDialog_defaultMode();
                var theYAML_JSON = window.folderbrowse_settings[0].yamlDocumentJSON;
                replaceFolderTreeWithJSON(theYAML_JSON);
            }
        }

        function folderBrowseDialog_cancelAddRepo() {
            if (emptySettings == true) {
                folderBrowseDialog_noSettingsMode();
            }
            else {
                folderBrowseDialog_defaultMode();
                var theYAML_JSON = window.folderbrowse_settings[0].yamlDocumentJSON;
                replaceFolderTreeWithJSON(theYAML_JSON);
            }
        }


        function addNewFolderAtIndexLocation(theFolderSettingsJSONTreeFolders, folderName, indexArrayOfInt) {
            if (window.folderbrowse_debug) console.log('addNewFolderAtIndexLocation()...');
            if (window.folderbrowse_debug) console.log(indexArrayOfInt);
            if (window.folderbrowse_debug) console.log(folderName);
            var foundIt = false;

            //for (var s=0; s<indexArrayOfInt.length; s++) {
            var s = 0;
            if (typeof indexArrayOfInt[s] != "undefined") {
                var currentIndex = indexArrayOfInt[s];
                if (window.folderbrowse_debug) console.log("Looking in index #"+currentIndex);
                var currentFolder = theFolderSettingsJSONTreeFolders[currentIndex];
                if (indexArrayOfInt.length > 1) { //we need to look into subfolders
                    var anotherIndexArrayOfInt = indexArrayOfInt.slice(1);
                    var folderKeys = Object.keys(currentFolder);
                    if (window.folderbrowse_debug) console.log(folderKeys);
                    if (folderKeys.length == 1) {
                        var theFolderKey = folderKeys[0];
                        if (theFolderSettingsJSONTreeFolders[currentIndex][theFolderKey] == null) {
                            theFolderSettingsJSONTreeFolders[currentIndex][theFolderKey] = [];
                        }
                        theFolderSettingsJSONTreeFolders[currentIndex][theFolderKey] = addNewFolderAtIndexLocation(theFolderSettingsJSONTreeFolders[currentIndex][theFolderKey], folderName, anotherIndexArrayOfInt);
                    }
                }
                else if (indexArrayOfInt.length == 1) { //this is the right folder to add to
                    foundIt = true;
                    var folderKeys = Object.keys(currentFolder);
                    if (window.folderbrowse_debug) console.log(folderKeys);
                    if (folderKeys.length == 1) {
                        var theFolderKey = folderKeys[0];
                        var folderObj = {};
                        folderObj[folderName] = "";
                        if (theFolderSettingsJSONTreeFolders[currentIndex][theFolderKey] == null) {
                            theFolderSettingsJSONTreeFolders[currentIndex][theFolderKey] = [];
                        }
                        theFolderSettingsJSONTreeFolders[currentIndex][theFolderKey].push(folderObj);
                    }
                }
                if (window.folderbrowse_debug) console.log(currentFolder);
            }
            //}

            return theFolderSettingsJSONTreeFolders;
        }

        function addNewRepoAtIndexLocation(theFolderSettingsJSONTreeFolders, repoName, indexArrayOfInt) {
            if (window.folderbrowse_debug) console.log('addNewRepoAtIndexLocation()...');
            if (window.folderbrowse_debug) console.log(indexArrayOfInt);
            if (window.folderbrowse_debug) console.log(repoName);
            var foundIt = false;

            //for (var s=0; s<indexArrayOfInt.length; s++) {
            var s = 0;
            if (typeof indexArrayOfInt[s] != "undefined") {
                var currentIndex = indexArrayOfInt[s];
                if (window.folderbrowse_debug) console.log("Looking in index #"+currentIndex);
                var currentFolder = theFolderSettingsJSONTreeFolders[currentIndex];
                if (indexArrayOfInt.length > 1) { //we need to look into subfolders
                    var anotherIndexArrayOfInt = indexArrayOfInt.slice(1);
                    var folderKeys = Object.keys(currentFolder);
                    if (window.folderbrowse_debug) console.log(folderKeys);
                    if (folderKeys.length == 1) {
                        var theFolderKey = folderKeys[0];
                        if (theFolderSettingsJSONTreeFolders[currentIndex][theFolderKey] == null) {
                            theFolderSettingsJSONTreeFolders[currentIndex][theFolderKey] = [];
                        }
                        theFolderSettingsJSONTreeFolders[currentIndex][theFolderKey] = addNewRepoAtIndexLocation(theFolderSettingsJSONTreeFolders[currentIndex][theFolderKey], repoName, anotherIndexArrayOfInt);
                    }
                }
                else if (indexArrayOfInt.length == 1) { //this is the right folder to add to
                    foundIt = true;
                    var folderKeys = Object.keys(currentFolder);
                    if (window.folderbrowse_debug) console.log(folderKeys);
                    if (folderKeys.length == 1) {
                        var theFolderKey = folderKeys[0];
                        //var folderObj = {};
                        //folderObj[folderName] = "";
                        if (theFolderSettingsJSONTreeFolders[currentIndex][theFolderKey] == null) {
                            theFolderSettingsJSONTreeFolders[currentIndex][theFolderKey] = [];
                        }
                        theFolderSettingsJSONTreeFolders[currentIndex][theFolderKey].push(repoName);
                    }
                }
                if (window.folderbrowse_debug) console.log(currentFolder);
            }
            //}

            return theFolderSettingsJSONTreeFolders;
        }


        function folderBrowseDialog_addFolderConfirmed() {
            var currentTree = JSON.parse(JSON.stringify(window.folderbrowse_settings[0].yamlDocumentJSON));
            var theFolderName = $('#add_folder_name').val();
            if (window.folderbrowse_debug) console.log(theFolderName);
            if (window.folderbrowse_debug) console.log(currentTree);
            var localFolderIndexes = currentFolderIndexes;
            var theSplitIndexes = [];

            if (localFolderIndexes == "-") { //add to the top level
                var theKey = theFolderName+'';
                var folderObj = {};
                folderObj[theKey] = "";
                currentTree.folders.push(folderObj);
            }
            else if (localFolderIndexes.length > 0) {
                var theCommaIndex = localFolderIndexes.indexOf(',');
                if (theCommaIndex > -1) {
                  theSplitIndexes = localFolderIndexes.split(",");
                  for (var t=0; t<theSplitIndexes.length; t++) {
                      theSplitIndexes[t] = parseInt(theSplitIndexes[t], 10);
                  }
                }
                else { //only a single index
                    var theIndex = parseInt(localFolderIndexes, 10);
                    theSplitIndexes = [ theIndex ];
                }

                currentTree.folders = addNewFolderAtIndexLocation(currentTree.folders, theFolderName, theSplitIndexes);
                if (window.folderbrowse_debug) console.log(currentTree);
            }

            var theYAML = json2yaml(currentTree);
            var theYAMLAltered = theYAML.replace(/['"]+/g, '');
            theYAMLAltered = theYAMLAltered.replace(/\\x/g,'%');
            theYAMLAltered = decodeURI(theYAMLAltered);
            theYAMLAltered = theYAMLAltered.replace(/null/g, '');
            if (window.folderbrowse_debug) console.log(theYAMLAltered);
            //update the yaml document
            window.folderbrowse_settings[0].yamlDataRetrieved = theYAMLAltered;

            //parse the yaml document into json format
            var theDoc = jsyaml.load(theYAMLAltered);
            window.folderbrowse_settings[0].yamlDocumentJSON = theDoc;

            //save the data to the relevant repository hubfolders.yaml
            saveFolderSetting(0); //0 is the index of the folderbrowse_settings array we wish to save

            //update the tree view
            if (window.folderbrowse_debug) console.log(theDoc);
            folderBrowseDialog_defaultMode();

            replaceFolderTreeWithJSON(theDoc);
        }

        function folderBrowseDialog_addRepoConfirmed() {
            var currentTree = JSON.parse(JSON.stringify(window.folderbrowse_settings[0].yamlDocumentJSON));
            var theRepoName = $('#add_repo_name').val();
            if (window.folderbrowse_debug) console.log(theRepoName);
            if (window.folderbrowse_debug) console.log(currentTree);
            var localFolderIndexes = currentFolderIndexes;
            var theSplitIndexes = [];

            if (localFolderIndexes == "-") { //add to the top level
                var theRepo = theRepoName+'';
                //var folderObj = {};
                //folderObj[theKey] = "";
                currentTree.folders.push(theRepo);
            }
            else if (localFolderIndexes.length > 0) {
                var theCommaIndex = localFolderIndexes.indexOf(',');
                if (theCommaIndex > -1) {
                  theSplitIndexes = localFolderIndexes.split(",");
                  for (var t=0; t<theSplitIndexes.length; t++) {
                      theSplitIndexes[t] = parseInt(theSplitIndexes[t], 10);
                  }
                }
                else { //only a single index
                    var theIndex = parseInt(localFolderIndexes, 10);
                    theSplitIndexes = [ theIndex ];
                }

                currentTree.folders = addNewRepoAtIndexLocation(currentTree.folders, theRepoName, theSplitIndexes);
                if (window.folderbrowse_debug) console.log(currentTree);
            }

            var theYAML = json2yaml(currentTree);
            var theYAMLAltered = theYAML.replace(/['"]+/g, '');
            theYAMLAltered = theYAMLAltered.replace(/\\x/g,'%');
            theYAMLAltered = decodeURI(theYAMLAltered);
            if (window.folderbrowse_debug) console.log(theYAMLAltered);
            //update the yaml document
            window.folderbrowse_settings[0].yamlDataRetrieved = theYAMLAltered;

            //parse the yaml document into json format
            var theDoc = jsyaml.load(theYAMLAltered);
            window.folderbrowse_settings[0].yamlDocumentJSON = theDoc;

            //save the data to the relevant repository hubfolders.yaml
            saveFolderSetting(0); //0 is the index of the folderbrowse_settings array we wish to save

            //update the tree view
            if (window.folderbrowse_debug) console.log(theDoc);
            folderBrowseDialog_defaultMode();
            replaceFolderTreeWithJSON(theDoc);

        }

        function folderBrowseDialog_saveSettings() {
            //first, backup existing settings by cloning it
            window.folderbrowse_settings_backup = JSON.parse(JSON.stringify(window.folderbrowse_settings));

            //then save the new settings
            if (window.folderbrowse_debug) console.log("folderBrowseDialog_saveSettings()...");
            window.folderbrowse_settings = [];
            for (var t=0; t<window.folderbrowse_settings_rows; t++) {
                var theRowID = "folderbrowse_settings_row_" + t;
                var theRepoName = $('#reponame_'+theRowID).val();
                var theRepoToken = $('#repotoken_'+theRowID).val();
                window.folderbrowse_settings.push({
                     accessToken: theRepoToken,
                     repositoryName: theRepoName
                });
            }
            //save the settings using GM_setValue
            //saveFolderBrowseSettings();
            //process the new settings data so it is ready for retrieval
            processSettingsData();
            saveFolderBrowseSettings(); //save them in the browser
            //request the settings from the hubfolders.yaml files in each of the settings rows
            requestFolderSettings();

            //folderBrowseDialog_defaultMode();
            //var theYAML_JSON = window.folderbrowse_settings[0].yamlDocumentJSON;
            //requestFolderSettings();
            //replaceFolderTreeWithJSON(theYAML_JSON);

        }

        function folderBrowseDialog_cancelSettings() {
            if (window.folderbrowse_settings_backup != null) {
                delete window.folderbrowse_settings;
                window.folderbrowse_settings = JSON.parse(JSON.stringify(window.folderbrowse_settings_backup));
                delete window.folderbrowse_settings_backup;
                window.folderbrowse_settings_backup = null;
            }
            if (emptySettings == true) {
                folderBrowseDialog_noSettingsMode();
            }
            else {
                folderBrowseDialog_defaultMode();
                var theYAML_JSON = window.folderbrowse_settings[0].yamlDocumentJSON;
                replaceFolderTreeWithJSON(theYAML_JSON);
            }
        }

        function foldersSettingsButton() {
            var theHTML = '<div class="Header-item mr-2 mr-sm-2 mr-md-2 mr-lg-3 flex-order-1 flex-lg-order-none">';
            theHTML += renderFolderSettingsDialog();
            theHTML += '<a aria-label="Browse Folders" class="Header-link folderbrowse-launcher position-relative tooltipped tooltipped-s js-socket-channel js-folderbrowse-launcher" data-hotkey="g f" data-ga-click="Header, browse folders, icon:read" data-channel="" href="#">';
            theHTML += '<span class="mail-status "></span>';
            theHTML += getIconSVG_Folder();
            theHTML += '</a>';
            theHTML += '</div>';
            $(theHTML).insertBefore($('.Header-link.notification-indicator.js-notification-indicator').parent());
            $('.folderbrowse-launcher').click(function () {
                openFolderBrowseDialog();
            });

            $('#sidebar-browse-folders').click(function() {
                openFolderBrowseDialog();
            });
        }

        function openFolderBrowseDialog() {
            var details = document.querySelector('details#folderbrowser');
            $(details).attr("open", true);
            if (window.folderbrowse_debug) console.log("openFolderBrowseDialog()");
            //makeSlinky($); //this is important, as it re-renders slinky right after the dialog opens -- which ensures the height of slinky includes all items at the top level -- without this, only the top 5 are visible
            $('#folder-tree-menu').css('height', 'auto');
        }

        function renderSettingsNeedConfiguration() {
            var theUsername = window.theGithubUsername;
            var theReponame = theUsername+"/hubfolders";
            var theSecondURL = "https://github.com/"+theUsername+"/hubfolders/new/master";
            var personalAccessTokenURL = "https://github.com/settings/tokens/new"; //"https://github.com/settings/tokens";
            var theHTML = '<div class="blankslate" style="position:relative;padding:0px;text-align:center;">'+
                '<img src="https://ghicons.github.com/assets/images/light/Pull%20Request.png" alt="" class="mb-3" />' +
                //'<h3 class="mb-1" style="text-align:left; color: #24292e;">Configure Your Folders.</h3>' +
                '<p style="color:#24292e;text-align: left;">HubFolders stores your preferences separately for each GitHub username you use, so ' +
                'each user needs a private repo on Github where their data is saved. If you have a hubfolders repo already, skip to steps #3 or #4. Otherwise, start at #1.</p>' +
                '<p style="text-align:left;color:#24292e;"><a href="https://github.com/new" target="_blank" class="my-3" type="button">1. Create \"hubfolders\" repository '+getIconSVG_Popout()+'</a><br />(make sure you select private repository)<br />' +
                '<a href="'+theSecondURL+'" target="_blank" class="my-3" type="button">2. Commit a new \"hubfolders.yaml\" file to it '+getIconSVG_Popout()+'</a><br />(the file should contain only the word "new" on line 1)<br />' +
                '<a href="'+personalAccessTokenURL+'" target="_blank" class="my-3" type="button">3. Create a Personal Access Token '+getIconSVG_Popout()+'</a><br />(with "repo" and "admin:org" scopes ticked)<br />' +
                '<a href="#" id="step4Link" class="my-3" type="button">4. Enter the token and repo name into your settings.</a><br />(the repo name will be "' + theReponame + '", unless you share a hubfolders repo with members of an org, in which case it would be orgname/hubfolders)<br />' +
                '</p>' +
                '</div>';
            return theHTML;
        }

        function folderDetailString(numsubfolders, numrepos) {
            var theString = "";

            if (numsubfolders == 0) {
              theString += "";
            }
            else if (numsubfolders == 1) {
              theString += "1 subfolder";
            }
            else if (numsubfolders > 1) {
                theString += numsubfolders+" subfolders";
            }

            var addComma = false;

            if (theString.length > 0) {
                addComma = true;
            }

            if (numrepos == 0) {
              theString += "";
            }
            else if (numrepos == 1) {
              if (addComma == true) {
                  theString += ', ';
              }
              theString += "1 repo";
            }
            else if (numrepos > 1) {
              if (addComma == true) {
                  theString += ', ';
              }
              theString += numrepos+" repos";
            }

            if (theString.length == 0) {
                theString = "Empty";
            }


            return theString;
        }

        function renderFolderTreeFromJSON(theJSON) {
            if (window.folderbrowse_debug) console.log("renderFolderTreeFromJSON()...");
            var theHTML = `<div id="folder-tree-menu" style="height: 350px;"><ul>`;
            var theItems = theJSON.folders;
            for (var i=0; i<theItems.length; i++) {
                var theItem = theItems[i];
                var theKeys = [];
                //console.log(typeof theItem);
                if (typeof theItem == "undefined") {}
                else if (typeof theItem == "object") {
                    theKeys = Object.keys(theItem);

                    for (var u=0; u<theKeys.length; u++) {
                        if (window.folderbrowse_debug) console.log(i);
                        var tbResult = renderTreeBranchFromJSON(theItem, i+"");
                        //console.log(tbResult.numsubfolders);
                        //console.log(tbResult.numrepos);
                        var folderDetails = folderDetailString(tbResult.numsubfolders, tbResult.numrepos);


                        var childInfo = '<span class="" style="display: block; font-weight:normal !important; color:#999; padding-left:23px;line-height: 0.5;"><br>'+folderDetails+'</span>';
                        theHTML += '<li>';
                        theHTML += '<a href="#" style="text-decoration: none;">'+getIconSVG_Folder()+'<span class="ml-2 text-bold">'+'<span class="foldername" data-itemindexes="'+i+'">'+theKeys[u]+'</span>'+childInfo+'</span></a>';

                        theHTML += tbResult.html;
                        theHTML += '</li>';
                    }
                }
                else if (typeof theItem == "string") {
                    //console.log(i);
                    theHTML += '<li>';
                    var theRepoURL = "https://github.com/"+theItem;
                    theHTML += '<a href="'+theRepoURL+'" style="text-decoration: none;">'+getIconSVG_Repository()+'<span class="ml-2 text-bold">'+'<span class="reponame" data-itemindexes="'+i+'">'+theItem+'</span></span></a>';
                    theHTML += '</li>';
                    //numRepos++;

                }
            }
            theHTML += `</ul></div>`;
            //console.log(theHTML);
            if (window.folderbrowse_debug) console.log("renderFolderTreeFromJSON()... done.");
            return theHTML;
        }

        function renderTreeBranchFromJSON(theJSONFolder, parentIndexes) {
            //console.log(" - renderTreeBranchFromJSON()...");
            //console.log(theJSONFolder);
            var numRepos = 0;
            var numSubfolders = 0;

            var theKeys = [];
            if (typeof theJSONFolder == "undefined") {}
            else if (typeof theJSONFolder == "object") {
                theKeys = Object.keys(theJSONFolder);
            }

            //var theKeys = Object.keys(theJSONFolder);
            if (theKeys.length > 0) {
                var theHTML = `<ul>`;
                for (var aKey in theJSONFolder) {
                    var theArray = theJSONFolder[aKey];
                    //console.log(theArray);
                    if (theArray != null) {
                        for (var i=0; i<theArray.length; i++) {
                            var theItem = theArray[i];
                            //console.log(theItem);
                            var theType = typeof theItem;
                            //console.log(theType);
                            if (theType == "string") {
                                theHTML += '<li>';
                                var theRepoURL = "https://github.com/"+theItem;
                                theHTML += '<a href="'+theRepoURL+'" style="text-decoration: none;">'+getIconSVG_Repository()+'<span class="ml-2 text-bold">'+'<span class="reponame" data-itemindexes="'+(parentIndexes+","+i)+'">'+theItem+'</span></span></a>';
                                theHTML += '</li>';
                                numRepos++;
                            }
                            if (theType == "object") {
                                var theSubfolderKeys = Object.keys(theItem);

                                for (var j=0; j<theSubfolderKeys.length; j++) {
                                    var tbResult = renderTreeBranchFromJSON(theItem, (parentIndexes+","+i));
                                    var numSubfolderRepos = tbResult.numrepos;
                                    var numSubfolderSubfolders = tbResult.numsubfolders;
                                    var folderDetails = folderDetailString(numSubfolderSubfolders, numSubfolderRepos);

                                    var childInfo = '<span class="" style="display: block; font-weight:normal !important; color:#999; padding-left:23px;line-height: 0.5;"><br>'+folderDetails+'</span>';
                                    theHTML += '<li>';
                                    theHTML += '<a href="#"  style="text-decoration: none;">'+getIconSVG_Folder()+'<span class="ml-2 text-bold">'+'<span class="foldername" data-itemindexes="'+(parentIndexes+","+i)+'">'+theSubfolderKeys[j]+'</span>'+childInfo+'</span></a>';
                                    theHTML += tbResult.html;
                                    theHTML += '</li>';
                                    numRepos += numSubfolderRepos;
                                    numSubfolders += numSubfolderSubfolders;
                                }
                                numSubfolders++;

                            }
                        }
                    }
                }
                theHTML += `</ul>`;
            }
            //console.log(" - renderTreeBranchFromJSON()... done.");
            return {html: theHTML, numrepos:numRepos, numsubfolders: numSubfolders};
        }

        function replaceFolderTreeWithJSON(theJSON) {
            if (window.folderbrowse_debug) console.log("replaceFolderTreeWithJSON()");
            var theHTML = renderFolderTreeFromJSON(theJSON);
            var theParent = $('div#folder-tree-menu').parent();
            $('div#folder-tree-menu').remove();
            //console.log('removed');
            $(theParent).html(theHTML);
            makeSlinky($);
            //add handler for when a folder is clicked
            $('#folder-tree-menu a.next').on('click', function() {
                //alert('click');
                //console.log(this);
                var theFolderSpan = $(this).find(".foldername");
                if (typeof theFolderSpan != "undefined") {
                    currentFolderIndexes = theFolderSpan.attr('data-itemindexes');
                }
                else {
                    currentFolderIndexes = "-"
                }

                //console.log(theFolderSpan);
                if (window.folderbrowse_debug) console.log(currentFolderIndexes);
            });

            $('#folder-tree-menu a.back').on('click', function() {
                //alert('click');
                //console.log(this);
                var theFolderSpan = $(this).next("header.title");
                var tempFolderIndexes = "";
                if (typeof theFolderSpan != "undefined") {
                    tempFolderIndexes = theFolderSpan.attr('data-itemindexes');
                    //look for a comma. if not found, we know we are going back to the top level of the tree
                    var lastPos = tempFolderIndexes.lastIndexOf(",");
                    if (lastPos == -1) {
                        currentFolderIndexes = "-"; //we have returned to the top level of the folder tree
                    }
                    else {
                        //look for the last comma, and split the string there, keeping the parts before the comma
                        currentFolderIndexes = tempFolderIndexes.substr(0, lastPos);
                    }
                }
                else {
                    tempFolderIndexes = "-"
                }

                //console.log(theFolderSpan);
                if (window.folderbrowse_debug) console.log(currentFolderIndexes);
            });


        }

        function renderFolderTreeBeforeLoaded() {
            var theHTML = `<div id="folder-tree-menu" style="height: 350px;"></div>`;
            return theHTML;
        }


        function renderUserMenu() {
            var currentUser = activeUsername ? activeUsername : "";
            return '<span style="float: right; font-weight: bold; margin-right: 10px;">'+activeUsername+'</span>';
        }

        function renderFolderBrowseDialog() {
            var theTitle = "Browse Folders...";
            var folderTree = renderFolderTreeBeforeLoaded();
            var theHTML =
                '<details class="details-reset details-with-dialog details-overlay details-overlay-dark mt-4" id="folderbrowser">' +
                '<summary id="folderbrowse-dialog-btn" class="btn" style="display:none;" aria-haspopup="dialog">Dialog</summary>' +
                '<details-dialog class="Box Box--overlay d-flex flex-column details-dialog anim-fade-in fast wide" aria-label="Dialog">' +
                '<div class="Box">' +
                '<div id="folderbrowse-dialog-header" class="Box-header" style="color:black;">' +
                theTitle +

                //close button
                '<button type="button" class="btn" data-close-dialog id="btn-folderbrowse-close" style="float:right; top: -6px;">' + getIconSVG_Cross() + '</button>' +
                //user menu
                renderUserMenu() +
                '</div>' +
                '<div class="Box-body"  id="folderbrowse-dialog-body" style="min-height:350px; max-height: 350px; overflow-y: scroll;">' +
                folderTree+
                '</div>' +
                '<div id="folderbrowse-dialog-footer" class="Box-footer">' +
                //browser page buttons
                '<button type="button" class="btn mr-2 btn-primary" id="btn-folderbrowse-addrepositorytofolder">Add Repository</button>' +
                '<button type="button" class="btn mr-2 btn-secondary" id="btn-folderbrowse-addnewfolder">Add Folder</button>' +
                '<button type="button" class="btn mr-2 btn-secondary" id="btn-folderbrowse-edititems">Edit</button>' +
                '<button type="button" class="btn mr-2 btn-secondary" id="btn-folderbrowse-settings">' + getIconSVG_Cog() + ' Settings</button>' +
                //settings page buttons
                '<button type="button" class="btn mr-2 btn-primary" id="btn-folderbrowse-savesettings" style="display:none;">Save Settings</button>' +
                '<button type="button" class="btn mr-2 btn-secondary" id="btn-folderbrowse-cancelsettings" style="display:none;">Cancel</button>' +
                //add folder page buttons
                '<button type="button" class="btn mr-2 btn-primary" id="btn-folderbrowse-addfolder-confirm" style="display:none;">Add New Folder</button>' +
                '<button type="button" class="btn mr-2 btn-secondary" id="btn-folderbrowse-addfolder-cancel" style="display:none;">Cancel</button>' +
                //add repo page buttons
                //add folder page buttons
                '<button type="button" class="btn mr-2 btn-primary" id="btn-folderbrowse-addrepo-confirm" style="display:none;">Add Repository</button>' +
                '<button type="button" class="btn mr-2 btn-secondary" id="btn-folderbrowse-addrepo-cancel" style="display:none;">Cancel</button>' +
                '</div>' +
                '</div>' +
                '</details-dialog>' +
                '</details>';
            return theHTML;
        }

        function setDialogTitle(theTitle = "No title") {
            $('#folderbrowse-dialog-header').html(theTitle+'<button type="button" class="btn" data-close-dialog id="btn-folderbrowse-close" style="float:right; top: -6px;">' + getIconSVG_Cross() + '</button>'+renderUserMenu());
        }

        function folderBrowseDialog_defaultMode() {
            $('#folderbrowse-dialog-header').show();
            setDialogTitle("Browse Folders...");
            $('#folderbrowse_settings_container').hide();
            $('#btn-folderbrowse-savesettings').hide();
            $('#btn-folderbrowse-cancelsettings').hide();
            $('#btn-folderbrowse-addfolder-confirm').hide();
            $('#btn-folderbrowse-addfolder-cancel').hide();
            $('#btn-folderbrowse-settings').show();
            $('#btn-folderbrowse-addnewfolder').show();
            $('#btn-folderbrowse-addrepositorytofolder').show();
            $('#btn-folderbrowse-edititems').show();
            $('#btn-folderbrowse-close').show();
            $('#folder-tree-menu').show();

            //add repo
            $('#btn-folderbrowse-addrepo-confirm').hide();
            $('#btn-folderbrowse-addrepo-cancel').hide();


            var folderTreeEmpty = renderFolderTreeBeforeLoaded();
            $('#folderbrowse-dialog-body').html(folderTreeEmpty);
        }

        function folderBrowseDialog_addFolderMode() {
            var theItemIndexes = currentFolderIndexes; //$('#folder-tree-menu header.title:visible').attr('data-itemindexes');
            //alert(theItemIndexes);
            $('#folderbrowse-dialog-header').show();
            setDialogTitle("Add Folder");
            $('#btn-folderbrowse-settings').hide();
            $('#btn-folderbrowse-addnewfolder').hide();
            $('#btn-folderbrowse-addrepositorytofolder').hide();
            $('#btn-folderbrowse-edititems').hide();
            $('#btn-folderbrowse-close').show();
            $('#btn-folderbrowse-savesettings').hide();
            $('#btn-folderbrowse-cancelsettings').hide();
            $('#folder-tree-menu').hide();

            //add repo
            $('#btn-folderbrowse-addrepo-confirm').hide();
            $('#btn-folderbrowse-addrepo-cancel').hide();

            //add folder
            $('#btn-folderbrowse-addfolder-confirm').show();
            $('#btn-folderbrowse-addfolder-confirm').addClass("disabled");
            $('#btn-folderbrowse-addfolder-cancel').show();

            renderAddFolderRows();
            setupAddFolderValidation();
            validateAddFolder();
        }

        function folderBrowseDialog_addRepoMode() {
            var theItemIndexes = currentFolderIndexes; //$('#folder-tree-menu header.title:visible').attr('data-itemindexes');
            //alert(theItemIndexes);
            $('#folderbrowse-dialog-header').show();
            setDialogTitle("Add Repository to Folder");
            $('#btn-folderbrowse-settings').hide();
            $('#btn-folderbrowse-addnewfolder').hide();
            $('#btn-folderbrowse-addrepositorytofolder').hide();
            $('#btn-folderbrowse-edititems').hide();
            $('#btn-folderbrowse-close').show();
            $('#btn-folderbrowse-savesettings').hide();
            $('#btn-folderbrowse-cancelsettings').hide();
            $('#folder-tree-menu').hide();

            //add folder
            $('#btn-folderbrowse-addfolder-confirm').hide();
            $('#btn-folderbrowse-addfolder-cancel').hide();

            //add repo
            $('#btn-folderbrowse-addrepo-confirm').show();
            $('#btn-folderbrowse-addrepo-confirm').addClass("disabled");
            $('#btn-folderbrowse-addrepo-cancel').show();


            renderAddRepoRows();
            setupAddRepoValidation();
            validateAddRepo();
        }



        function folderBrowseDialog_noSettingsMode() {
            $('#folderbrowse-dialog-header').show();
            setDialogTitle("Setup HubFolders for:");
            $('#folderbrowse_settings_container').hide();
            $('#btn-folderbrowse-savesettings').hide();
            $('#btn-folderbrowse-cancelsettings').hide();
            $('#btn-folderbrowse-settings').hide();
            $('#btn-folderbrowse-addnewfolder').hide();
            $('#btn-folderbrowse-addrepositorytofolder').hide();
            $('#btn-folderbrowse-edititems').hide();
            $('#btn-folderbrowse-close').show();
            $('#folder-tree-menu').hide();
            var settingsEmpty = renderSettingsNeedConfiguration();
            $('#folderbrowse-dialog-body').html(settingsEmpty);
            $('#step4Link').on('click', function() {

                folderBrowseDialog_settingsMode();
                validateSettings();
            });
        }

        function folderBrowseDialog_settingsMode() {
            $('#folderbrowse-dialog-header').show();
            setDialogTitle("Folder Settings");
            $('#btn-folderbrowse-settings').hide();
            $('#btn-folderbrowse-addnewfolder').hide();
            $('#btn-folderbrowse-addrepositorytofolder').hide();
            $('#btn-folderbrowse-edititems').hide();
            $('#btn-folderbrowse-close').show();
            $('#btn-folderbrowse-savesettings').show();
            $('#btn-folderbrowse-savesettings').addClass("disabled");
            $('#btn-folderbrowse-cancelsettings').show();
            $('#folder-tree-menu').hide();
            renderSettingsRows();
            setupSettingsValidation();
            validateSettings();
        }

        function setupAddFolderValidation() {
            //console.log("setupAddFolderValidation()...");
            //remove any previous handlers
            $('#add_folder_name').off('keyup');
            $('#add_folder_retry').off('click');
            //create new handlers
            $('#add_folder_name').on('keyup',function() {
               //console.log('keypress');
                $('#add_folder_validation_error').hide();
                validateAddFolder();
            });
            $('#add_folder_retry').on('click', function() {
                $('#add_folder_retry').hide();
                addNewFolderAndSave();
            });
        }

        function setupAddRepoValidation() {
            //console.log("setupAddRepoValidation()...");
            //remove any previous handlers
            $('#add_repo_name').off('keyup');
            $('#add_repo_retry').off('click');
            //create new handlers
            $('#add_repo_name').on('keyup',function() {
               //console.log('keypress');
                $('#add_repo_validation_error').hide();
                validateAddRepo();
            });
            $('#add_repo_retry').on('click', function() {
                $('#add_repo_retry').hide();
                addNewRepoAndSave();
            });
        }

        function validateAddFolder() {
            //console.log("validateAddFolder()...");
            var validRows = 0;
            addFolderIsValid = false;

            var rowValid = true;
            var theRowID = "add_folder_row";
            var theFolderName = $('#add_folder_name').val();
            if (theFolderName == "") {
                rowValid = false;
                $('#add_folder_validation_error').show();
                $('#add_folder_validation_error').html("The folder name needs to be filled in.");
            }
            else {
                $('#add_folder_validation_error').hide();
            }

            if (rowValid == true) {
                validRows++;
                //$('#reponame_error_'+theRowID).hide();
                //$('#repotoken_error_'+theRowID).hide();
            }

            if (validRows == 1) {
                addFolderIsValid = true;
                $('#btn-folderbrowse-addfolder-confirm').removeClass("disabled");
            }
            else {
                addFolderIsValid = false;
                $('#btn-folderbrowse-addfolder-confirm').addClass("disabled");
            }
            //console.log(addFolderIsValid);
        }

        function validateAddRepo() {
            //console.log("validateAddFolder()...");
            var validRows = 0;
            addRepoIsValid = false;

            var rowValid = true;
            var theRowID = "add_repo_row";
            var theRepoName = $('#add_repo_name').val();
            if (theRepoName == "") {
                rowValid = false;
                $('#add_repo_validation_error').show();
                $('#add_repo_validation_error').html("The repo name needs to be filled in using the format: username/reponame.");
            }
            else {
                $('#add_repo_validation_error').hide();
            }

            if (rowValid == true) {
                validRows++;
                //$('#reponame_error_'+theRowID).hide();
                //$('#repotoken_error_'+theRowID).hide();
            }

            if (validRows == 1) {
                addRepoIsValid = true;
                $('#btn-folderbrowse-addrepo-confirm').removeClass("disabled");
            }
            else {
                addRepoIsValid = false;
                $('#btn-folderbrowse-addrepo-confirm').addClass("disabled");
            }
            //console.log(addFolderIsValid);
        }


        function validateSettings() {
            if (window.folderbrowse_debug) console.log("validateSettings()...");
            var validRows = 0;
            for (var t=0; t<window.folderbrowse_settings_rows; t++) {
                var rowValid = true;
                var theRowID = "folderbrowse_settings_row_" + t;
                var theRepoName = $('#reponame_'+theRowID).val();
                var theRepoToken = $('#repotoken_'+theRowID).val();
                if (theRepoName == "") {
                    rowValid = false;
                    $('#reponame_error_'+theRowID).show();
                    $('#reponame_error_'+theRowID).html("The repository name needs to be filled in.");
                }
                else if (theRepoName.indexOf("/") == -1) {
                    rowValid = false;
                    $('#reponame_error_'+theRowID).show();
                    $('#reponame_error_'+theRowID).html("Use format: username/reponame");
                }
                else {
                    $('#reponame_error_'+theRowID).hide();
                }

                if (theRepoToken == "") {
                  rowValid = false;
                  $('#repotoken_error_'+theRowID).show();
                  $('#repotoken_error_'+theRowID).html("Please include an <a href='https://github.com/settings/tokens/new' target='_blank'>access token</a> for this repo.");
                }
                else {
                    $('#repotoken_error_'+theRowID).hide();
                }

                if (rowValid == true) {
                    validRows++;
                    $('#reponame_error_'+theRowID).hide();
                    $('#repotoken_error_'+theRowID).hide();
                }

            }
            if (window.folderbrowse_settings_rows == validRows) {
                settingsAreValid = true;
                $('#btn-folderbrowse-savesettings').removeClass("disabled");
            }
            else {
                settingsAreValid = false;
                $('#btn-folderbrowse-savesettings').addClass("disabled");
            }
            if (window.folderbrowse_debug) console.log(settingsAreValid);
        }


        function setupSettingsValidation() {
            if (window.folderbrowse_debug) console.log("setupSettingsValidation()...");
            for (var t=0; t<window.folderbrowse_settings_rows; t++) {
                var theRowID = "folderbrowse_settings_row_" + t;
                //remove any previous handlers
                $('#reponame_'+theRowID).off('keypress');
                $('#repotoken_'+theRowID).off('keypress');
                $('#repo_retry_'+theRowID).off('click');
                //create new handlers
                $('#reponame_'+theRowID).on('keypress',function() {
                    $('#repo_error_'+theRowID).hide();
                    validateSettings();
                });
               $('#repotoken_'+theRowID).on('keypress',function() {
                   $('#repo_error_'+theRowID).hide();
                    validateSettings();
                });
               $('#repo_retry_'+theRowID).on('click', function() {
                   $('#repo_error_'+theRowID).hide();
                 requestFolderSettings(t);
               });
            }
        }

        function renderSettingsRows() {
            var theSettingsHTML = '<div id="folderbrowse_settings_container">';
            var numRows = 0;
            for (var t=0; t<window.folderbrowse_settings.length; t++) {
                var theRowID = "folderbrowse_settings_row_"+t;
                var theRowObject = window.folderbrowse_settings[t];
                var theRepoToken = "";
                var theRepoName = "";
                if (typeof theRowObject == "object") {
                    if (typeof theRowObject.accessToken == "string") {
                        theRepoToken = theRowObject.accessToken;
                    }
                    if (typeof theRowObject.repositoryName == "string") {
                        theRepoName = theRowObject.repositoryName;
                    }
                }
                var theErrorStyle = 'color:#735c0f;background-color:#fffbdd;border-color:#d9d0a5;z-index:10;display: block;max-width: 450px;padding: 5px 8px;margin: 4px 0 0;font-size: 13px;font-weight: 400;border-style: solid;border-width: 1px;border-radius: 3px;';
                var theFailureStyle = 'display:none;color:#86181d;background-color:#ffdce0;border-color:#cea0a5;z-index:10;max-width: 450px;padding: 5px 8px;margin: 4px 0 0;font-size: 13px;font-weight: 400;border-style: solid;border-width: 1px;border-radius: 3px;';
                theSettingsHTML += '<div id="'+theRowID+'">'
                theSettingsHTML += '<dl class="form-group border-grey-dark mb-1">';
                theSettingsHTML += '<dt><label for="reponame_'+theRowID+'" style="color: black;">Repository containing hubfolders.yaml:</label></dt>';
                theSettingsHTML += '<dd><input class="form-control input-monospace" type="text" placeholder="user/reponame" value="'+theRepoName+'" id="reponame_'+theRowID+'" aria-label="Repository '+(theRowID+1)+' Name" /></dd>';
                theSettingsHTML += '<dd class="error" id="reponame_error_'+theRowID+'" style="'+theErrorStyle+'"></dd>';
                theSettingsHTML += '<dt class="mt-2" style="color: black;"><label for="repotoken_'+theRowID+'" style="color: black;">Access token:</label> (<a href="https://github.com/settings/tokens/new" target="_blank">Setup Tokens</a>)</dt>';
                theSettingsHTML += '<dd><input class="form-control input-monospace" type="text" placeholder="" value="'+theRepoToken+'" id="repotoken_'+theRowID+'" aria-label="Repository '+(theRowID+1)+' Access Token" /></dd>';
                theSettingsHTML += '<dd class="error" id="repotoken_error_'+theRowID+'" style="'+theErrorStyle+'"></dd>';
                theSettingsHTML += '</dl>';
                theSettingsHTML += '<div id="repo_error_'+theRowID+'" class="hide" style="'+theFailureStyle+'">Problem getting hubfolders.yaml from this repo! <a href="#" id="repo_retry_'+theRowID+'">Retry</a></div>';
                theSettingsHTML += '</div>';

                numRows++;
            }
            theSettingsHTML += '</div>';
            window.folderbrowse_settings_rows = numRows;
            $('#folderbrowse-dialog-body').html(theSettingsHTML);
        }

        function renderAddFolderRows() {
            var theAddFolderHTML = '<div id="folderbrowse_addfolder_container">';
            var theFolderName = "";
            var theErrorStyle = 'color:#735c0f;background-color:#fffbdd;border-color:#d9d0a5;z-index:10;display: block;max-width: 450px;padding: 5px 8px;margin: 4px 0 0;font-size: 13px;font-weight: 400;border-style: solid;border-width: 1px;border-radius: 3px;';
            var theFailureStyle = 'display:none;color:#86181d;background-color:#ffdce0;border-color:#cea0a5;z-index:10;max-width: 450px;padding: 5px 8px;margin: 4px 0 0;font-size: 13px;font-weight: 400;border-style: solid;border-width: 1px;border-radius: 3px;';
            theAddFolderHTML += '<div id="add_folder_row">'
            theAddFolderHTML += '<dl class="form-group border-grey-dark mb-1">';
            theAddFolderHTML += '<dt><label for="add_folder_name" style="color: black;">Name of New Folder:</label></dt>';
            theAddFolderHTML += '<dd><input class="form-control input-monospace" type="text" placeholder="" value="'+theFolderName+'" id="add_folder_name" aria-label="Name of Folder to Add" /></dd>';
            theAddFolderHTML += '<dd class="error" id="add_folder_validation_error" style="'+theErrorStyle+'"></dd>';
            theAddFolderHTML += '</dl>';
            theAddFolderHTML += '<div id="add_folder_error" class="hide" style="'+theFailureStyle+'">Problem saving new folder to hubfolders.yaml! <a href="#" id="add_folder_retry">Retry</a></div>';
            theAddFolderHTML += '</div>';
            theAddFolderHTML += '</div>';
            $('#folderbrowse-dialog-body').html(theAddFolderHTML);
            $('#add_folder_name').focus();
        }

        function renderAddRepoRows() {
            var theAddRepoHTML = '<div id="folderbrowse_addrepo_container">';
            var theRepoName = "";
            var theErrorStyle = 'color:#735c0f;background-color:#fffbdd;border-color:#d9d0a5;z-index:10;display: block;max-width: 450px;padding: 5px 8px;margin: 4px 0 0;font-size: 13px;font-weight: 400;border-style: solid;border-width: 1px;border-radius: 3px;';
            var theFailureStyle = 'display:none;color:#86181d;background-color:#ffdce0;border-color:#cea0a5;z-index:10;max-width: 450px;padding: 5px 8px;margin: 4px 0 0;font-size: 13px;font-weight: 400;border-style: solid;border-width: 1px;border-radius: 3px;';
            theAddRepoHTML += '<div id="add_repo_row">'
            theAddRepoHTML += '<dl class="form-group border-grey-dark mb-1">';
            theAddRepoHTML += '<dt><label for="add_repo_name" style="color: black;">Repository to Add:</label></dt>';
            theAddRepoHTML += '<dd><input class="form-control input-monospace" type="text" placeholder="username/reponame" value="'+theRepoName+'" id="add_repo_name" aria-label="Repository to Add" /></dd>';
            theAddRepoHTML += '<dd class="error" id="add_repo_validation_error" style="'+theErrorStyle+'"></dd>';
            theAddRepoHTML += '</dl>';
            theAddRepoHTML += '<div id="add_repo_error" class="hide" style="'+theFailureStyle+'">Problem saving added repo to hubfolders.yaml! <a href="#" id="add_repo_retry">Retry</a></div>';
            theAddRepoHTML += '</div>';
            theAddRepoHTML += '</div>';
            $('#folderbrowse-dialog-body').html(theAddRepoHTML);
            $('#add_repo_name').focus();
        }

        function insertIntoSidebar() {
            var theHTML = getSidebarFolders();
            $(theHTML).insertBefore($(".dashboard-sidebar .js-repos-container[aria-label='Repositories']"));
        }

        function makeSlinky($) {
            if (window.folderbrowse_debug) console.log("makeSlinky() called...");
            if (slinky != null) {
                slinky.destroy();
                slinky = null;
            }
            var slinkyoptions = {
                resize: true,
                title: true
            };

            slinky = $('#folder-tree-menu').slinky(slinkyoptions);
            $('#folder-tree-menu').css('height', 'auto');
        }

        function destroySlinky($) {
            if (window.folderbrowse_debug) console.log("destroySlinky() called...");
            if (slinky != null) {
                slinky.destroy();
            }
        }

        async function receiveMessageInternal (event) {
          var messageJSON;
          try {
              messageJSON = JSON.parse(event.data);
          }
          catch (zError) {
              //do nothing
          }
          //console.log(messageJSON);
          if ( ! messageJSON) return;

          if (messageJSON.action == "folderSettings") {
              if (window.folderbrowse_debug) console.log("receiveFolderSettings()... processing message...");
              if (window.folderbrowse_debug) console.log(messageJSON);

              if (messageJSON.status == 200) {
                  var theYAML = messageJSON.yaml;
                  if (theYAML.trim() == "new") { //for initialising a new repo
                      theYAML = "folders:\n"; //+
                          "- My First Folder:\n" +
                          "  - hubscripts/hubfolders\n";
                  }
                  var settingEntryNum = messageJSON.foldersetting_entrynum;

                  var theRepoName = messageJSON.reponame;
                  var theDoc = jsyaml.load(theYAML);

                  window.folderbrowse_settings[settingEntryNum].yamlDataRetrieved = theYAML;
                  window.folderbrowse_settings[settingEntryNum].yamlDocumentJSON = theDoc;
                  if (window.folderbrowse_debug) console.log(theDoc);
                  folderBrowseDialog_defaultMode();
                  //var theYAML_JSON = window.folderbrowse_settings[0].yamlDocumentJSON;
                  replaceFolderTreeWithJSON(theDoc);
                  await saveFolderBrowseSettings(activeUsername);
              }
              else {
                  var settingEntryNum = messageJSON.foldersetting_entrynum;
                  var theRowID = "folderbrowse_settings_row_"+settingEntryNum;
                  $('#repo_error_'+theRowID).show();
                  $('#btn-folderbrowse-savesettings').addClass("disabled");
              }
              if (window.folderbrowse_debug) console.log("receiveFolderSettings()... done.");

          }
          else {
              // A message we are not interested in
          }
        }


        window.addEventListener("message", receiveMessageInternal, false)
        var emptySettings = false;

        activeUsername = getUsername();
        if (activeUsername != "") {
            await loadFolderBrowseSettings(activeUsername);
            //console.log(folderbrowse_settings);
            if (window.folderbrowse_settings.length == 1) {
                //console.log("wfbl = 1");
                if ((folderbrowse_settings[0].accessToken == "") && (folderbrowse_settings[0].repositoryName == "")) {
                    emptySettings = true;
                }
                else {
                    emptySettings = false;
                }
            }
        }

        //console.log("emptySettings");
        //console.log(emptySettings);
        //if we are logged in
        if (activeUsername != "") {
            if (emptySettings == false) {
                processSettingsData();
            }

            insertIntoSidebar();
            folderButtonForHeader();

            if (emptySettings == false) {
                requestFolderSettings();
            }
            else {
                folderBrowseDialog_noSettingsMode();
            }
        }

        //dashboard_hideExplore();
        //repository_parentFolderButton();

        $(document).ready(function($){
            if (activeUsername != "") {
              if (window.folderbrowse_debug) console.log('Document ready for HubFolders to be Loaded!');
            }
        });
    }

    usingJQuery($);
})();

//--- This code listens for the right kind of message and calls GM_xmlhttpRequest.
window.addEventListener ("message", receiveMessageExternal, false);

function receiveMessageExternal (event) {
    var messageJSON;
    try {
        messageJSON = JSON.parse (event.data);
    }
    catch (zError) {
        // Do nothing
    }
    //console.log ("messageJSON:", messageJSON);

    if ( ! messageJSON) return; //-- Message is not for us.

    if (messageJSON.action == "fetchURL") {
        var theURL = messageJSON.parameters;
        var theRepoName = messageJSON.reponame;
        var settingEntryNum = messageJSON.setting_entry_num;
        var theHeaders = messageJSON.headers ? messageJSON.headers : null;
        var theAuthHeader = theHeaders.Authorization;
        fetchFileContents(theRepoName, settingEntryNum, theAuthHeader);

        /*var theRequest = {
            method: 'GET',
            url: theURL,
            onload: function (responseDetails) {
               // DO ALL RESPONSE PROCESSING HERE...
               console.log (
                 "GM_xmlhttpRequest() response is:\n",
                 responseDetails.responseText.substring (0, 80) + '...'
               );

                console.log(responseDetails);
               // Send the received file contents back to whichever function is listening
               var messageTxt = JSON.stringify({
                 'action':'folderSettings',
                 'status': responseDetails.status,
                 'yaml': responseDetails.responseText,
                 'reponame' : theRepoName,
                 'foldersetting_entrynum' : settingEntryNum
               });
               window.postMessage(messageTxt, "*");
           }
        };
        if (theHeaders !== null) {
            theRequest.headers = theHeaders;
        }
        console.log(theRequest);

        GM_xmlhttpRequest ( theRequest );
        */
    }
    else if (messageJSON.action == "saveYAML") {
        //alert('saveYAML');
        //console.log('saveYAML');
        theRepoName = messageJSON.reponame;
        var theRepoNameParts = theRepoName.split("/");
        if (window.folderbrowse_debug) console.log(theRepoNameParts);
        var theUsername = theRepoNameParts[0];
        settingEntryNum = messageJSON.setting_entry_num;
        theHeaders = messageJSON.headers ? messageJSON.headers : null;
        var newYAMLData = messageJSON.newYAMLData;
        var newYAMLDataPrefix = "# Configuration options for Hub Folders Userscript\n" +
            "\n"; //+
            //"username: " + theUsername + "\n";
        newYAMLData = newYAMLDataPrefix + newYAMLData;
        var theAuthHeader2 = theHeaders.Authorization;
        getHubFolderFileSHAThenSaveData(theUsername, theRepoName, settingEntryNum, theAuthHeader2, newYAMLData);
    }
}



function fetchFileContents(theRepoName, settingEntryNum, theAuthHeader) {
    var itWorked = false;
    if (window.folderbrowse_debug) console.log('fetchFileContents');
    if (window.folderbrowse_debug) console.log(theAuthHeader);
    if (window.folderbrowse_debug) console.log(theRepoName);
    if (window.folderbrowse_debug) console.log(settingEntryNum);
    var restClient = ê.createRestClient({ host: "api.github.com", useSSL: true })
    .withHeader("Authorization", theAuthHeader) // Send my authorization token with all requests
    //.withQueryStringParam("per_page", 5)
    .read("/repos/"+theRepoName+"/contents/hubfolders.yaml", { })
    .then(function(data) {
        if (window.folderbrowse_debug) console.log("got data from fetchFileContents");
        if (window.folderbrowse_debug) console.log(data);
        var theContent = atob(data.content);
        if (window.folderbrowse_debug) console.log(theContent);
        itWorked = true;

        //send a message back to the function listening for the outcome
        // Send the received file contents back to whichever function is listening
        var messageTxt = JSON.stringify({
            'action':'folderSettings',
            'status': '200',
            'yaml': theContent,
            'reponame' : theRepoName,
            'foldersetting_entrynum' : settingEntryNum
        });
        window.postMessage(messageTxt, "*");
        //window.postMessage(messageTxt, "*");

    }, function(error) {
        if (window.folderbrowse_debug) console.log("failed fetchFileContents!");
        if (window.folderbrowse_debug) console.log(error);
        //send a message back to the function listening for the outcome
        // Send the received file contents back to whichever function is listening
        var outcomeText = 'failed';
        var messageTxt = JSON.stringify({
            'action':'folderSettingsSaved',
            'outcome' : outcomeText,
            'reponame' : theRepoName,
            'foldersetting_entrynum' : settingEntryNum
        });
        window.postMessage(messageTxt, "*");
    });

}

function saveHubFolderFileData(theUsername, theRepoName, settingEntryNum, theAuthHeader, newYAMLData, theSHA) {
    var itWorked = false;

    var newYAMLBase64 = window.btoa(newYAMLData);

    var dataObject = {
        "message": "Update by HubFolders Userscript",
        "content": newYAMLBase64,
        "sha": theSHA
    };

    if (window.folderbrowse_debug) console.log(dataObject);


    var restClient = ê.createRestClient({ host: "api.github.com", useSSL: true })
    .withHeader("Authorization", theAuthHeader) // Send my authorization token with all requests
    //.withQueryStringParam("per_page", 5)
    .update("/repos/"+theRepoName+"/contents/hubfolders.yaml", dataObject)
    .then(function(data) {
        if (window.folderbrowse_debug) console.log("got data from invokeRest");
        if (window.folderbrowse_debug) console.log(data);
        itWorked = true;

        //send a message back to the function listening for the outcome
        // Send the received file contents back to whichever function is listening
        var outcomeText = 'saved';
        var messageTxt = JSON.stringify({
            'action':'folderSettingsSaved',
            'outcome' : outcomeText,
            'reponame' : theRepoName,
            'foldersetting_entrynum' : settingEntryNum
        });
        window.postMessage(messageTxt, "*");

    }, function() {
        if (window.folderbrowse_debug) console.log("failed saveHubFolderFileData!");
        //send a message back to the function listening for the outcome
        // Send the received file contents back to whichever function is listening
        var outcomeText = 'failed';
        var messageTxt = JSON.stringify({
            'action':'folderSettingsSaved',
            'outcome' : outcomeText,
            'reponame' : theRepoName,
            'foldersetting_entrynum' : settingEntryNum
        });
        window.postMessage(messageTxt, "*");
    });
}

function getHubFolderFileSHAThenSaveData(theUsername, theRepoName, settingEntryNum, theAuthHeader, newYAMLData) {
    var itWorked = false;
    var restClient = ê.createRestClient({ host: "api.github.com", useSSL: true })
    .withHeader("Authorization", theAuthHeader) // Send my authorization token with all requests
    //.withQueryStringParam("per_page", 5)
    .read("/repos/"+theRepoName+"/contents/hubfolders.yaml", { })
    .then(function(data) {
        if (window.folderbrowse_debug) console.log("got data from invokeRest");
        if (window.folderbrowse_debug) console.log(data);
        itWorked = true;

        var theSHA = data.sha;

        saveHubFolderFileData(theUsername, theRepoName, settingEntryNum, theAuthHeader, newYAMLData, theSHA);
    }, function() {
        if (window.folderbrowse_debug) console.log("failed getHubFolderFileSHAThenInvokeRest!");
        //send a message back to the function listening for the outcome
        // Send the received file contents back to whichever function is listening
        var outcomeText = 'failed';
        var messageTxt = JSON.stringify({
            'action':'folderSettingsSaved',
            'outcome' : outcomeText,
            'reponame' : theRepoName,
            'foldersetting_entrynum' : settingEntryNum
        });
        window.postMessage(messageTxt, "*");
    });
}

