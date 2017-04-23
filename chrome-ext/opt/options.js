var libraries = [], newLibraryIndex = 0, onNoLibraries = 5; //normal is 5
//chrome.storage.sync.clear(); //TODO: for debugging

$(document).ready(function() {
  loadLibraries();

  $('#btnSave').click(function() {
    saveLibraries();
  });

  $('#btnAdd').click(function() {
    //TODO: quick access some MLS libraries for debugging
    if ($('#shortName0').val() == "goLib1") {initLibraries(1);}
    if ($('#shortName0').val() == "goLib2") {initLibraries(2);}
    if ($('#shortName0').val() == "clearLib") {chrome.storage.sync.clear(); window.location.reload();}
    addRow();
  });

  $('#btnSetup').click(function() {
    //$('#btnSetup').text('working');
    findLibraries();
  });

  $('#btnClearAndSetup').click(function() {
    //Warn of serious nature and get confirmation to proceed - TODO s/b modal, confirm won't work
    // r = window.confirm("Warning! This will delete all current libraries and replace them with those found in another tab.\n\nYou must be logged in to OverDrive.com with saved libraries before executing this command.");
    // if (r == true)
    findLibraries();
  });

  $('#btnCancelSetup').click(function() {
    newLibraryIndex = 10000;
    chrome.webRequest.onCompleted.removeListener(runWhenLoaded);
    $('#spinnerP').text('Cancelling...');
    $('#spinner').fadeOut(1000);
    setTimeout(function() {
      window.location.reload();
    },1000);
  });
});

function findLibraries() {
  //clear former libraries
  chrome.storage.sync.clear();
  console.log("requesting saved libraries")
  //request saved libraries
  $('#spinnerP').text('Downloading saved libraries ... please wait');
  $('#spinner').fadeIn(1000);
  chrome.runtime.sendMessage({type: "_findSavedLibraries"});
}

chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (message.type == "_foundSavedLibraries") {
    $('#spinnerP').text('Found saved libraries ... working');
    console.log("from overdrive_mls _foundSavedLibraries",message);
    switch (message.status) {
      case "Success":
        libraries = message.response.newLibraries;
        newLibraryIndex = 0;
        var foundInvalid = false;
        //avoid slow loading into iframes if URLs are valid overdrive.com URLs
        while (libraries.length > newLibraryIndex && !foundInvalid) {
          var library = libraries[newLibraryIndex];
          //find first library that is invalid and load it into iframe
          if (library.libraryURL.length > 0 &&
            library.libraryURL.indexOf(".lib.overdrive.com") > 0 ||
            library.libraryURL.indexOf(".overdrive.com") == -1 )
          {
            console.log("first invalid libraryURL found: ", library.libraryURL);
            //runWhenLoaded onCompleted listener will handle the rest of the looping through libraries
            foundInvalid = true;
            chrome.webRequest.onCompleted.addListener(runWhenLoaded, {
              urls: ['*://*.overdrive.com/*'], //assumes redirections terminate in overdrive.com
              types: ['sub_frame']
           });
            //load tab in an iframe (uses bg.js webrequest listener to block x-frame-options header)
            $('#iframeOpt').attr('src', "http://"+library.libraryURL);
          } else {
            //TODO note URL could be empty--just leave it as is for now
            console.log("a valid libraryURL found: ", library.libraryURL);
            newLibraryIndex++;
          }
        }
        //if all were well formed--save and clear spinner; otherwise, just return and wait for the listener to complete...
        if (!foundInvalid) {
          setupDone();
        }
        break;
      case "Not logged in":
        $('#spinnerP').text(message.status);
        alert("Not logged into OverDrive. Please log into your OverDrive account to find library information from your saved libraries.");
        window.location.reload();
        break;
      case "No saved libraries":
        $('#spinnerP').text(message.status);
        alert("This OverDrive account has no saved libraries. Please save a list of local libraries to find library information for your local libraries (recommended), or enter them manually below.");
        window.location.reload();
        break;
    }
  }
});

