function submitq() {
  var response = document.getElementById('q').value;
  if (response.length < 1) {
    return false;
  } else {
    var bookFormat = '', debug = false;
    var URLbase = 'https://www.overdrive.com/search?q=';
    var q = encodeURIComponent(response);
    var localLibs = '&autoLibrary=f&autoRegion=t';

    if (document.getElementById("eBookOnly").checked) {bookFormat = '&f-formatClassification=eBook';}
    if (document.getElementById("AudiobookOnly").checked) {bookFormat = '&f-formatClassification=Audiobook';}

    var overdriveURL = URLbase + q + localLibs + bookFormat
    var infostring = "Query: "+ q + "   Format: " + bookFormat;
    console.log(infostring);
    console.log(overdriveURL);

    if (debug) { document.getElementById("result").innerHTML = infostring; return false;}

    //open the overdrive URL in a new tab or window
    window.open(overdriveURL);
    return false;
  }
}

document.addEventListener("DOMContentLoaded", function () {
    document.getElementById("submitSearch").onclick = submitq;
});
