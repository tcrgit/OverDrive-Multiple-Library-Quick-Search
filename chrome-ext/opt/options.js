var libraries = [], newLibraryIndex = 0, onNoLibraries = 5; //normal is 5
//chrome.storage.sync.clear(); //TODO: for debugging

$(document).ready(function() {
  loadLibraries();

  $('#btnSave').click(function() {
    if (!quickAccess()) { saveLibraries(); }
  });

  $('#btnAdd').click(function() {
    if (!quickAccess()) { $('#menuStatusBar').text("").hide(); addRow(); }
  });

  $('#btnSetup').click(function() {
    //TODO disable button on click, re-enable when done
    $('btnSetup').prop('disabled', true);
    $('#setupStatusBar').text("").hide();
    $('#menuStatusBar').text("").hide();
    findLibraries();
  });

  $('#btnClearAndSetup').click(function() {
    //TODO disable button on click, re-enable when done
    $('btnClearAndSetup').prop('disabled', true);
    // Warn of serious nature and get confirmation to proceed
    // TODO: s/b modal, confirm won't work in chrome
    // r = window.confirm("Warning! This will delete all current libraries and replace them with those found in another tab.\n\nYou must be logged in to OverDrive.com with saved libraries before executing this command.");
    // if (r == true)
    $('#setupStatusBar').text("").hide();
    $('#menuStatusBar').text("").hide();
    findLibraries();
  });

  $('#btnCancelSetup').click(function() {
    newLibraryIndex = 10000; //set number of Libraries high in case still running
    //remove all listeners
    chrome.webRequest.onCompleted.removeListener(foundSavedLibraries);
    chrome.webRequest.onCompleted.removeListener(runWhenLoaded);
    $('#spinnerP').css('color','red').text('Cancelling...');
    $('#spinner').fadeOut(2000);
    $('#setupStatusBar').text("Warning! Last setup canceled.").show();
    $('btnSetup').prop('disabled', false); $('btnClearAndSetup').prop('disabled', false);
    $('#menu').html(''); newLibraryIndex = 0; onNoLibraries = 5; loadLibraries();
  });
});

function findLibraries() {
  //clear former libraries
  chrome.storage.sync.clear();
  chrome.runtime.onMessage.addListener(foundSavedLibraries);
  $('#spinnerP').css('color','black').text('Downloading saved libraries ... please wait');
  $('#spinner').fadeIn(1000);
  //request saved libraries
  console.log("requesting saved libraries")
  chrome.runtime.sendMessage({type: "_findSavedLibraries"});
}

