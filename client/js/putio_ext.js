PE = {
    _version : 103, //= 0.03
    UPDATE_SERVER : "http://github.com/downloads/yigit/Put.io-Chrome-Plugin-and-JS-Library/version.json",
    _downloadItems : [],
    init : function() {
        this.UI.init();
        this.Tracking.init();
        if(!this.getApiKey() || !this.getApiSecret()) {
            this.UI.showSettingsPage();
            this.parseKeys();
        } else {
            Putio.init(this.getApiKey(), this.getApiSecret());
            PE.anayzeUrl();
        }
    },
    checkForUpdate : function() {
        new Ajax.Request(this.UPDATE_SERVER, 
            {parameters : {}, 
             method: 'get',
             cache : 'false',
             onSuccess : function(response) {
                 var json = null;
                 try {
                     json = response.responseJSON || response.responseText.evalJSON(); 
                 }catch(e) {
                     json = {error : true, error_message : "Could not parse response"};
                 }
                 if(json.version > this._version) {
                     this.UI.displayUpdate(json);
                 }
             }.bind(this)
            });
    },
    getApiKey : function() {
        return localStorage.api_key;
    },
    getApiSecret : function() {
        return localStorage.api_secret;
    },
    cancelTransfer : function(id, sure) {
        if(sure === undefined) {
            this.UI.confirmTransferCancel(Putio.getTransfer(id));
        } else if(sure === true) {
            Putio.Transfer.cancel(id, function() {
                this.listTransfers();
            }.bind(this));
        } else {
            this.UI.updateTransfer(Putio.getTransfer(id));
        }
    },
    deleteFile : function(id, sure) {
        var file = Putio.getFile(id);
        if(sure === undefined) {
            this.UI.confirmFileDelete(file);
        } else if(sure === true) {
            Putio.Files.del(id, function() {
                this.listFiles(file.parent_id);
            }.bind(this));
        } else {
            this.UI.updateFile(file);
        }
    },
    saveApiKeyAndSecret : function(key, secret) {
        localStorage.api_key = key;
        localStorage.api_secret = secret;
        this.api_key = key;
        this.api_secret = secret;
        Putio.init(this.getApiKey(), this.getApiSecret());
    },
    parseKeys : function() {
        chrome.tabs.getSelected(null, function(tab) {
          chrome.tabs.sendRequest(tab.id, {parseKeys : true}, function(response) {
              console.log(response);
              if(response.api_secret && response.api_key) {
                  this.saveApiKeyAndSecret(response.api_key, response.api_secret);
                  this.UI.showGrabbedKeys();
              }
          }.bind(this));
        }.bind(this));
        
    },
    listFiles : function(id) {
        var id = id || 0;
        Putio.Files.list(function(e) {
            this.UI.listFiles(e.response.results, Putio.getFile(id));
        }.bind(this),id);
    },
    listTransfers : function() {
        Putio.Transfer.list(function(e) {
            this.UI.listTransfers(e.response.results);
        }.bind(this));
    },
    showMyAccount : function() {
        Putio.User.info(
            function(e) {
                var res = e.response.results[0];
                this.UI.showMyAccount(res);
            }.bind(this)
            );
    },
    _addDownloadItem : function(item) {
        this._downloadItems.push(item);
        item.downloadId = this._downloadItems.length - 1;
    },
    _addDownloadItems : function(items) {
        items.each(this._addDownloadItem.bind(this));
    },
    _getDownloadItem : function(id) {
        return this._downloadItems[id];
    },
    anayzeUrl : function() {
        document.fire(this.EVENTS.ANALYZING_URL, {});
        chrome.tabs.getSelected(null, function(tab) {
            var url = tab.url;
            if(!url) {
                return;
            }
            Putio.Url.extracturls(url, null, function(e) {
                var res = e.response.results;
                urls = [];
                res.each(function(item) {
                    urls.push(item.url);
                });
                urls = urls.uniq();
                document.fire(this.EVENTS.ANALYZED_URL, urls);
                Putio.Url.analyze(urls, function(e) {
                    this._onUrlsAnayzed(e);
                }.bind(this));
            }.bind(this));
            
        }.bind(this));
    },
    analyzeSource : function() {
        chrome.tabs.getSelected(null, function(tab) {
            chrome.tabs.sendRequest(tab.id, {innerHTML : true}, function(response) {
                console.log(response);
                Putio.Url.extracturls(response.innerHTML);
            });
        });
    },
    analyzePage : function() {
        chrome.tabs.getSelected(null, function(tab) {
          chrome.tabs.sendRequest(tab.id, {}, function(response) {
            if(!response || !response.preferred || !response.nonPreferred) {
                return;
            }
            document.fire(this.EVENTS.EXTRACTED_LINKS, {links : response});
        	anchors = response.preferred.concat(response.nonPreferred).collect(function(i){return i.href});
        	response.preferred.length && Putio.Url.analyze(response.preferred.collect(function(i){return i.href}), this._onUrlsAnayzed.bind(this));
        	response.nonPreferred.length && Putio.Url.analyze(response.nonPreferred.inGroupsOf(10)[0].collect(function(i){return i.href}), this._onUrlsAnayzed.bind(this));
          }.bind(this));
        }.bind(this));
    },
    _onUrlsAnayzed : function(resp) {
        var items = resp.response.results.items;
		this._addDownloadItems(items.multiparturl);
		this._addDownloadItems(items.torrent);
		this._addDownloadItems(items.singleurl);
		document.fire(this.EVENTS.VERIFIED_URLS, items);
    },
    dowloadItem : function(downloadId) {
        var item = this._getDownloadItem(downloadId);
        if(!item) {
            return;
        }
        var urls = [];
        if(item.parts) {
            urls = item.parts.collect(
                function(part) {
                    return part.url;
                }
                );
        } else {
            urls.push(item.url);
        }
        Putio.Transfer.add(urls, function(e) {
                   document.fire(this.EVENTS.ADD_TRANSFER_RESPONSE, {response : e, item : item});
               }.bind(this));
    },
    EVENTS : {
        EXTRACTED_LINKS : "pe:extracted_links",
        VERIFIED_URLS : "pe:verified_urls",
        ADD_TRANSFER_RESPONSE : "pe:add_transfer_result_received",
        ANALYZING_URL : "pe:analyze_url",
        ANALYZED_URL : "pe:analyzed_url"
    }
};

