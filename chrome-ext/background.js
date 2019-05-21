// show options on installation
chrome.runtime.onInstalled.addListener(
  function(details) {
    if (details.reason == "install") {
      chrome.runtime.openOptionsPage();
    }
  }
);

//listener to pass messages from options to findSavedLibraries and back
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (message.type == '_findSavedLibraries') {
    var findLibrariesURL = "https://www.overdrive.com/media/789876";
    //create iframe
    document.body.insertAdjacentHTML('beforeend', '<iframe id="iframe1"></iframe>');
    //load url in an iframe, using bg.js webrequest listener to block x-frame-options header
    console.log('iframe loading');
    $("#iframe1").off("load").on("load", passWhenLoaded);
    $('#iframe1').attr('src', findLibrariesURL);
  }
  //message from content script to open options page
  if (message.type == '_openOptionsPage') {
    chrome.runtime.openOptionsPage();
  }
  //message from content script to check on book from library
  if (message.type == "_libraryStatus") {
    //this should just pass the URI in new CORBS model
    var url = message.url;
    var libraryShortName = message.libraryShortName;
    //console.log("_libraryStatus"+url);
    fetch(url)
      .then(function( response ) { return response.text() } )
      .then(function( data ) {
        //console.log(url)
        //console.log(data)
        var isAvailable = false, libCopies = 0, numHolds, numAvailable;
    		if (url.indexOf(".libraryreserve.com") > 0) {
    			//extract the availability info from misc. js variables
    			var match = /deAvailCop\s?=\s?"?(.*?)"?;/.exec(data); //book.isAvailable
    			numAvailable = match[1].trim();
    			if (numAvailable > 0) {isAvailable = true;}
    			match = /deLibCopies\s?=\s?"?(.*?)"?;/.exec(data); //book.ownedCopies
    			libCopies = match[1].trim();
    			match = /deNumWaiting\s?=\s?"?(.*?)"?;/.exec(data); //book.holdsCount
    			numHolds = match[1].trim();
    		} else {
  			//extract the availability info from js bookList variable
  			var match = /\.mediaItems ?=(.*?});/.exec(data);
  			if (match) {
  				bookList = JSON.parse(match[1].trim());
  				// iterate over books; even with a single item data it is formatted this way
  				for (var key in bookList) {
  					var book = bookList[key];
  					//console.log(book);
  					isAvailable = book.isAvailable;
  					libCopies = book.ownedCopies;
  					numHolds = book.holdsCount;
  				}
  			}
  		}
    		//console.log ( "isAvailable: "+isAvailable+" libCopies: "+libCopies+" numHolds: "+numHolds+" numAvailable: "+numAvailable );
        sendResponse( { isAvailable: isAvailable, libCopies: libCopies, numHolds: numHolds, numAvailable: numAvailable, url: url, libraryShortName: libraryShortName } );
      })
    return true;
  }
});

function passWhenLoaded() {
  console.log('iframe load complete ' +  $('#iframe1').attr('src'));
  //wait a second before requesting libraries; allows updates;
  console.log("iframePort2", iframePort);
  setTimeout(function(){
    iframePort.postMessage({type: '_cs_findSavedLibraries'});
    console.log('sent _cs_findSavedLibraries');
  },1000);
}

var iframePort;
chrome.runtime.onConnect.addListener(port => {
    // save in a global variable to access it later from other functions
    iframePort = port;
    //this just passes info to outer bg console.log for easier debugging
    port.onMessage.addListener(msg => {
      if (msg.console) console.log(msg.console);
    });
});

// Removes the X-Frame-Options header and content-security-policy headers if found
chrome.webRequest.onHeadersReceived.addListener(
  function(info) {
    var headers = info.responseHeaders;
    var index0 = headers.findIndex(x=>x.name.toLowerCase() == "content-security-policy");
    var index = headers.findIndex(x=>x.name.toLowerCase() == "x-frame-options");
    //console.log("insideOHR", info.responseHeaders, index0, index);
    if (index0 !=-1) {
      headers[index0].value=''; //console.log("content-security-policy header blanked");
    }
    if (index !=-1) {
      headers.splice(index, 1); //console.log("x-frame-options removed");
    }
    //console.log("insideOHRnewheaders", headers, index0, index);
    return {responseHeaders: headers};
  },
  { urls: ['<all_urls>'], types: ['sub_frame'] },
  ['blocking', 'responseHeaders']
);