//listener to run when iframe loaded
function runWhenLoaded(iframeInfo) {
  console.log('runWhenLoaded: iframe loaded (onCompleted event fired), url: ', iframeInfo.url); //iframeSrcChanged
  chrome.webRequest.onCompleted.removeListener(runWhenLoaded);
  //if resolved, change libraryURL to url of iframe url
  if (iframeInfo.url) {
    var library = libraries[newLibraryIndex];
    console.log("",libraries[newLibraryIndex].libraryURL);
    libraries[newLibraryIndex].libraryURL = iframeInfo.url.replace(/https?:\/\//i,'').replace(/overdrive.com.*/,'overdrive.com').replace(/libraryreserve.com.*/,'libraryreserve.com');
    console.log("changed url to "+libraries[newLibraryIndex].libraryURL, libraries);
    $('#spinnerP').text('Located '+library.libraryFullName+ ' ... working');
  }
  //avoid slow loading into iframes if URLs are already valid overdrive.com URLs
  if (libraries.length > (newLibraryIndex + 1)) {
    newLibraryIndex++; console.log("if libraries.length "+libraries.length+" > "+newLibraryIndex+" newLibraryIndex");
    var library = libraries[newLibraryIndex];
    console.log("next library: "+library.libraryShortName,library);
    //if a library url is invalid, load it into iframe
    if (library.libraryURL.length > 0 &&
      library.libraryURL.indexOf(".lib.overdrive.com") > 0 ||
      library.libraryURL.indexOf(".overdrive.com") == -1 )
    {
      console.log("invalid libraryURL found: ", library.libraryURL);
      //add onCompleted listener to get URL when redirection finishes
      chrome.webRequest.onCompleted.addListener(runWhenLoaded, {
        urls: ['<all_urls>'],
        types: ['sub_frame']
      });
      //load tab in the iframe (uses bg.js webrequest listener to block x-frame-options header)
      $('#iframeOpt').attr('src', "http://"+library.libraryURL);
    } else {
      //TODO note URL could be empty--just leave it as is for now
      //valid libraryURL is already in libraries array
      console.log("valid libraryURL found: ", library.libraryURL);
    }
  } else {
    setupDone(); //when no more libraries
  }
}

function setupDone(){
  //done, need to sync or at least clear menu
  $('#spinnerP').text('Setup Complete!');
  $('#spinnerP').css('color','green');
  $('#spinner').fadeOut(2000);
  console.log("setup done", libraries);
  $('#menu').html('');
  chrome.storage.sync.set({"libraries": libraries}, function() { onNoLibraries = 4; loadLibraries(); });
};

function loadLibraries() {
	//try to retrieve library list from chrome.storage.sync; if not there, parse saved libraries list
	chrome.storage.sync.get("libraries", function(obj) {
		libraries = obj["libraries"];
    console.log("libraries:", libraries);
		if (!libraries || libraries.length == 0 ||
      (libraries.length == 1 && libraries[0].libraryShortName === ""
        && libraries[0].libraryURL == "" && libraries[0].libraryFullName == "")
     ) {
      $('#setup').children("*").removeClass("hidden");
      $('#normal').children("*").addClass("hidden");
			console.log("no libraries found");
      initLibraries(onNoLibraries); //change value for debugging
    } else {
      $('#normal').children("*").removeClass("hidden");
      $('#setup').children("*").addClass("hidden");
    }
    if (!libraries || libraries.length == 0) { addRow(); }
    else if (onNoLibraries > 0) {
      //console.dir(JSON.stringify(libraries,null,2));
      var libRows = "";
      for (var libraryIndex in libraries) {
    		var library = libraries[libraryIndex];
        //console.log('library: ' + library.libraryShortName);
        var badURL='badURL';
        //must not have xxx.lib.overdrive
        //must be xxx.overdrive.com(eol)
        match = /.*\.overdrive\.com\/?$/mi.exec(library.libraryURL);
        if (match && library.libraryURL.indexOf(".lib.") == -1) {badURL = "";}
        libRows += "<tr>";
        libRows += "<td><input id='shortName" + libraryIndex + "' value='" + library.libraryShortName + "' class= 'ip ip1' maxlength='15' type='text'/></td>";
        libRows += "<td><input id='URL" + libraryIndex + "' value='" + library.libraryURL + "' class= 'ip "+ badURL + "' type='text'/></td>";
        libRows += "<td><input id='fullName" + libraryIndex + "' value='" + library.libraryFullName + "' class= 'ip' type='text'/></td>";
        libRows += "</tr>";
      }
    }
    //console.log("libRows: " + libRows);
    $('#menu').append(libRows);
    $(".ip").off('change').on('change', validateInput);
  });
}

function saveLibraries() {
  //save edits to libraries from form
  console.log('save libs', libraries);
  var librariesEdited = [];

  for (var libraryIndex in libraries) {
    libraryUrl = $('#URL'+libraryIndex).val().replace(/^https?:\/\//, '').replace(/overdrive.com.*/, 'overdrive.com');
    console.log($('#fullName'+libraryIndex).val());
    //delete any completely blank rows by skipping them
    if (
      libraryUrl.length > 0
      || $('#fullName'+libraryIndex).val().length > 0
      || $('#shortName'+libraryIndex).val().length > 0
    ) {
      librariesEdited.push({
        libraryFullName: $('#fullName'+libraryIndex).val(),
        libraryShortName: $('#shortName'+libraryIndex).val(),
        libraryURL: libraryUrl
      });
    }
  }
  chrome.storage.sync.set({"libraries": librariesEdited});
  window.location.reload();
}

function initLibraries(onNoLibraries) {
  //single library onNoLibraries
  //console.log('onNoLibraries: ' + onNoLibraries);
  if (onNoLibraries == 1) {
    libraries = [{ "libraryFullName": "Douglas County Libraries", "libraryShortName": "Douglas", "libraryURL": "dcl.overdrive.com" }];
    //save libraries
    chrome.storage.sync.set({"libraries": libraries}, function() { });
    window.location.reload();
  }
  //full set
  if (onNoLibraries == 2) {
    libraries = [
    	{ "libraryShortName": "Arapahoe", "libraryURL": "Arapahoe.overdrive.com", "libraryFullName": "Arapahoe Library District" },
    	{ "libraryShortName": "Denver", "libraryURL": "Denver.overdrive.com", "libraryFullName": "Denver Public Library" },
    	{ "libraryShortName": "JeffCo", "libraryURL": "Jefferson.overdrive.com", "libraryFullName": "Jefferson County Libraries" },
    	{ "libraryShortName": "Boulder", "libraryURL": "FrontRange.overdrive.com", "libraryFullName": "Front Range Library" },
    	{ "libraryShortName": "Aurora", "libraryURL": "Aurora.overdrive.com", "libraryFullName": "Aurora Public Library" },
    	{ "libraryShortName": "Anythink", "libraryURL": "AnythinkLibraries.overdrive.com", "libraryFullName": "Rangeview Library District" },
    	{ "libraryShortName": "Douglas", "libraryURL": "dcl.overdrive.com", "libraryFullName": "Douglas County Libraries" }
    ];
    //save libraries
    chrome.storage.sync.set({"libraries": libraries}, function() { });
    window.location.reload();
  }
  if (onNoLibraries == 4) {
    onNoLibraries = 0;
    console.log('b4findLib');
    findLibraries();
  }
}

//function to return regex with groups (1),(2),(3) as array of n csv 1,2,3 matches (counts from zero)
//from jsfiddle.net/ravishi/MbwpV/
function globalMatches(string, regex) {
    if(!(regex instanceof RegExp)) {
        return "ERROR";
    }
    else {
        if (!regex.global) {
            // If global flag not set, create new one.
            var flags = "g";
            if (regex.ignoreCase) flags += "i";
            if (regex.multiline) flags += "m";
            if (regex.sticky) flags += "y";
            regex = RegExp(regex.source, flags);
        }
    }
    var matches = [];
    var match = regex.exec(string);
    while (match) {
        if (match.length > 2) {
            var group_matches = [];
            for (var i = 1; i < match.length; i++) {
                group_matches.push(match[i]);
            }
            matches.push(group_matches);
        }
        else {
            matches.push(match[1]);
        }
        match = regex.exec(string);
    }
    return matches;
}

function addRow() {
  //adds blank row and blank line to form
  //does not save--any still blank lines skipped/deleted in saveLibraries
  var index = 0;
  if (libraries) { index = libraries.length; }
  var libRows = "<tr>";
  libRows += "<td><input id='shortName" + index + "' value='' class= 'ip ip1' maxlength='15' type='text'/></td>";
  libRows += "<td><input id='URL" + index + "' value='' class= 'ip' type='text'/></td>";
  libRows += "<td><input id='fullName" + index + "' value='' class= 'ip' type='text'/></td>";
  libRows += "</tr>";
  if (libraries) { libraries.push({ "libraryFullName": "", "libraryShortName": "", "libraryURL": "" }); }
  else { libraries = [{ "libraryFullName": "", "libraryShortName": "", "libraryURL": "" }]; }
  $('#menu').append(libRows);
  $(".ip").off('change').on('change', function() { validateInput(this); });
  //console.log('addRow');
}

//extend string prototype to find first word by breaking on space if present
String.prototype.firstWord = function (){
		return (this.indexOf(' ') !== -1) ? this.substr(0, this.indexOf(' ')) : this;
};

function validateInput() {
  //console.dir(this);
  if ($(this).length == 0) {return;}
  if ($(this).attr('id').indexOf("RL") > 0) {
    $(this).val( $(this).val().replace(/[^\.a-z0-9:\/ _]/gi,'') ); //limit allowable characters
    $(this).val($(this).val().trim());
    //this is URL
    $(this).val($(this).val().replace(/^https?:\/\//, '').replace(/\.overdrive\.com.*/, '.overdrive.com').trim());
    if ($(this).val().length > 0) {
      console.log($(this).val().indexOf("www.overdrive.com"))
      if ($(this).val().indexOf('.lib.') == -1
          && $(this).val().indexOf(".overdrive.com") > 0
          && $(this).val().indexOf("www.overdrive.com") == -1
        )
      { $(this).removeClass('badURL');
      } else { $(this).addClass('badURL'); }
    }
  } else {
    $(this).val( $(this).val().replace(/[^a-z0-9 _]/gi,'') ); //limit allowable characters
    $(this).val($(this).val().trim());
  }
}
