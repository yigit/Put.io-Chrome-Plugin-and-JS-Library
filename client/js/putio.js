Putio = {
    API_SERVER  : "http://api.put.io/v1/",
    api_key : null,//"yeet",
    api_secret : null,//"449fangs53",
    _files : [],
    _transfers : [],
    _activeRequestCount : 0,
    
    init : function(key, secret) {
        this.api_key = key;
        this.api_secret = secret;
        this._files[0] = {'name' : "Your Files", 'id' : 0, 'parent_id' : 0};
    },
    
    Files : {
        list : function(onSuccess, parent_id, limit, offset) {
            Putio._request('files', 'list', {"parent_id": parent_id || 0, "limit": limit || 20, "offset": offset || 0}, 
            function(e) {
                e.response.results.each(
                    function(file) {
                        Putio._setFile(file);
                    }
                    );
                onSuccess && onSuccess(e);
            });
        },
        
        del : function(id, onSuccess) {
            Putio._request('files', 'delete', {"id": id}, 
            function(e) {
                Putio._deleteFile(id);
                onSuccess && onSuccess(e);
            });
        }
    },
    
    getFile : function(id) {
        return this._files[id];  
    },
    
    _setFile : function(file) {
        this._files[file.id] = file;
    },
    _deleteFile : function(id) {
        delete this._files[id];
    },
    
    Url : {
        analyze :  function(urls, onSuccess) {
            Putio._request('urls', 'analyze', {links : urls}, onSuccess);
        },
        extracturls : function(url, txt, onSuccess) {
            Putio._request('urls', 'extracturls', {url : url, txt : txt}, onSuccess);
        } 
    },
    
    Transfer : {
        add : function(links, onSuccess) {
            Putio._request('transfers', 'add', {links : links}, onSuccess);
        },
        list : function(onSuccess) {
            Putio._request('transfers', 'list', null, 
            function(e) {
                e.response.results.each(
                    function(transfer) {
                        Putio.setTransfer(transfer);
                    }
                    );
                onSuccess && onSuccess(e);
            });
        },
        cancel : function(id, onSuccess) {
            Putio._request('transfers', 'cancel', {id : id}, onSuccess);
        }
    },
    
    getTransfer : function(id) {
        return this._transfers[id];  
    },
    
    setTransfer : function(transfer) {
        this._transfers[transfer.id] = transfer;
    },
    
    User : {
        info :  function(onSuccess) {
            Putio._request('user', 'info', null, onSuccess);
        },
        friends : function(onSuccess) {
            Putio._request('user', 'friends', null, onSuccess);
        }
    },
    
    _debug : function() {
        console.log(arguments);
    },
    
    _request : function(page, method, params, onSuccess, onFailure) {
        params = params || {};
        request = {};
        request.api_key = this.api_key;
        request.api_secret = this.api_secret;
        request.params = params;
        this._debug("params:", request);
        document.fire(this.EVENTS.REQUEST_START, {request : request, page : page, method : method, activeRequestCount : ++this._activeRequestCount});
        new Ajax.Request(this.API_SERVER + page + "/?method=" + method, 
            {parameters : {request : Object.toJSON(request)}, 
             method: 'get',
             onSuccess : function(response) {
                 var json = null;
                 try {
                      json = response.responseJSON || response.responseText.evalJSON(); 
                 }catch(e) {
                     json = {error : true, error_message : "Could not parse response"};
                 }
                 document.fire(this.EVENTS.REQUEST_END, {request : request, response : response, activeRequestCount : --this._activeRequestCount});
                 if(json.error) {
                      document.fire(this.EVENTS.REQUEST_ERROR, json);
                      onFailure && onFailure(json);
                 }else {
                      onSuccess && onSuccess(json);
                 }
             }.bind(this),
             onFailure : function() {
                 document.fire(this.EVENTS.REQUEST_END, {request : request, response : null, activeRequestCount : --this._activeRequestCount});
                 onFailure ? onFailure() :this._defaultOnRequestFailure();
                 document.fire(this.EVENTS.REQUEST_ERROR, {error:true, error_message:"Could not complete request."});
                }.bind(this)
                });
    },
    _defaultOnRequestSuccess : function(response) {
        this._debug("On Request Success:", response);
    },
    _defaultOnRequestFailure : function(response) {
        this._debug("on Request Failure:",response);
    },
    EVENTS : {
        REQUEST_START : "putio:request_start",
        REQUEST_END : "putio:request_end",
        REQUEST_ERROR : "putio:request_error"
    }
};