PE.UI = {
    _content : null,
    _status : null,
    _loading : null,
    _uservoiceScriptDiv : null,
    init : function() {
        this._content = $('content');
        this._status = $('status');
        this._loading = $('loading');
        document.observe(PE.EVENTS.EXTRACTED_LINKS, this._onLinksExtracted.bind(this));
        document.observe(PE.EVENTS.VERIFIED_URLS, this._onUrlsVerified.bind(this));
        document.observe(PE.EVENTS.ADD_TRANSFER_RESPONSE, this._onAddTransfer.bind(this));
        document.observe(PE.EVENTS.ANALYZING_URL, this._analyzingUrl.bind(this));
        document.observe(PE.EVENTS.ANALYZED_URL, this._analyzedUrl.bind(this));
        
        document.observe(Putio.EVENTS.REQUEST_START, this._updateLoading.bind(this));
        document.observe(Putio.EVENTS.REQUEST_END, this._updateLoading.bind(this));
        document.observe(Putio.EVENTS.REQUEST_ERROR, this._onRequestError.bind(this));
        
        this._loadUserVoice();
    },
    listFiles : function(files, parent) {
        var html = this.TEMPLATES.FILES.header.interpolate(parent);
        if(parent.parent_id) {
            html += this.TEMPLATES.FILES.up.interpolate(Putio.getFile(parent.parent_id));
        }
        files.each(
            function(file) {
                html += file.download_url
                            ? this.TEMPLATES.FILES.download_item.interpolate(file)
                            : this.TEMPLATES.FILES.item.interpolate(file);
            }.bind(this)
            );
        html += this.TEMPLATES.FILES.footer;
        this._content.innerHTML = html;
    },
    listTransfers : function(transfers) {
        var html = "";
        if(transfers.length == 0) {
            html = this.TEMPLATES.TRANSFERS.no_transfers;
        } else {
            html = this.TEMPLATES.TRANSFERS.header;
            transfers.each(
                function(transfer) {
                    html += this.TEMPLATES.TRANSFERS.item.interpolate(transfer);
                }.bind(this)
                );
            html += this.TEMPLATES.TRANSFERS.footer;
        }
        this._content.innerHTML = html;
    },
    showMyAccount : function(data) {
        data.bw_quota_available = this.Helper.bytesToSize(data.bw_quota_available, 2);
        data.disk_quota = this.Helper.bytesToSize(data.disk_quota, 2);
        data.disk_quota_available = this.Helper.bytesToSize(data.disk_quota_available, 2);
        data.bw_quota = this.Helper.bytesToSize(data.bw_quota, 2);
        var html = "";
        html += this.TEMPLATES.MYACCOUNT.header;
        html += this.TEMPLATES.MYACCOUNT.content.interpolate(data);
        html += this.TEMPLATES.MYACCOUNT.footer;
        this._content.innerHTML = html;
    },
    confirmTransferCancel : function(transfer) {
        if(!transfer || !$('transfer_' + transfer.id)) {
            return;
        }
        $('transfer_' + transfer.id).outerHTML = this.TEMPLATES.TRANSFERS.item_cancel.interpolate(transfer);
    },
    updateTransfer : function(transfer) {
        if(!transfer || !$('transfer_' + transfer.id)) {
            return;
        }
        $('transfer_' + transfer.id).outerHTML = this.TEMPLATES.TRANSFERS.item.interpolate(transfer);
    },
    confirmFileDelete : function(file) {
        if(!file || !$('file_' + file.id)) {
            return;
        }
        $('file_' + file.id).outerHTML = this.TEMPLATES.FILES.item_delete.interpolate(file);
    },
    updateFile : function(file) {
        if(!file || !$('file_' + file.id)) {
            return;
        }
        $('file_' + file.id).outerHTML = file.download_url
                    ? this.TEMPLATES.FILES.download_item.interpolate(file)
                    : this.TEMPLATES.FILES.item.interpolate(file);
    },
    _updateLoading : function(e) {
        if(e.memo.activeRequestCount > 0) {
            this._loading.show();
        } else {
            this._loading.hide();
        }
    },
    _analyzingUrl : function(e) {
        this.setStatus(this.TEMPLATES.LINK_EXTRACT.analyzeUrl);
    },
    _analyzedUrl : function(e) {
        this.setStatus(this.TEMPLATES.LINK_EXTRACT.analyzedUrl.interpolate({count : e.memo.length}));
        this._content.innerHTML += this.TEMPLATES.URL_VERIFIED.general;
    },
    _onRequestError : function(e) {
        if(e.memo.error) {
            this.setStatus(e.memo.error_message);
        }
    },
    _onLinksExtracted : function(e) {
        this.setStatus(this.TEMPLATES.LINK_EXTRACT.general.interpolate({
            preferred : e.memo.links.preferred.length,
            nonPreferred : e.memo.links.nonPreferred.length,
            notGood : e.memo.links.notGood.length,
        }));
        this._content.innerHTML = this.TEMPLATES.URL_VERIFIED.general;
    },
    _onUrlsVerified : function(e) {
        var urlListElm = $('verified_urls_list');
        if(!urlListElm) {
            return;
        }
        var items = e.memo || [];
        urlListElm.innerHTML += this.TEMPLATES.URL_VERIFIED.itemHeader.interpolate({count : items.torrent.length + items.singleurl.length + items.multiparturl.length});
        console.log(items);
        items.torrent.concat(items.singleurl).each(
            function(item) {
                urlListElm.innerHTML += this.TEMPLATES.URL_VERIFIED.item.interpolate(item);
            }.bind(this)
            );
        items.multiparturl.each(
            function(item) {
                urlListElm.innerHTML += this.TEMPLATES.URL_VERIFIED.multipart_item.interpolate(item);
            }.bind(this)
            );
    },
    _onAddTransfer : function(e) {
        $('action_' + e.memo.item.downloadId).innerHTML = "downloading...";
    },
    setStatus : function(text) {
        if(!text) {
            this._status.hide();
            return;
        }
        this._status.show();
        this._status.innerHTML = text;
    },
    showSettingsPage : function() {
        this.setStatus(this.TEMPLATES.SETTINGS.general);
    },
    showGrabbedKeys : function() {
        this.setStatus(this.TEMPLATES.SETTINGS.grabbed_keys.interpolate({key : PE.getApiKey(), secret : PE.getApiSecret()}));
    },
    showFeedback : function(uservoiceScript) {
        var uservoiceOptions = {
            key: 'putiochrome',
            host: 'putiochrome.uservoice.com', 
            forum: '68077',
            lang: 'en',
            showTab: false
        };
        UserVoice.Popin.show(uservoiceOptions);
        //make sure content has enough height to hold
        //feedback div
        var dims = $('content').getDimensions();
        if(dims.height < 350) {
            $('content').style.height = "350px";
        }
    },    
    _loadUserVoice : function() {
        var s = document.createElement('script');
        s.src = ("https:" == document.location.protocol ? "https://" : "http://") + "cdn.uservoice.com/javascripts/widgets/tab.js";
        document.getElementsByTagName('head')[0].appendChild(s);
        
    },
    Helper : {
        bytesToSize : function (bytes, precision)
        {	
        	var kilobyte = 1024;
        	var megabyte = kilobyte * 1024;
        	var gigabyte = megabyte * 1024;
        	var terabyte = gigabyte * 1024;

        	if ((bytes >= 0) && (bytes < kilobyte)) {
        		return bytes + ' B';

        	} else if ((bytes >= kilobyte) && (bytes < megabyte)) {
        		return (bytes / kilobyte).toFixed(precision) + ' KB';

        	} else if ((bytes >= megabyte) && (bytes < gigabyte)) {
        		return (bytes / megabyte).toFixed(precision) + ' MB';

        	} else if ((bytes >= gigabyte) && (bytes < terabyte)) {
        		return (bytes / gigabyte).toFixed(precision) + ' GB';

        	} else if (bytes >= terabyte) {
        		return (bytes / terabyte).toFixed(precision) + ' TB';

        	} else {
        		return bytes + ' B';
        	}
        }
    },
	TEMPLATES : {
		LINK_EXTRACT : {
		    general : "Found #{preferred} good, #{nonPreferred} potential urls.<br/>Verifying with put.io",
		    analyzeUrl : "Sent page to put.io to find downlodable links",
		    analyzedUrl : "Put.io found <strong>#{count}</strong> items to fetch. <br/> Getting detailed information..."
		},
		URL_VERIFIED : {
		    general : "<table id='verified_urls_list' cellpadding='0' cellspacing='0'></table>",
		    itemHeader: "<tr class='status'><td colspan='3'><b>Put.io verified #{count} url(s).</b></td></tr>",
		    item : "<tr><td><span id=\"action_#{downloadId}\"><a href=\"javascript:PE.dowloadItem(#{downloadId})\"><img src='img/add_icon.png' alt='Add to Putio'/></a></span></td><td><a href=\"javascript:PE.dowloadItem(#{downloadId})\">#{name}</a></td><td>#{human_size}</td></tr>",
		    multipart_item : "<tr><td><span id=\"action_#{downloadId}\"><a href=\"javascript:PE.dowloadItem(#{downloadId})\"><img src='img/add_icon.png' alt='Add to Putio'/></a></span></td><td><a href=\"javascript:PE.dowloadItem(#{downloadId})\">#{name}</a></td><td>#{human_size}</td></tr>"
		},
		SETTINGS : {
		    general : "<div class='content'>To link the extension with your put.io account, go <a href='https://put.io/account/settings' target='_blank'>here</a>, login then reopen this popup.</div>",
		    grabbed_keys : "Extension succesfully linked with your put.io account."
		},
		TRANSFERS : {
		    header : "<table cellpadding='0' cellspacing='0'><tr class='header'><td colspan='3'>Transfers</td></tr>",
		    item : "<tr id=\"transfer_#{id}\">" +
		                "<td>%#{percent_done}</td>" +
		                "<td>" +
		                    "<div class='meter-wrap'>" +
                        	    "<div class='meter-value' style='background-color: #0a0; width: #{percent_done}%;'>" +
                        	        "<div class='meter-text'>" +
                        	            "#{name}" +
                        	        "</div>" +
                        	    "</div>" +
                        	"</div>" +
		                "</td>" +
		                "<td class='delete'><a href=\"javascript:PE.cancelTransfer(#{id})\"><img class=\"delete-icon\" src=\"img/delete_icon.png\"/></a></a></td>" +
		            "</tr>",
		    item_cancel : "<tr id=\"transfer_#{id}\"><td colspan='2'>Are you sure you want to cancel transfer of #{name}?</td><td class='yesno'><a href=\"javascript:PE.cancelTransfer(#{id},true)\" class='yes'>[Yes]</a> " +
		                    "<a href=\"javascript:PE.cancelTransfer(#{id},false)\">[No]</a></td></tr>",
		    footer : "</table>",
		    no_transfers : "<div class='zero-state'>no active transfers</div>"
		},
		FILES : {
		    header : "<table cellpadding='0' cellspacing='0'><tr class='header'><td colspan=\"3\">#{name}</td></tr>",
		    up : "<tr><td><a href=\"javascript:PE.listFiles(#{id})\"><img class=\"file-icon\" src=\"img/back_icon.png\"/></a></td><td colspan='2'><a href=\"javascript:PE.listFiles(#{id})\">Back to #{name}</a></td></tr>",
		    item : "<tr id=\"file_#{id}\"><td><a href=\"javascript:PE.listFiles(#{id})\"><img class=\"file-icon\" src=\"#{file_icon_url}\"/></a></td><td><a href=\"javascript:PE.listFiles(#{id})\">#{name}</a></td><td class='delete'><a href=\"javascript:PE.deleteFile(#{id})\"><img class=\"delete-icon\" src=\"img/delete_icon.png\"/></a></td></tr>",
		    download_item : "<tr id=\"file_#{id}\"><td><a target=\"_blank\" href=\"#{download_url}\"><img class=\"file-icon\" src=\"#{file_icon_url}\"/></a></td><td><a target=\"_blank\" href=\"#{download_url}\">#{name}</a></td><td class='delete'><a href=\"javascript:PE.deleteFile(#{id})\"><img class=\"delete-icon\" src=\"img/delete_icon.png\"/></a></td></tr>",
		    item_delete : "<tr id=\"file_#{id}\"><td><img class=\"file-icon\" src=\"img/question_icon.png\"/></td><td>Are you sure you want to delete file #{name}?</td><td class='yesno'><a href=\"javascript:PE.deleteFile(#{id},true)\" class='yes'>[Yes]</a> " +
		                    "<a href=\"javascript:PE.deleteFile(#{id},false)\">[No]</a></td></tr>",
		    footer : "</table>"
		},
		MYACCOUNT : {
		    header : "<table cellpadding='0' cellspacing='0'>",
		    content : "<tr><td>Username:</td><td>#{name}</td></tr>" +
		              "<tr><td>Available Disk:</td><td>#{disk_quota_available} / #{disk_quota}</td></tr>" +
		              "<tr><td>Available Bandwidth:</td><td>#{bw_quota_available}</td></tr>",
		    footer : "</table>"
		},
		FEEDBACK : {
		    content : "<div class='content'>"+
		              "<p><textarea id='feedback' placeholder='Your feedback'></textarea></p>" +
		              "<p><input id='feedback_email' type='text' placeholder='Your e-mail (If you want a reply)' /></p>" +
		              "<p><div class='button' onclick='PE.UI.feedbackFormOnSubmit()'>Submit</div>"+
		              "</div>",
            uservoice_holder : "<div style='height:350px' id='uservoice_div'></div>"
		},
		
	}
};

PE.Tracking = {
    init : function() {
        document.observe(Putio.EVENTS.REQUEST_START, this._onRequestStart.bind(this));
    },
    
    _onRequestStart : function(e) {
        var page = e.memo.page;
        var method = e.memo.method;
        _gaq && _gaq.push(['_trackEvent', page, method]);
    }
};