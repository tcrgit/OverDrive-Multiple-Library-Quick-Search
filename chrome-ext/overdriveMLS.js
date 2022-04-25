// Injects Multiple Library Search results into OverDrive search and media pages
console.log("overdriveMLS_load");

var port = chrome.runtime.connect();
port.postMessage({console: 'test post from injected script'});

var libraries = [], fullsize = 300, noLibrariesDone = false;
var noLibrariesMsg = "<div id='noLibraries'>No OverDrive libraries found. Please go to the <span id='optPage' style='font-weight:bold'>options page</span> to setup some OverDrive libraries to search.</div>";

$(document).ready(function() {
	console.log("overdriveMLS document ready");

/* 
	in Opera possibly European cookie problem), there is no dataLayer global var
	everywhere else  there is. Might be related to that or opera or another extension!
	In opera and in Chrome (but not firefox) there is a window.OverDrive.isLoggedIn variable... and some related others.
	//if (window.OverDrive.isLoggedIn === undefined) { console.log('old datalayer method'); }

*/
	//get overdrive datalayer
	var varList = retrieveWindowVariables( ["dataLayer"] );  //js var inaccessible due to sandboxing of extension, trick
	//console.log(varList);
	//console.log(varList.dataLayer);
    //console.log(varList.OverDrive);
	ODdataLayer = JSON.parse(varList.dataLayer)[0];
	if (ODdataLayer === undefined) { console.log('new datalayer method'); }

	console.log(ODdataLayer);

	//determine if this is a search page and set positions, variables for injection
	var searchPage=false, resultsPaneSearchNote = "", resultsPaneRight = "100px", resultsPaneTop = "110px";
	if (document.URL.includes("overdrive.com/search")) {
		searchPage = true;
		resultsPaneSearchNote = '<br><span id="searchBookTitle">for the first book on left</span>';
		resultsPaneTop = "110px"; resultsPaneRight = "100px";
	};
	//try to get formatting values from header and div.mainNav if they exist
	if ( $('header').length > 0  ) { resultsPaneTop = $('header').height() + 1 + "px";  }
	if ( $('div.mainNav').length > 0  ) { resultsPaneRight = ( window.innerWidth - $('div.mainNav').width() ) / 2 + 12 + "px"; }

	//inject media results pane for MLS info -- use inline element styles to format on injection
	$('body').append('<div id="resultsPane" style="font-size: 17px; position:fixed; top:' + resultsPaneTop + '; right:' + resultsPaneRight + '; min-height:35px; width:350px; padding:3px 10px 5px 10px; border:black 2px solid; border-radius:5px; background:white; z-index:3; font-family: LinetoBrown, Helvetica Neue, Helvetica, Arial, Verdana, sans-serif; overflow:hidden;"><p id="MLSresultsTitle" style="text-align:center;"><b>Multiple Library Search Results</b>'+resultsPaneSearchNote+'</p><div id="MLSresults"></div></div>');

	//make results pane shrink and expand when clicked
	var shrunk = 35;
	$(document).on('click', '#resultsPane', function(e) {
		console.log("target of click on results: ",e);
		if ($(e.target).is('a, a *')) return;
		//console.log("resultsPane.outerHeight: " + $('#resultsPane').outerHeight(), "fullsize: " + fullsize);
		newResultsHeight = ($('#resultsPane').height() < 40) ? fullsize : shrunk;
		//console.log("newResultsPane.height: "+ newResultsHeight);
		$('#resultsPane').animate({
	    height: newResultsHeight
		});
	});

	//get reserveID for book
	if (searchPage) {
		//analyze search results page for first book title and reserveID
		//get shortened title and embed in results
		var bookTitle = $('div.title-result-row__details:first a').text();
		//inject title into #searchBookTitle
		$('#searchBookTitle').html('for the first book at the top left <br><i>'+bookTitle+'</i>');

		//find reserveid embedded in img filename -- not sure how reliable this is
		var firstItemImg = $('div.title-result-row:first img');
	  //console.log(firstItemImg[0].src);
		var match = /%7B(.*)%7D/.exec(firstItemImg[0].src);
		bookid = match[1];
		console.log("(search) reserveID: "+bookid);

	}	else {
		//analyze media page for book reserveID
		book = ODdataLayer.content;
		bookid = book.reserveID; //this is what we need to construct url from
		console.log("(media) reserveID: "+bookid);
	}

	//try to retrieve library list from chrome.storage;
	chrome.storage.sync.get("libraries", function(obj) {
		libraries = obj["libraries"];
		//libraries = []; //for debugging
		if (!libraries || libraries.length == 0) {
			console.log("no libraries loaded");
			//add msg suggesting they open the options page
			$('#resultsPane').append(noLibrariesMsg); noLibrariesDone = true;
			$(document).on('click', '#optPage', function() {
				console.log('optPage clicked');
				chrome.runtime.sendMessage({
					type: "_openOptionsPage",
					response: "No libraries loaded"
				});
			});
		}
		console.log("sync.get libraries:", libraries);
	  findBooks();
	});
}); //end document ready

