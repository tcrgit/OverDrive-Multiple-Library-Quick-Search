// show options on installation
chrome.runtime.onInstalled.addListener(
  function(details) {
    if (details.reason == "install") {
      //chrome.tabs.create({url: "opt/options.html"});
      // for options 2
      chrome.runtime.openOptionsPage();
    }
  }
);

//listener to pass messages from options to findSavedLibraries and back
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (message.type == '_findSavedLibraries') {
      var findLibrariesURL = "https://www.overdrive.com/media/789876";
      //create the web page
      chrome.tabs.create({url: findLibrariesURL}, function(tab){
        //console.log('created', tab.id);
        chrome.tabs.onUpdated.addListener(passWhenLoaded);
      });
  }
  //message from content script message to open options page
  if (message.type == '_openOptionsPage') {
    chrome.runtime.openOptionsPage();
  }
});

function passWhenLoaded(tabid, info, tab) {
  if (info.status == "complete") {
    //console.log('complete');
    chrome.tabs.sendMessage(tabid, {type: "_cs_findSavedLibraries"}, function(tab){
      //console.log('sent _cs_findSavedLibraries');
      chrome.tabs.onUpdated.removeListener(passWhenLoaded);
    });
    return;
  }
}
