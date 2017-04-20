// Injects Multiple Library Search results into OverDrive search and media pages
console.log("overdriveMLS_load");

var port = chrome.runtime.connect();
port.postMessage({console: 'test post from injected script'});

var libraries = [], fullsize = 300, noLibrariesDone = false;
var noLibrariesMsg = "<div id='noLibraries'>No OverDrive libraries found. Please go to the <span id='optPage' style='font-weight:bold'>options page</span> to setup some OverDrive libraries to search.</div>";

$(document).ready(function() {
	console.log("overdriveMLS document ready");

	//get overdrive datalayer
	var varList = retrieveWindowVariables(["dataLayer"]);  //js var inaccessible due to sandboxing of extension, trick
	ODdataLayer = JSON.parse(varList.dataLayer)[0];
	//console.log(ODdataLayer);

	//determine if this is a search page and set positions, variables for injection
	var searchPage=false; var resultsPaneRight="30px"; resultsPaneTop="90px"; resultsPaneSearchNote = "";
	if (document.URL.includes("overdrive.com/search")) {
		searchPage = true;
		resultsPaneRight = "400px";
		resultsPaneTop = "60px";
		resultsPaneSearchNote = '<br><span id="searchBookTitle">for the first book on left</span>';
	};

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
		//analyze search results page for first book reserveID
		//var firstItem = $('div.title-result-row:first'); //console.log(firstItem);
		//bookisbn might eventually be useful if we have to ajax the media/{isbn} page to find reserveID
		//bookisbn = $('div.title-result-row:first').data("isbn") //console.log("isbn: "+bookisbn);

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
		//bookid = "cc74f466-085d-4567-91ff-31220263dee9";
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
			//libraries = [{ "libraryShortName": "Arapahoe", "libraryURL": "Arapahoe.overdrive.com", "libraryFullName": "Arapahoe Library District" }];
			//chrome.storage.sync.set({"libraries": libraries});
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
		//console.log(library.libraryShortName + ": " + library.libraryURL);
		//skip if URL empty or not .overdrive.com
		if (
			library.libraryURL.length > 0
			&& library.libraryURL.indexOf(".overdrive.com") > 0
			&& library.libraryURL.indexOf(".lib.overdrive.com") == -1
			&& library.libraryURL.indexOf("www.overdrive.com") == -1
		) {
			libsDone++;
			console.log('libraryURL ', library.libraryURL, libraryIndex);
			overdriveUrl = "https://" + library.libraryURL + "/media/" + bookid;
			$.ajax({
				url: overdriveUrl,
				libraryShortName: library.libraryShortName
			}).done(function( data, textStatus, jqXHR ) {
				//extract the list of books from js variable
				var match = /\.mediaItems ?=(.*?});/.exec(data);
				if (match) {
					bookList = JSON.parse(match[1].trim());
					// iterate over books; even with a single item data it is formatted this way
					for (var key in bookList) {
						var book = bookList[key];
						//console.log(book);
						//update resultsPane with availability information
						var availString = "";
						if (book.isAvailable) {
							availString = "<b><a target='_blank' href='" + this.url + "'>" + this.libraryShortName + "</a>: <a target='_blank' href='" + this.url + "' style='color:#73CEE1'>Available to borrow!</a></b><br>";
						}
						else {
							if (book.ownedCopies) {
								availString = "<b><a target='_blank' href='" + this.url + "'>" + this.libraryShortName + "</a>:</b> " + book.holdsCount + " hold" + (book.holdsCount == 1 ? "" : "s") + " on " + book.ownedCopies + " cop" + (book.ownedCopies == 1 ? "y" : "ies") + "<br>";
							} else {
								availString = "<b><a target='_blank' href='" + this.url + "'>" + this.libraryShortName + "</a>:</b> No copies owned<br>"
							}
						}
						//console.log(availString);
						$('#MLSresults').append(availString);
						fullsize = $('#resultsPane').outerHeight();
						//console.log("fullsize: "+fullsize);
					}
				}
		  });
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
			//console.log(ODdataLayer);
			if (isLoggedIn(ODdataLayer)) {
				setTimeout(function(){
					var newLibraries=[];
	     		firstLibraryName = $('span.btn__sub-label:first').text().trim().replace(/^at /m,'');
					//console.log('firstLibraryName: '+firstLibraryName);
					//if no libraries...
					if (firstLibraryName == "in your library") {
						status = "No saved libraries";
					} else {
						status = "Success";
						//collect list of libraries
						//if more than 1 library h3 tag will read Other saved libraries
						if ( $('div.acquirebar-btns h3').text().indexOf("Other saved libraries") > -1) {
							libraryTags = $('div.acquirebar-btns a');
							libraryTags.each(function(i,e){
								//fix first with narrower, trimmed, & replaced string
								libraryFullName=$(e).text().trim(); if (i==0) {libraryFullName = firstLibraryName;}
								//console.log("i=" + i  + " " + libraryFullName) + " " , $(e).attr('href');
								//skip last (find in all libraries)
								if (i < libraryTags.length-1){
									newLibraries.push({
										"libraryShortName": libraryFullName.firstWord(),
										"libraryURL": $(e).attr('href').replace(/https?:\/\//i,'').replace(/\/Content.*/,''),
										"libraryFullName": libraryFullName
									});
								}
							});
						} else {
							firstLibraryURL = $('div.acquirebar-btns a:first').attr('href');
							console.log("first URL, 1 library only",firstLibraryURL);
							newLibraries.push({
								"libraryShortName": firstLibraryName.firstWord(),
								"libraryURL": firstLibraryURL.replace(/https?:\/\//i,'').replace(/\/Content.*/,''),
								"libraryFullName": firstLibraryName
							});
						}
					}
					chrome.runtime.sendMessage({
						type: "_foundSavedLibraries",
						status: status,
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