function foundSavedLibraries(message) {
  if (message.type == "_foundSavedLibraries") {
    $('#spinnerP').text('Found saved libraries ... working');
    console.log("from overdrive_mls _foundSavedLibraries",message);
    switch (message.status) {
      case "Success":
        libraries = message.response.newLibraries;
        //save always, even before resolving vanity library URLs
        chrome.storage.sync.set({"libraries": message.response.newLibraries});
        newLibraryIndex = 0;
        var foundInvalid = false;
        //avoid slow loading into iframes if URLs are valid overdrive.com URLs
        while (libraries.length > newLibraryIndex && !foundInvalid) {
          var library = libraries[newLibraryIndex];
          //find first library that is invalid and load it into iframe
          if ( library.libraryURL.length > 0                           //if url not blank
            && (library.libraryURL.indexOf(".lib.overdrive.com") > 0   //and url is either .lib. form
            || library.libraryURL.indexOf(".overdrive.com") == -1 ) )  //or url is not at overdrive.com
          {
            console.log("first invalid libraryURL found: ", library.libraryURL);
            //runWhenLoaded onCompleted listener will handle the rest of the looping through libraries
            foundInvalid = true;
            chrome.webRequest.onCompleted.addListener(runWhenLoaded, {
              urls: ['<all_urls>'],
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
        //if all were well formed--save and clear spinner; otherwise, just fall through to end of listener...
        if (!foundInvalid) {
          setupDone();
        }
        break;
      case "Not logged in":
        $('#spinnerP').css('color','red').text(message.status);
        $('#spinner').fadeOut(2000);
        alert("Not logged into OverDrive. Please log into your OverDrive account to find library information from your saved libraries.");
        chrome.webRequest.onCompleted.removeListener(foundSavedLibraries);
        $('#setupStatusBar').text("Warning! Last setup failed: No user is logged in on OverDrive.com").show();
        $('btnSetup').prop('disabled', false); $('btnClearAndSetup').prop('disabled', false);
        $('#menu').html(''); newLibraryIndex = 0; onNoLibraries = 5; loadLibraries();
        break;
      case "No saved libraries":
        $('#spinnerP').css('color','red').text(message.status);
        $('#spinner').fadeOut(2000);
        alert("This OverDrive account has no saved libraries. Please save a list of local libraries to find library information for your local libraries (recommended), or enter them manually below.");
        chrome.webRequest.onCompleted.removeListener(foundSavedLibraries);
        $('#setupStatusBar').text("Warning! Last setup failed: User has no saved libraries on OverDrive.com").show();
        $('btnSetup').prop('disabled', false); $('btnClearAndSetup').prop('disabled', false);
        $('#menu').html(''); newLibraryIndex = 0; onNoLibraries = 5; loadLibraries();
        break;
    }
    console.log("foundSavedLibraries removed");
    chrome.webRequest.onCompleted.removeListener(foundSavedLibraries);
  }
}

//listener to run when iframe loaded -- loops through all remaining libraries to determine URLs if needed
function runWhenLoaded(iframeInfo) {
  console.log('runWhenLoaded: iframe loaded (onCompleted event fired), url: ', iframeInfo.url); //iframeSrcChanged
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
    if ( library.libraryURL.length > 0                          //if url is not blank
      && (library.libraryURL.indexOf(".lib.overdrive.com") > 0  //and url is either of .lib. form
      || library.libraryURL.indexOf(".overdrive.com") == -1) )  //or url is not at overdrive.com
    {
      console.log("invalid libraryURL found: ", library.libraryURL);
      //load tab in the iframe (uses bg.js webrequest listener to block x-frame-options header)
      $('#iframeOpt').attr('src', "http://"+library.libraryURL);
    } else {
      //TODO note URL could be empty--just leave it as is for now
      //valid libraryURL is already in libraries array
      console.log("valid libraryURL found: ", library.libraryURL);
    }
  } else {
    console.log("runWhenLoaded removed");
    chrome.webRequest.onCompleted.removeListener(runWhenLoaded);
    setupDone(); //when no more libraries
  }
}

function setupDone(){
  //done, need to sync or at least clear menu
  $('#spinnerP').css('color','green').text('Setup Complete!');
  $('#spinner').fadeOut(2000);
  $('btnSetup').prop('disabled', false); $('btnClearAndSetup').prop('disabled', false);
  console.log("setup done", libraries);
  $('#menu').html('');
  chrome.storage.sync.set({"libraries": libraries}, function() { onNoLibraries = 4; loadLibraries(); });
};

function loadLibraries() {
	//try to retrieve library list from chrome.storage.sync; if not there, parse saved debug libraries list
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
        var badURL = 'badURL';
        if (isValidURL(library.libraryURL)) { badURL = '';}
        libRows += "<tr>";
        libRows += "<td><input id='shortName" + libraryIndex + "' value='" + library.libraryShortName + "' class= 'ip ip1' maxlength='15' type='text'/></td>";
        libRows += "<td><input id='URL" + libraryIndex + "' value='" + library.libraryURL + "' class= 'ip "+ badURL + "' type='text'/></td>";
        libRows += "<td><input id='fullName" + libraryIndex + "' value='" + library.libraryFullName + "' class= 'ip' type='text'/></td>";
        libRows += "</tr>";
      }
    }
    //console.log("libRows: " + libRows);
    $('#menu').html(libRows);
    $(".ip").off('change').on('change', validateInput);
  });
}