function findBooks() {
	console.log('findBooks');
	var libsDone = 0;
	// for each library, create url to query it
	for (var libraryIndex in libraries) {
		var library = libraries[libraryIndex];
		//skip if URL empty or not .overdrive.com
		if ( library.libraryURL.length > 0
					&& (library.libraryURL.indexOf(".libraryreserve.com") > 0 )
					|| (library.libraryURL.indexOf(".overdrive.com") > 0
					&& library.libraryURL.indexOf(".lib.overdrive.com") == -1
					&& library.libraryURL.indexOf("www.overdrive.com") == -1 )
				)
		{
			libsDone++;
			console.log('libraryURL ', library.libraryURL, libraryIndex);
			//set item URL for ajax accordingly
			if (library.libraryURL.indexOf(".libraryreserve.com") > 0 ) {
				itemURL = "https://" + library.libraryURL + "/ContentDetails.htm?id="+bookid;
			} else { itemURL = "https://" + library.libraryURL + "/media/" + bookid; }
			console.log("sendingMessage: "+itemURL);
			//need to comply with CORBS https://www.chromestatus.com/feature/5629709824032768
			chrome.runtime.sendMessage(
				{type: "_libraryStatus", url: itemURL, libraryShortName: library.libraryShortName},
				function(responseObj) {
					//console.log(responseObj);
					//update resultsPane with availability information
					var availString = "";
					if (responseObj.isAvailable) {
						availString = "<b><a target='_blank' href='" + responseObj.url + "'>" + responseObj.libraryShortName + "</a>: <a target='_blank' href='" + responseObj.url + "' style='color:#73CEE1'>Available to borrow!</a></b><br>";
					} else {
						if (responseObj.libCopies > 0) {
							availString = "<b><a target='_blank' href='" + responseObj.url + "'>" + responseObj.libraryShortName + "</a>:</b> " + responseObj.numHolds + " hold" + (responseObj.numHolds == 1 ? "" : "s") + " on " + responseObj.libCopies + " cop" + (responseObj.libCopies == 1 ? "y" : "ies") + "(" + Math.round(responseObj.numHolds/responseObj.libCopies) + " per)<br>";
						} else {
							availString = "<b><a target='_blank' href='" + responseObj.url + "'>" + responseObj.libraryShortName + "</a>:</b> No copies owned<br>";
						}
					}
					//console.log(availString);
					$('#MLSresults').append(availString);
					fullsize = $('#resultsPane').outerHeight();
					//console.log("fullsize: "+fullsize);
				}
			);
	  }
	} //end libraries array for loop
	//if no valid libraries, display noLibrariesMsg if not displayed already
	if (!libsDone && !noLibrariesDone) {
		$('#resultsPane').append(noLibrariesMsg);
		$(document).on('click', '#optPage', function() {
			console.log('optPage clicked');
			chrome.runtime.sendMessage({
				type: "_openOptionsPage",
				response: "No libraries loaded"
			});
		});
	}
}

function retrieveWindowVariables(variables) {
    var ret = {};
    var scriptContent = "";
    for (var i = 0; i < variables.length; i++) {
        var currVariable = variables[i];
				scriptContent += "if (typeof " + currVariable + " !== 'undefined') $('body').attr('tmp_" + currVariable + "', JSON.stringify(" + currVariable + "));\n"
    }
    var script = document.createElement('script');
    script.id = 'tmpScript';
    script.appendChild(document.createTextNode(scriptContent));
    (document.body || document.head || document.documentElement).appendChild(script);
    for (var i = 0; i < variables.length; i++) {
        var currVariable = variables[i];
        ret[currVariable] = $("body").attr("tmp_" + currVariable);
        $("body").removeAttr("tmp_" + currVariable);
    }
    $("#tmpScript").remove();
    return ret;
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

//listener to pass messages from options to findSavedLibraries and back
port.onMessage.addListener(message => {
	console.log('odmls_listener');
	port.postMessage({console: 'inside listener: test post'});
	if (message.type == '_cs_findSavedLibraries') {
		port.postMessage({console: 'inside listener: cs_findSavedLibs received test post'});
		console.log('cs_findSavedLibs received');
		//findlibraries
		$(document).ready(function() {
			//get overdrive datalayer
			var varList = retrieveWindowVariables(["dataLayer"]);  //js var inaccessible due to sandboxing of extension, trick
			ODdataLayer = JSON.parse(varList.dataLayer)[0];
			console.log(ODdataLayer);
			if (isLoggedIn(ODdataLayer)) {
				//OD changed the format of the page...
				//give page 3 seconds to load
				setTimeout(function(){
					var newLibraries=[];
					//if saved libraries
					if ( $('div.saved-libraries-header').length > 0 ) {
						$('a.btn').each(function(){
							console.log($(this).data("name"), $(this).attr("href"));
							libraryFullName = $(this).data("name").trim();
							newLibraries.push({
								"libraryShortName": libraryFullName.firstWord(),
								"libraryURL": $(this).attr('href').replace(/https?:\/\//i,'').replace(/\/Content.*/,''),
								"libraryFullName": libraryFullName
							});
						});
						libStatus = "Success";						
					} else {
						libStatus = "No saved libraries";
					}
					chrome.runtime.sendMessage({
						type: "_foundSavedLibraries",
						status: libStatus,
						response: {newLibraries}
					});
				},3000); //wait before trying to get names & urls and send it back
			} else {
				chrome.runtime.sendMessage({
					type: "_foundSavedLibraries",
					status: "Not logged in",
					response: {}
				});
			}
		});
	}
});

function isLoggedIn(ODdataLayer) {
  // make sure user is logged in
  if (ODdataLayer.session.status != "logged in") { return false; }
	return true;
}

//extend string prototype to find first word by breaking on space if present
String.prototype.firstWord = function (){
		return (this.indexOf(' ') !== -1) ? this.substr(0, this.indexOf(' ')) : this;
};
