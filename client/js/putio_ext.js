PE = {
    _version : 102, //= 0.01
    UPDATE_SERVER : "http://birbit.com/putio/version.json",
    _downloadItems : [],
    init : function() {
        this.UI.init();
        if(!this.getApiKey() || !this.getApiSecret()) {
            this.UI.showSettingsPage();
            this.parseKeys();
        } else {
            Putio.init(this.getApiKey(), this.getApiSecret());
            PE.anayzeUrl();
        }
        this.checkForUpdate();
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
    displayUpdate : function(data) {
        var updateDiv = $('update_info');
        updateDiv.innerHTML = this.TEMPLATES.UPDATE_PLUGIN.new_update.interpolate(data);
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
        this._content.innerHTML = this.TEMPLATES.LINK_EXTRACT.analyzeUrl;
    },
    _analyzedUrl : function(e) {
        this._content.innerHTML = this.TEMPLATES.LINK_EXTRACT.analyzedUrl.interpolate({count : e.memo.length});
        this._content.innerHTML += this.TEMPLATES.URL_VERIFIED.general;
    },
    _onRequestError : function(e) {
        if(e.memo.error) {
            this._setStatus(e.memo.error_message);
        }
    },
    _onLinksExtracted : function(e) {
        this._content.innerHTML = this.TEMPLATES.LINK_EXTRACT.general.interpolate({
            preferred : e.memo.links.preferred.length,
            nonPreferred : e.memo.links.nonPreferred.length,
            notGood : e.memo.links.notGood.length,
        });
        this._content.innerHTML += this.TEMPLATES.URL_VERIFIED.general;
    },
    _onUrlsVerified : function(e) {
        var urlListElm = $('verified_urls_list');
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
    _setStatus : function(text) {
        this._status.innerHTML = text;
    },
    showSettingsPage : function() {
        $('content').innerHTML = this.TEMPLATES.SETTINGS.general;
    },
    showGrabbedKeys : function() {
        $('content').innerHTML = this.TEMPLATES.SETTINGS.grabbed_keys.interpolate({key : PE.getApiKey(), secret : PE.getApiSecret()});
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
		    analyzedUrl : "Putio found #{count} items to fetch. Getting detailed information..."
		},
		URL_VERIFIED : {
		    general : "<table id='verified_urls_list'></table>",
		    itemHeader: "<tr><td colspan='3'><b>Put.io verified #{count} url(s).</b></td></tr>",
		    item : "<tr><td><span id=\"action_#{downloadId}\"><a href=\"javascript:PE.dowloadItem(#{downloadId})\"><img src='img/add_icon.jpg' alt='Add to Putio'/></a></span></td><td>#{name}</td><td>#{human_size}</td></tr>",
		    multipart_item : "<tr><td>#{name}</td><td>#{human_size}</td><td><span id=\"action_#{downloadId}\"><a href=\"javascript:PE.dowloadItem(#{downloadId})\">Add to Putio</a></span></td></tr>"
		},
		SETTINGS : {
		    general : "Api key and secret are not set. Please enter them in the options pane of the extension OR " +
		        "go <a href='https://put.io/account/settings' target='_blank'>here</a> and reopen this popup. I'll try to grab them.",
		    grabbed_keys : "Succesfully imported your putio api key and secret.<br/>Api Key:<b>#{key}</b><br/>Api Secret:<b>#{secret}</b>"
		},
		TRANSFERS : {
		    header : "<table><tr><td colspan='3'>Transfers</td></tr>",
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
		                "<td><a href=\"javascript:PE.cancelTransfer(#{id})\">[cancel]</a></td>" +
		            "</tr>",
		    item_cancel : "<tr id=\"transfer_#{id}\"><td colspan='2'>Are you sure you want to cancel transfer of #{name}?</td><td><a href=\"javascript:PE.cancelTransfer(#{id},true)\">[YES]</a>" +
		                    "<a href=\"javascript:PE.cancelTransfer(#{id},false)\">[NO]</a></td></tr>",
		    footer : "</table>",
		    no_transfers : "You don't have any active transfers right now."
		},
		FILES : {
		    header : "<table><tr><td colspan=\"3\">#{name}</td></tr>",
		    up : "<tr><td><img src=\"img/back_icon.png\"/></td><td colspan='2'><a href=\"javascript:PE.listFiles(#{id})\">Back to #{name}</a></td></tr>",
		    item : "<tr id=\"file_#{id}\"><td><img src=\"#{file_icon_url}\"/></td><td><a href=\"javascript:PE.listFiles(#{id})\">#{name}</a></td><td><a href=\"javascript:PE.deleteFile(#{id})\"><img src=\"img/delete_icon.png\"/></a></td></tr>",
		    download_item : "<tr id=\"file_#{id}\"><td><img src=\"img/download_icon.gif\"/></td><td><a target=\"_blank\" href=\"#{download_url}\">#{name}</a></td><td><a href=\"javascript:PE.deleteFile(#{id})\"><img src=\"img/delete_icon.png\"/></a></td></tr>",
		    item_delete : "<tr id=\"file_#{id}\"><td><img src=\"img/question_icon.jpg\"/></td><td>Are you sure you want to delete file #{name}?</td><td><a href=\"javascript:PE.deleteFile(#{id},true)\">[YES]</a>" +
		                    "<a href=\"javascript:PE.deleteFile(#{id},false)\">[NO]</a></td></tr>",
		    footer : "</table>"
		},
		MYACCOUNT : {
		    header : "<table>",
		    content : "<tr><td>Username:</td><td>#{name}</td></tr>" +
		              "<tr><td>Available Disk:</td><td>#{disk_quota_available} / #{disk_quota}</td></tr>" +
		              "<tr><td>Available Bandwidth:</td><td>#{bw_quota_available}</td></tr>",
		    footer : "</table>"
		},
		UPDATE_PLUGIN : {
		    new_update : "A new version of the chrome put.io plugin is available for download." +
		                  "<br/> Please <a target='_blank' href='#{download_url}'>update</a> to the latest version"
		}
	}
};