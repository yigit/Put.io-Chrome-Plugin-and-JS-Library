var extRegex = /\.([^\.]+)$/;
var preferredExts = ["torrent", "zip", "rar", "tar" , "gz"];
var nonPreferredExts = ["html", "php", "asp", "aspx"];
var preferredSitesRegex = /(rapidshare|hotfile|mediafile)/;

var SCORES = {
	YES : 2,
	MAYBE : 1,
	NO : 0
};

function calculateHrefScore(href) {
	var ext = href.match(extRegex);
	if(ext && ext[1]) {
		if(preferredExts.indexOf(ext[1]) != -1) {
			return SCORES.YES;
		}
	}
	if(preferredSitesRegex.test(href)) {
		return SCORES.YES;
	}
	return (ext && ext[1] && nonPreferredExts.indexOf(ext[1]) == -1) ? SCORES.MAYBE : SCORES.NO; 
};

chrome.extension.onRequest.addListener(
  function(request, sender, sendResponse) {
      console.log(request);
        if(request.parseKeys) {
            var apiKeyDiv = $$('.api-key')[0];
            var error = "";
            var apiKey = null;
            var apiSecret = null;
            if(!apiKeyDiv) {
                sendResponse({error : "Could not find api key and secret. Are you sure you are in 'http://put.io/account/settings' ? ", api_key : apiKey, api_secret : apiSecret}); 
                return;
            }
            var formTexts = apiKeyDiv.select('.form-text');
            if(!formTexts || formTexts.length < 2) {
                sendResponse({error : "Could not parse api key and secret", api_key : apiKey, api_secret : apiSecret}); 
                return;
            }
            apiKey = formTexts[0].innerText;
            apiSecret = formTexts[1].innerText;
            sendResponse({error : null, api_key : apiKey, api_secret : apiSecret});
        } else if(request.innerHTML) {
            var html = document.getElementsByTagName("html")[0].innerHTML;
            sendResponse({error : null, innerHTML : html});
        }
        else {
		    var anchors = document.getElementsByTagName('a');
    		var hrefs = [];
    		var preferred = [];
    		var nonPreferred = [];
    		var notGood = [];
    		for(var i = 0; i < anchors.length; i++) {
    			var href = anchors[i].getAttribute('href');
    			var value = anchors[i].innerHTML; 
    			if(!href) {
    				continue;
    			}
    			var score = calculateHrefScore(href);
    			var tuple = {href : href, value : value};
    			switch(score) {
    				case SCORES.YES:
    					preferred.push(tuple);
    					break;
    				case SCORES.MAYBE:
    					nonPreferred.push(tuple);
    					break;
    				case SCORES.NO :
    					notGood.push(tuple);
    			}
    		}
    		sendResponse({preferred : preferred, nonPreferred : nonPreferred, notGood : notGood});
		}
  });
