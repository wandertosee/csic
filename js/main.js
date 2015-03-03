/* use strict */
/*global console, indexedDB, IDBKeyRange, confirm */
(function() {

    // ====================================================
    // ===== View Manipulation
    // ====================================================
    function updateView(data, modelView) {
        console.log('updateView');
        uiConfig.itemsId.innerHTML = '';
        var html = '';
        data.forEach(function(item) {
            html += modelView(item);
        });
        uiConfig.itemsId.innerHTML = html;
    }

    function itemView(item) {
        var url = [dbConfig._dbName, dbConfig._modelRef, dbConfig.keyPath, item[dbConfig.keyPath]].join('/');
        return '<a class="list-group-item" id="' + item[dbConfig.keyPath] + '" href="#/' + url + '">' + item.text + '<button type="button" class="close" data-dismiss="alert">x</button></a>';
    }

    function updateSearchSelector(dbConfig) {
        var html = '';
        dbConfig.indexes.forEach(function(item) {
            html += setSearchSelector(dbConfig, item);
        });
        uiConfig.searchSelector.innerHTML = html;
    }

    function setSearchSelector(dbConfig, item) {
        var url = [dbConfig._dbName, dbConfig._modelRef, dbConfig.keyPath, item].join('/');
        return '<li><a class="list-group-item" id="' + item[dbConfig.keyPath] + '" href="' + url + '">' + item + '</a></li>';
    }



    // ====================================================
    // ===== Form Actions
    // ====================================================
    function onSubmit(e) {
        e.preventDefault();
        if (e.srcElement.id) {
            if (e.srcElement.id === uiConfig.searchFormId) {
                var hash = ['', dbConfig._dbName, dbConfig._modelRef, uiConfig.searchAttr.value, uiConfig.searchValue.value].join('/');
                setHash(hash);
            } else {
                dbActionAdd(uiConfig.input.value, function() {
                    dbActionGet(updateView, itemView);
                    uiConfig.input.value = '';
                });
            }
        }
    }

    function deleteItem(e) {
        if (e.target.hasAttribute('data-dismiss')) {
            var ans = confirm('delete this record?');
            if (ans) {
                dbActionDelete(e.target.parentNode.getAttribute('id'), function() {
                    dbActionGet(updateView, itemView);
                });
            }
        }
    }

    function updateSearch(e) {
        e.preventDefault();
        var val = e.target.innerHTML;
        uiConfig.searchDisplay.innerHTML = val;
        uiConfig.searchAttr.value = val;
    }

    // ====================================================
    // ===== Generic Functions
    // ====================================================
    function splitObj(obj) {
        return obj.split(',');
    }

    function getHash() {
        return window.location.hash;
    }

    function setHash(hash) {
        window.location.hash = hash;
    }
    function hashChanged() {
        queryConfig = window.location.hash.split('/');
        dbActionGet(updateView, itemView);
    }
    // ====================================================
    // ===== DB Actions
    // ====================================================
    function dbOpen(callback) {
        var request = indexedDB.open(dbConfig._dbName, dbConfig.version);

        // TO DO rework this
        request.onupgradeneeded = function(e) {
            db = e.target.result;
            e.target.transaction.onerror = dbError;
             var objectStore = db.createObjectStore(dbConfig._modelRef, {
                keyPath: dbConfig.keyPath
            });
            createIndexes(objectStore, dbConfig.indexes);

        };

        request.onsuccess = function(e) {
            db = e.target.result;
            callback();
        };
        request.onerror = dbError;
    }

    function createIndexes(objectStore, indexes) {
        for (var i = dbConfig.indexes.length - 1; i >= 0; i--) {
            objectStore.createIndex(indexes[i], indexes[i], { unique: false });
        }
    }

    function dbError(e) {
        console.error('An IndexedDB Error has occurred', e);
    }

    function dbActionAdd(text, callback) {

        var arr = splitObj(text);
        var transaction = db.transaction(dbConfig._modelRef, dbConfig._modify);
        var store = transaction.objectStore(dbConfig._modelRef);
        var idx = arr[1] || Date.now().toString();
        var request;

        if (arr[1]) {
            request = store.get(idx);
        }

        var obj = {};
        obj.text = arr[0];
        obj[dbConfig.keyPath] = idx;
        request = store.put(obj);

        transaction.oncomplete = function(e) {
            callback();
        };
        request.onerror = dbError;
    }

    function dbActionGet(callback, modelView) {
        var transaction = db.transaction(dbConfig._modelRef, dbConfig._read);
        var store = transaction.objectStore(dbConfig._modelRef);
        var index, cursorRequest;

        // Return all records
        if (queryConfig.length === 3 || queryConfig[3] === "" || queryConfig[4] === "") {
            index = IDBKeyRange.lowerBound(0);
            cursorRequest = store.openCursor(index);
        // Return Search
        } else if (queryConfig[3] !== "") {
            index = store.index(queryConfig[3]);
            cursorRequest = index.openCursor(IDBKeyRange.only(queryConfig[4]));
        }

        // This fires once per row in the store
        var data = [];
        if (cursorRequest) {
            cursorRequest.onsuccess = function() {
                // map reduce?
                var cursor = cursorRequest.result;
                if (cursor) {
                    data.push(cursor.value);
                    cursor.continue();
                } else {
                    console.log(data);
                    if (data.length < 1 && queryConfig[3]) {
                        dbActionFuzzyGet(callback, modelView);
                    }
                    if (callback) {
                        callback(data, modelView);
                    } else {
                        updateView(data, itemView);
                    }
                }
            };
        }

    }

    function dbActionFuzzyGet(callback, modelView) {
        var data = [];
        var transaction = db.transaction(dbConfig._modelRef, dbConfig._read);
        var store = transaction.objectStore(dbConfig._modelRef);
        var i;
//        index = IDBKeyRange.bound(queryConfig[4], queryConfig[4] + '\uffff', true, true);

        var request = store.openCursor();
        request.onsuccess = function(event) {
            var cursor = event.target.result;
            if (cursor && queryConfig[4]) {
                if (cursor.value[queryConfig[3]].indexOf(queryConfig[4]) !== -1) {                
                    data.push(cursor.value);
                } 
                cursor.continue();          
            }
            if (callback) {
                callback(data, modelView);
            } else {
                updateView(data, itemView);
            }
        };
    }

    function dbActionDelete(id, callback) {
        var transaction = db.transaction(dbConfig._modelRef, dbConfig._modify);
        var store = transaction.objectStore(dbConfig._modelRef);
        var request = store.delete(id);
        transaction.oncomplete = function(e) {
            callback();
        };
        request.onerror = dbError;
    }

    // ====================================================
    // ===== Config
    // ====================================================
    var db,
        queryConfig = window.location.hash.split('/'),
        uiConfig = {
            itemsId: document.getElementById('listItems'), // Found Recordset
            input: document.getElementById('new'), // new record form
            searchSelector: document.getElementById('searchSelector'), // search dropdown
            searchFormId: 'searchForm', // Search Form ID
            search: document.getElementById('searchForm'), // Search Form
            searchAttr: document.getElementById('searchAttr'), // Attribute to be searched / Hidden input set by searchSelector
            searchValue: document.getElementById('searchValue'), // Search Value
            searchDisplay: document.getElementById('searchDisplay'), // Current Search Attribute / Drop Down title
        },
        dbConfig = {
            _dbName: queryConfig[1],
            _modelRef: queryConfig[2],
            _modify: 'readwrite',
            _read: 'readonly',
            keyPath: 'id',
            version: 2.1, // to do fix this. should update db on version change
            indexes: ['id', 'text']
        };

    dbOpen(function() {
        document.body.addEventListener('submit', onSubmit);
        window.addEventListener('hashchange', hashChanged, false);
        uiConfig.itemsId.addEventListener('click', deleteItem);
        uiConfig.searchSelector.addEventListener('click', updateSearch);
        updateSearchSelector(dbConfig); // Set search dropdown selector
        dbActionGet(updateView, itemView);
    });

}());




