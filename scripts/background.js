/*jslint indent: 2 */
/*global window: false, XMLHttpRequest: false, chrome: false, btoa: false */
"use strict";

var TogglButton = {
  $user: null,
  $apiUrl: "https://www.toggl.com/api/v7",
  $newApiUrl: "https://new.toggl.com/api/v8",
  $sites: new RegExp([
    'asana\\.com',
    'podio\\.com',
    'trello\\.com',
    'github\\.com',
    'bitbucket\\.org',
    'gitlab\\.com',
    'redbooth\\.com',
    'teamweek\\.com',
    'basecamp\\.com',
    'unfuddle\\.com',
    'worksection\\.com',
    'pivotaltracker\\.com',
    'producteev\\.com'].join('|')),
  $curEntryId: null,
  $clientProjectMap: {},
  $clientMap: {},
  $dataRefresh: false,
  
  checkUrl: function (tabId, changeInfo, tab) {
    if (changeInfo.status === 'complete') {
      if (TogglButton.$sites.test(tab.url)) {
        TogglButton.setPageAction(tabId);
      } else if (/toggl\.com\/track/.test(tab.url)) {
        TogglButton.fetchUser(TogglButton.$apiUrl);
      } else if (/toggl\.com\/app/.test(tab.url)) {
        TogglButton.fetchUser(TogglButton.$newApiUrl);
      }
    }
  },

  fetchUser: function (apiUrl) {
    var xhr = new XMLHttpRequest();
    var milliseconds = new Date().getTime();
    xhr.open("GET", apiUrl + "/me?with_related_data=true&uts=" + milliseconds, true);
    xhr.onload = function () {
      if (xhr.status === 200) {
        var projectMap = {}, resp = JSON.parse(xhr.responseText);
        if (resp.data.projects) {
          resp.data.projects.forEach(function (project) {
            projectMap[project.name] = project.id;
          });
        }
        TogglButton.$user = resp.data;
        TogglButton.$user.projectMap = projectMap;
      } else if (apiUrl === TogglButton.$apiUrl) {
        TogglButton.fetchUser(TogglButton.$newApiUrl);
      }
    };
    xhr.send();
  },

  fetchClients: function (apiUrl) {
    var xhr = new XMLHttpRequest();
    var milliseconds = new Date().getTime();
    xhr.open("GET", apiUrl + "/clients?uts=" + milliseconds, true);
    xhr.onload = function () {
      if (xhr.status === 200) {
        
        var resp = JSON.parse(xhr.responseText);
        if (resp) {
          
          if(resp.data) {
            resp = resp.data;
          }
          
          if(TogglButton.$dataRefresh) {
            TogglButton.$clientProjectMap = {};
          }
          
          TogglButton.$clientMap = {};
          
          resp.forEach(function (client) {
            if(!client.server_deleted_at) {
                TogglButton.$clientMap[client.name] = client.id;
                TogglButton.fetchClientProjects(apiUrl, client.id, client.name);
            }
          });
        }
      } else if (apiUrl === TogglButton.$apiUrl) {
        TogglButton.fetchClients(TogglButton.$newApiUrl);
      }
    };
    xhr.send();
  },  
  
  fetchClientProjects: function (apiUrl, clientID, clientName) {
    var xhr = new XMLHttpRequest();
    var milliseconds = new Date().getTime();
    xhr.open("GET", apiUrl + "/clients/" + clientID + "/projects?uts=" + milliseconds, true);
    xhr.onload = function () {
      if (xhr.status === 200) {
        
        var resp = JSON.parse(xhr.responseText);
        if (resp) {
          if(resp.data) {
            resp = resp.data;
          }
          resp.forEach(function (clientProject) {
            if(clientProject.active) {
                TogglButton.$clientProjectMap[clientName + ' > ' + clientProject.name] = clientProject.id;
            }

          });
        }
      } else if (apiUrl === TogglButton.$apiUrl) {
        TogglButton.fetchClientProjects(TogglButton.$newApiUrl, clientID, clientName);
      }
    };
    xhr.send();
  },  
  
  createTimeEntry: function (timeEntry) {
    var clientProjectId;
    
    if(!timeEntry.projectName) {
        alert('Error: Tasks must be within Sections in Asana');
        return false;
    }
    
    clientProjectId = TogglButton.$clientProjectMap[timeEntry.clientName + ' > ' + timeEntry.projectName];
    
    if(isNaN(clientProjectId)) {
    
        if(!TogglButton.$dataRefresh) {
            TogglButton.$dataRefresh = true;
            TogglButton.fetchClients(TogglButton.$apiUrl);
            alert('Sorry, not found! I have refreshed the data, please try again');
            return;
        }
        TogglButton.$dataRefresh = false;
        
        if(TogglButton.$clientMap[timeEntry.clientName]) {
            TogglButton.createProject(timeEntry.clientName, timeEntry.projectName);
            alert('I created project \'' + timeEntry.projectName +'\', try again');
            return;
        }
        
        alert('Error: Could not find Client in Toggl: ' + timeEntry.clientName);
        return;
    }

    var start = new Date(),
      xhr = new XMLHttpRequest(),
      entry = {
        time_entry: {
          start: start.toISOString(),
          description: timeEntry.description,
          wid: TogglButton.$user.default_wid,
          pid: clientProjectId || null,
          billable: timeEntry.billable || false,
          duration: -(start.getTime() / 1000),
          created_with: timeEntry.createdWith || 'Nexus TogglButton'
        }
      }; 

    xhr.open("POST", TogglButton.$newApiUrl + "/time_entries", true);
    xhr.setRequestHeader('Authorization', 'Basic ' + btoa(TogglButton.$user.api_token + ':api_token'));
    // handle response
    xhr.addEventListener('load', function (e) {
      var responseData, entryId;
      responseData = JSON.parse(xhr.responseText);
      entryId = responseData && responseData.data && responseData.data.id;
      TogglButton.$curEntryId = entryId;
    });
    xhr.send(JSON.stringify(entry));
  },

  createProject: function (clientName, projectName) {

    var xhr = new XMLHttpRequest(), 
      entry = {
        project: {
          name: projectName,
          wid: TogglButton.$user.default_wid,
          cid: TogglButton.$clientMap[clientName],
          active: true,
          is_private: false          
        }
      }; 
      
    xhr.open("POST", TogglButton.$newApiUrl + "/projects", true);
    xhr.setRequestHeader('Authorization', 'Basic ' + btoa(TogglButton.$user.api_token + ':api_token'));
    // handle response
    xhr.addEventListener('load', function (e) {
        //RELOAD DATA
        TogglButton.$dataRefresh = true;
        TogglButton.fetchClients(TogglButton.$apiUrl);
    });
    xhr.send(JSON.stringify(entry));
  },
  
  stopTimeEntry: function (entryId) {
    entryId = entryId || TogglButton.$curEntryId;
    if (!entryId) {
      return;
    }
    var xhr = new XMLHttpRequest();

    // PUT https://www.toggl.com/api/v8/time_entries/{time_entry_id}/stop
    xhr.open("PUT", TogglButton.$newApiUrl + "/time_entries/" + entryId + "/stop", true);
    xhr.setRequestHeader('Authorization', 'Basic ' + btoa(TogglButton.$user.api_token + ':api_token'));
    xhr.send();
  },

  setPageAction: function (tabId) {
    var imagePath = 'images/inactive-19.png';
    if (TogglButton.$user !== null) {
      imagePath = 'images/active-19.png';
    }
    chrome.pageAction.setIcon({
      tabId: tabId,
      path: imagePath
    });
    chrome.pageAction.show(tabId);
  },

  newMessage: function (request, sender, sendResponse) {
    if (request.type === 'activate') {
      TogglButton.setPageAction(sender.tab.id);
      sendResponse({success: TogglButton.$user !== null, user: TogglButton.$user});
    } else if (request.type === 'timeEntry') {
      TogglButton.createTimeEntry(request);
    } else if (request.type === 'stop') {
      TogglButton.stopTimeEntry();
    }
  }

};

chrome.pageAction.onClicked.addListener(function (tab) {
  if (TogglButton.$user === null) {
    chrome.tabs.create({url: 'https://new.toggl.com/#login'});
  }
});

TogglButton.fetchUser(TogglButton.$apiUrl);
TogglButton.fetchClients(TogglButton.$apiUrl);
chrome.tabs.onUpdated.addListener(TogglButton.checkUrl);
chrome.extension.onMessage.addListener(TogglButton.newMessage);