function saveLibraries() {
  //save edits to libraries from form
  console.log('save libs', libraries);
  var librariesEdited = [];

  for (var libraryIndex in libraries) {
    libraryUrl = $('#URL'+libraryIndex).val().replace(/^https?:\/\//, '').replace(/overdrive.com.*/i,'overdrive.com').replace(/\.libraryreserve\.com.*/i,'.libraryreserve.com');
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
  chrome.storage.sync.set({"libraries": librariesEdited}, function(){
    if (librariesEdited.length > 0) {
      $('#menuStatusBar').css("color","green").text("Libraries saved").show();
      $('#setup').children("*").addClass("hidden");
      $('#normal').children("*").removeClass("hidden");
      $('#menu').html(''); libraries = librariesEdited; newLibraryIndex = 0; onNoLibraries = 5; loadLibraries();
    } else {
      $('#setupStatusBar').text("Libraries manually cleared").show();
      $('#setup').children("*").removeClass("hidden");
      $('#normal').children("*").addClass("hidden");
      $('#menuStatusBar').css("color","red").text("Libraries manually cleared").show();
      $('#menu').html(''); libraries = []; newLibraryIndex = 0; onNoLibraries = 5; loadLibraries();
    }
  });
}

function initLibraries(onNoLibraries) {
  //TODO: remove the quick access some MLS libraries for debugging
  //console.log('onNoLibraries: ' + onNoLibraries);
  if (onNoLibraries == 1) {
    libraries = [{ "libraryFullName": "Douglas County Libraries", "libraryShortName": "Douglas", "libraryURL": "dcl.overdrive.com" }];
    chrome.storage.sync.set({"libraries": libraries}, function() {
      $('#setupStatusBar').text("").hide();
      $('#menuStatusBar').text("").hide();
      loadLibraries();
    });
  }
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
    chrome.storage.sync.set({"libraries": libraries}, function() {
      $('#setupStatusBar').text("").hide();
      $('#menuStatusBar').text("").hide();
      loadLibraries();
    });
  }
  if (onNoLibraries == 3) {
    libraries = [
      { "libraryShortName": "Denver", "libraryURL": "Denver.overdrive.com", "libraryFullName": "Denver Public Library" },
      { "libraryShortName": "Arapahoe", "libraryURL": "Arapahoe.overdrive.com", "libraryFullName": "Arapahoe Library District" },
      { "libraryShortName": "Poudre", "libraryURL": "PoudreRiver.libraryreserve.com", "libraryFullName": "Poudre River Library District" },
      { "libraryShortName": "Boulder", "libraryURL": "FrontRange.overdrive.com", "libraryFullName": "Front Range Downloadable Library" }
    ];
    chrome.storage.sync.set({"libraries": libraries}, function() {
      $('#setupStatusBar').text("").hide();
      $('#menuStatusBar').text("").hide();
      loadLibraries();
    });
  }
  //trigger on run: may eventually be used to auto setup?
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
  libRows += "<td><input id='shortName" + index + "' value='' class='ip ip1' maxlength='15' type='text'/></td>";
  libRows += "<td><input id='URL" + index + "' value='' class='ip badURL' type='text'/></td>";
  libRows += "<td><input id='fullName" + index + "' value='' class='ip' type='text'/></td>";
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

function validateInput(elem) {
  //console.dir(elem);
  if (typeof $(elem).attr('id') === "undefined") {elem = elem.target; console.log("elem set to elem.target",elem);} else {console.log("elem ok", elem)}
  if ($(elem).length == 0) {return;}
  //if an URL
  if ($(elem).attr('id').indexOf("RL") > 0) {
    $(elem).val( $(elem).val().replace(/[^\.a-z0-9:\/ _]/gi,'') ); //limit allowable characters
    $(elem).val($(elem).val().trim()); //trim it up
    $(elem).val($(elem).val().replace(/^https?:\/\//, '').replace(/\.libraryreserve\.com.*/i,'.libraryreserve.com').replace(/\.overdrive\.com.*/i,'.overdrive.com'.trim()));
    var thisurl = $(elem).val();  //thisurl is the URL
    if (thisurl.length > 0) {
      console.log("thisurl: " + thisurl);
      if (isValidURL(thisurl)) {
        $(elem).removeClass('badURL');
      } else {
        $(elem).addClass('badURL');
      }
    } else {
      $(elem).addClass('badURL');
    }
  } else {
    //if not an URL
    $(elem).val( $(elem).val().replace(/[^a-z0-9 _]/gi,'') ); //limit allowable characters
    $(elem).val($(elem).val().trim());
  }
}

function isValidURL(thisurl) {
  thisurl = thisurl.toLowerCase();
  if (thisurl.indexOf('.lib.') == -1 && //no .lib. allowed
      ( thisurl.indexOf(".overdrive.com") > 0 //and either overdrive but not www.overdrive
      && thisurl.indexOf("www.overdrive.com") == -1 )
      || ( thisurl.indexOf(".libraryreserve.com") > 0  //or libraryreserve but not www.libraryreserve
      && thisurl.indexOf("www.libraryreserve.com") == -1 )
    ) {return true;}
  else {return false;}
}

function quickAccess(){
  //TODO: remove quick access some MLS libraries for debugging
  if ($('#shortName0').val() == "goLib1") {initLibraries(1); return true;}
  if ($('#shortName0').val() == "goLib2") {initLibraries(2); return true;}
  if ($('#shortName0').val() == "goLib3") {initLibraries(3); return true;}
  if ($('#shortName0').val() == "clearLib") {
    chrome.storage.sync.clear(function() {
      $('#setupStatusBar').text("Cleared all libraries").show();
      $('#menuStatusBar').text("Cleared all libraries").show();
      $('#menu').html(''); libraries = []; newLibraryIndex = 0; onNoLibraries = 5; loadLibraries();
    });
    return true;
  }
  return false;
}