// http://blogs.shephertz.com/2014/01/14/html5-learn-how-to-use-indexeddb/
// https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB
// https://developer.mozilla.org/en-US/docs/Web/API/IDBDatabase
// http://www.w3.org/TR/IndexedDB/
// http://code.tutsplus.com/tutorials/working-with-indexeddb-part-2--net-35355


    // Incomplete / In process
    /*
    function updateDb(e) {
        console.log("updateDb");
        var request = indexedDB.open(dbConfig._dbName);
        request.onupgradeneeded = function(e) {
            db = e.target.result;
            e.target.transaction.onerror = dbError;
            db.createObjectStore(dbConfig._modelRef, {
                keyPath: dbConfig.keyPath
            });
        };
    }
    */

/*function CreateObjectStore(dbName, storeName) {
    var request = indexedDB.open(dbName);
    request.onsuccess = function (e){
        var database = e.target.result;
        var version =  parseInt(database.version);
        database.close();
        var secondRequest = indexedDB.open(dbName, version+1);
        secondRequest.onupgradeneeded = function (e) {
            var database = e.target.result;
            var objectStore = database.createObjectStore(storeName, {
                keyPath: 'id'
            });
        };
        secondRequest.onsuccess = function (e) {
            e.target.result.close();
        }
    }
}*/
/*
DBOpenRequest.onupgradeneeded = function(e) {
  var db = e.target.result;
 
  db.onerror = function(event) {
    note.innerHTML += '<li>Error loading database.</li>';
  };

  // Create an objectStore for this database   
  var objectStore = db.createObjectStore("toDoList", { keyPath: "taskTitle" });

  // define what data items the objectStore will contain
    
  objectStore.createIndex("hours", "hours", { unique: false });
  objectStore.createIndex("minutes", "minutes", { unique: false });
  objectStore.createIndex("day", "day", { unique: false });
  objectStore.createIndex("month", "month", { unique: false });
  objectStore.createIndex("year", "year", { unique: false });
  objectStore.createIndex("notified", "notified", { unique: false });
};
*/