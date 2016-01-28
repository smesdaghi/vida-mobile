// Global Functions
function dataURLtoBlob(dataURI) {
  var binary = atob(dataURI.split(',')[1]);
  var array = [];
  for(var i = 0; i < binary.length; i++) {
    array.push(binary.charCodeAt(i));
  }
  return new Blob([new Uint8Array(array)], {type: 'image/jpeg'});
}

angular.module('vida.services', ['ngCordova', 'ngResource'])


.factory('httpRequestInterceptor', function(networkService) {
   return {
      request: function (config) {
        // if request doesn't have authorization header already, add basic auth
        if (typeof config.headers.Authorization === 'undefined') {
          config.headers.Authorization = networkService.getBasicAuthentication();
        }

        // set max timeout since if creds are not valid for endpoint with basic auth, it will go for 90 secs or whatever
        // the large default is.
        if (typeof config.timeout === 'undefined') {
          config.timeout = 10000;
        }

        return config;
      }
    };
})

.config(function($interpolateProvider, $httpProvider, $resourceProvider) {
//  $interpolateProvider.startSymbol('{[');
//  $interpolateProvider.endSymbol(']}');

  //$httpProvider.defaults.xsrfCookieName = 'csrftoken';
  //$httpProvider.defaults.xsrfHeaderName = 'X-CSRFToken';
  //$httpProvider.interceptors.push('httpRequestInterceptor');
  //$httpProvider.defaults.headers.common['X-Requested-With'] = 'XMLHttpRequest';
  //$httpProvider.defaults.headers.common['X-Auth-Token'] = undefined;

  $resourceProvider.defaults.stripTrailingSlashes = false;
})

.factory('Camera', ['$q', function($q){
  return {
    getPicture: function(options) {
      var q = $q.defer();
      navigator.camera.getPicture(function(result) {
        q.resolve(result);
      }, function(err) {
        q.reject(err);
      }, options);
      return q.promise;
    }
  };
}])

.service('uploadService', function($http, networkService, $q, geolocationService, $cordovaFileTransfer) {
  var service_ = this;

  // upload media in the provided array
  this.uploadMedia = function(filePath) {
    var options = new FileUploadOptions();
    options.fileKey = 'file';
    options.fileName = 'filenameWithExtension.jpg';
    options.headers = {
      'Content-Type': undefined,
      'Authorization': networkService.getAuthenticationHeader().headers.Authorization
    };
    return $cordovaFileTransfer.upload(networkService.getFileServiceURL(), filePath, options);
  };

  //TODO: when an iten in the array failes, still need to return filehashes so that feature can be uploadeded with missing files.
  this.uploadMediaArray = function(filePaths) {
    if (!filePaths) {
      filePaths = [];
    }

    var deferred = $q.defer();
    var filePathsFailed = [];
    var filePathsSucceededFileNames = [];

    var onCompleted = function(succeeded, newFilename) {
      var completedFilePath = filePaths.pop();
      if (succeeded) {
        filePathsSucceededFileNames.push(newFilename);
      } else {
        filePathsFailed.push(completedFilePath);
      }
      if (filePaths.length === 0) {
        deferred.resolve(filePathsFailed, filePathsSucceededFileNames);
      } else {
        uploadAnother();
      }
    };

    var uploadAnother = function() {
      if (filePaths.length > 0) {
        service_.uploadMedia(filePaths.slice(-1).pop()).then(function (data) {
          onCompleted(true, data.name);
        }, function (e) {
          onCompleted(false)
        });
      } else {
        // assume success, no failed files and no new filenames
        deferred.resolve([], []);
      }
    };

    uploadAnother();
    return deferred.promise;
  };

  this.uploadReport = function(report, formUri) {
    var deferred = $q.defer();

    geolocationService.getCurrentPosition().then(function(position) {
      var payload = {
        "data": report,
        "geom": geolocationService.positionToWKT(position),
        "form": formUri
      };

      $http.post(networkService.getReportURL(), JSON.stringify(payload), {
        transformRequest: angular.identity,
        headers: {
          'Authorization': networkService.getAuthenticationHeader().headers.Authorization
        }
      }).success(function() {
        deferred.resolve();
      }).error(function(e) {
        deferred.reject(e);
      });
    });

    return deferred.promise;
  };
})

.service('utilService', function($cordovaFile, $q, $cordovaToast) {
  var service_ = this;

  // given a full file path, get the binary data in the file
  this.getFileAsBinaryString = function(filePath, encodeAsBase64) {
    var deferred = $q.defer();
    var lastSlashIndex = filePath.lastIndexOf("/");
    var fileDir = filePath.substring(0, lastSlashIndex);
    var filename = filePath.substring(lastSlashIndex + 1);
    $cordovaFile.readAsBinaryString(fileDir, filename).then(function(data) {
      if (encodeAsBase64) {
        deferred.resolve(btoa(data));
      } else {
        deferred.resolve(data);
      }
    }, function(err) {
      deferred.reject(err);
    });
    return deferred.promise;
  };

  this.notify = function(msg) {
    console.log('===[ utilService, notify: ', msg);
    $cordovaToast.showLongBottom(msg);
  };
})


.factory('geolocationService', function ($q, $timeout) {
  // if call has been made in the past 1 second, don't hit the api
  var currentPositionCache;

  return {
    getCurrentPosition: function () {
      if (!currentPositionCache) {
        var deferred = $q.defer();
        navigator.geolocation.getCurrentPosition(function (position) {
          currentPositionCache = position;
          deferred.resolve(currentPositionCache);
          $timeout(function () {
            currentPositionCache = undefined;
          }, 1000);
        }, function () {
          deferred.reject();
        },
        {
          maximumAge: 8000,
          timeout: 10000,
          enableHighAccuracy: true
        });
        return deferred.promise;
      }
      return $q.when(currentPositionCache);
    },
    positionToWKT: function(position) {
      return "SRID=4326;POINT (" + position.coords.longitude + " " + position.coords.latitude + ")";
    }
  };
})


.service('trackerService', function($http, $q, networkService, geolocationService) {
  this.post = function (position) {
    var deferred = $q.defer();

    var payload = {
      "entity_type": 1,
      "force_type": 1,
      "geom": geolocationService.positionToWKT(position),
      "user": "mobile"
    };

    $http.post(networkService.getTrackURL(), payload, networkService.getAuthenticationHeader()).success(function(data) {
      console.log('----[ trackerService.success: ', data);
      deferred.resolve();
    }).error(function(error) {
      console.log('----[ trackerService.error: ', error);
      deferred.reject(error);
    });

    return deferred.promise;
  };
})

.service('loginService', function($http, $q, networkService, $cordovaToast, $filter) {
  this.login = function (username, password) {
    var deferred = $q.defer();
    networkService.setAuthentication(username, password);
    $http.get(networkService.getAuthenticationURL(),
      {
        "headers": {
          "Content-Type": '',
          "Authorization": networkService.getBasicAuthentication()
        },
        "timeout": 3000
      }).then(
      function(result) {
        console.log('------ login success: ', result);
        if (result.status === 200) {
          deferred.resolve();
        } else {
          deferred.reject(result);
        }
      }, function(error) {
        console.log('------ login error: ', error);
        if (error) {
          // Note: 401 will NOT occure when endpoint is basic auth and invalid creds are used. That's when basic auth
          //       dialog is supposed to come up which does not on mobile browser so the request stays active until
          //       timeout is reached. this is why we are using a short timeout for this request and catching status 0
          //       assuming that it is the bad credentials.
          //       When the server ip is invalid, timeout will occur as well. not possible to know when
          if (error.status === 401 || error.status === 0) {
            $cordovaToast.showShortBottom(($filter('translate')('error_invalid_credentials')));
          } else if (error.status === 404) {
            $cordovaToast.showShortBottom(($filter('translate')('error_server_not_found')));
          } else {
            $cordovaToast.showShortBottom($filter('translate')('error_connecting_server') + ', '
              + error.status + ": " + error.description);
          }
        } else {
          $cordovaToast.showShortBottom($filter('translate')('error_connecting_server'));
        }
        deferred.reject();
      });
    return deferred.promise;
  };

  this.loginAjax = function (username, password) {
    var deferred = $q.defer();
    networkService.setAuthentication(username, password);

    $.ajax({
      type: 'GET',
      url: networkService.getAuthenticationURL(),

      // ****************        syncronous call!        *****************
      // with basic auth, when the credentials are wrong, the app doesn't get a 401 as the 'browser'/webview is supposed
      // to popup the basic auth dialog for user to retry which doesn't work on mobile. This means the request attempt
      // stays active until the timeout duration is hit at which point you still dont see the 401 and just a timeout.
      // when call is NOT async, you get the 401. The app will 'hang' for a bit of course...
      async: false,
      timeout: 3000,

      "headers": {
        "Content-Type": '',
        "Authorization": networkService.getBasicAuthentication()
      }
    }).done(function(data, textStatus, xhr) {
      console.log('----[ ajax.done: ', xhr);
      if (xhr.status === 200) {
        deferred.resolve(data);
      } else {
        deferred.reject(xhr);
      }
    }).fail(function(xhr, textStatus, errorThrown) {
      console.log('----[ ajax.fail: ', xhr);
      if (xhr.status === 404) {
        $cordovaToast.showShortBottom(($filter('translate')('error_server_not_found')));
      } else if (xhr.status === 401) {
        $cordovaToast.showShortBottom(($filter('translate')('error_wrong_credentials')));
      } else {
        $cordovaToast.showShortBottom($filter('translate')('error_connecting_server'));
      }
      deferred.reject(xhr);
    }).always(function(a, status, c) {
      console.log('----[ ajax.always: ', c);
    });

    return deferred.promise;
  };
})

.service('formService', function($http, networkService, $resource, $q) {
  var service = this;
  var forms = [];
  var current_form = {};
  current_form.str = 'None';
  current_form.link = 'None';

  this.getAll = function() {
    var form = $resource(networkService.getFormURL() + ':id', {}, {
      query: {
        method: 'GET',
        headers: {
          "Authorization": networkService.getBasicAuthentication()
        },
        timeout: 10000,
        isArray: true,
        transformResponse: $http.defaults.transformResponse.concat([
          function (data, headersGetter) {
            forms = data.objects;
            return data.objects;
          }
        ])
      }
    });

    return form.query().$promise;
  };

  this.getById = function(id) {
    for(var i = 0; i < forms.length; i++) {
      if (forms[i].id == id)
        return forms[i];
    }
  };

  this.getCurrentForm = function() {
    return current_form;
  };

  this.setCurrentForm = function(form){
    if (form !== 'None') {
      current_form.str = form.name;
      current_form.link = '#/vida/form-detail/' + form.id;
    } else {
      current_form.str = 'None';
      current_form.link = 'None';
    }
  };
})

.service('shelterService', function($http, networkService, $resource, $q) {
  var service = this;
  var shelters = [];
  var current_shelter = {};
  current_shelter.str = 'None';
  current_shelter.link = 'None';

  this.getAll = function() {
    var shelter = $resource(networkService.getShelterURL() + ':id', {}, {
      query: {
        method: 'GET',
        isArray: true,
        transformResponse: $http.defaults.transformResponse.concat([
          function (data, headersGetter) {
            shelters = data.objects;
            console.log('----[ transformResponse data: ', data);
            return data.objects;
          }
        ])
      }
    });

    return shelter.query().$promise;
  };

  this.getById = function(id) {
    for(var i = 0; i < shelters.length; i++) {
      if (shelters[i].id == id)
        return shelters[i];
    }
  };

  this.getCurrentShelter = function() {
    return current_shelter;
  };

  this.setCurrentShelter = function(shelter){
    if (shelter !== 'None') {
      current_shelter.str = shelter.name;
      current_shelter.link = '#/vida/shelter-search/shelter-detail/' + shelter.id;
    } else {
      current_shelter.str = 'None';
      current_shelter.link = 'None';
    }
  };

  this.getLatLng = function(id) {
    var shelter = service.getById(id);
    // look for 'point' in wkt and get the pair of numbers in the string after it
    var trimParens = /^\s*\(?(.*?)\)?\s*$/;
    var coordinateString = shelter.geom.toLowerCase().split('point')[1].replace(trimParens, '$1').trim();
    var tokens = coordinateString.split(' ');
    var lng = parseFloat(tokens[0]);
    var lat = parseFloat(tokens[1]);
    return {lat: lat, lng: lng};
  };

  this.printToConsole = function() {
    for (var i = 0; i < peopleInShelter.length; i++) {
      console.log(peopleInShelter[i].given_name);
    }
  };
})

.service('optionService', function() {
    var gender_options = [
      {
        "name": 'person_not_specified',
        "value": "Not Specified"
      },
      {
        "name": 'person_gender_male',
        "value": "Male"
      },
      {
        "name": 'person_gender_female',
        "value": "Female"
      },
      {
        "name": 'person_gender_other',
        "value": "Other"
      }
    ];

    var injury_options = [
      {
        "name": 'person_injury_not_injured',
        "value": "Not Injured"
      },
      {
        "name": 'person_injury_moderate',
        "value": "Moderate"
      },
      {
        "name": 'person_injury_severe',
        "value": "Severe"
      }
    ];

    var language_options = [
      {
        "name": 'settings_language_english',
        "value": "English"
      },
      {
        "name": 'settings_language_spanish',
        "value": "Spanish"
      }
    ];

    var nationality_options = [
      {
        "name": 'person_not_specified',
        "value": "Not Specified"
      },
      {
        "name": 'person_nationality_english',
        "value": "English"
      },
      {
        "name": 'person_nationality_african',
        "value": "African"
      },
      {
        "name": 'person_nationality_asian',
        "value": "Asian"
      }
    ];

    var default_configurations = {};
    default_configurations.configuration = {};
    default_configurations.configuration.serverURL = "192.168.33.15";
    default_configurations.configuration.username = "admin";
    default_configurations.configuration.password = "admin";
    default_configurations.configuration.protocol = "http";
    default_configurations.configuration.language = "English";
    default_configurations.configuration.workOffline = "false";

    this.getGenderOptions = function() {
      return gender_options;
    };

    this.getInjuryOptions = function() {
      return injury_options;
    };

    this.getLanguageOptions = function() {
      return language_options;
    };

    this.getNationalityOptions = function() {
      return nationality_options;
    };

    this.getDefaultConfigurations = function() {
      return default_configurations;
    };

    this.getDefaultConfigurationsJSON = function() {
      var configs = ['serverURL', 'username', 'password', 'protocol',' language', 'workOffline'];
      var JSONObject = "'{\"configuration\":{";
      for (var i = 0; i < configs.length; i++){
        JSONObject += '\"' + configs[i] + '\":\"' + default_configurations.configuration[configs[i]] + '\"';
        if (i !== configs.length - 1)
          JSONObject += ", ";
      }
      JSONObject += "}}'";
      return JSONObject;
    };
  })

  // TODO: Rename to configService
.service('networkService', function(optionService, $translate) {

    var self = this;
    this.configuration = {};

    var default_config = optionService.getDefaultConfigurations();
    this.configuration.username = default_config.configuration.username;
    this.configuration.password = default_config.configuration.password;
    this.configuration.serverURL = default_config.configuration.serverURL;
    this.configuration.protocol = default_config.configuration.protocol;
    this.configuration.language = default_config.configuration.language;
    this.configuration.workOffline = (default_config.configuration.workOffline === 'true');
    this.configuration.api = {};


    this.compute_API_URLs = function() {
      var URL = this.configuration.protocol + '://' + this.configuration.serverURL + '/api/v1';
      this.configuration.api.trackURL = URL + '/track/';
      this.configuration.api.formURL = URL + '/form/';
      this.configuration.api.reportURL = URL + '/report/';
      this.configuration.api.personURL = URL + '/person/';
      this.configuration.api.searchURL = URL + '/person/?custom_query=';
      this.configuration.api.fileServiceURL = URL + '/fileservice/';
      this.configuration.api.shelterURL = URL + '/shelter/';
      this.configuration.api.faceSearchURL = URL + '/facesearchservice/';
    };

    this.compute_API_URLs();

    this.SetConfigurationFromDB = function(DBSettings) {
      // Set DB settings
      self.configuration.username = DBSettings.configuration.username;
      self.configuration.password = DBSettings.configuration.password;
      self.configuration.serverURL = DBSettings.configuration.serverURL;
      self.configuration.protocol = DBSettings.configuration.protocol;
      self.configuration.language = DBSettings.configuration.language;
      if (self.configuration.language === "English")
        $translate.use('en');
      else if (self.configuration.language === "Spanish")
        $translate.use('es');
      else
        $translate.use('en');
      self.configuration.workOffline = (DBSettings.configuration.workOffline === 'true');

      self.setServerAddress(DBSettings.configuration.serverURL);
    };

    this.getServerAddress = function() {
      return this.configuration.serverURL;
    };

    this.setServerAddress = function(Addr) {
      this.configuration.serverURL = Addr;
      this.compute_API_URLs();
    };

    this.getBasicAuthentication = function() {
      var authentication = btoa(this.configuration.username + ':' + this.configuration.password);
      return 'Basic ' + authentication;
    };

    this.getAuthenticationHeader = function() {
      return {
        "headers": {
          "Authorization": self.getBasicAuthentication()
        }
      };
    };

    this.setAuthentication = function(username, password){
      this.configuration.username = username;
      this.configuration.password = password;
    };

    this.setLanguage = function(current_language){
      this.configuration.language = current_language;
    };

    this.getConfiguration = function(){
      return this.configuration;
    };

    // todo: get rid of this usage
    this.getAuthentication = function(){
      return this.configuration;
    };

    this.getTrackURL = function() {
      return this.configuration.api.trackURL;
    };

    this.getFormURL = function() {
      return this.configuration.api.formURL;
    };

    this.getReportURL = function() {
      return this.configuration.api.reportURL;
    };

    this.getPeopleURL = function() {
      return this.configuration.api.personURL;
    };

    this.getAuthenticationURL = function() {
      return this.configuration.api.personURL;
    };

    this.getSearchURL = function() {
      return this.configuration.api.searchURL;
    };

    this.getFileServiceURL = function() {
      return this.configuration.api.fileServiceURL;
    };

    this.getShelterURL = function() {
      return this.configuration.api.shelterURL;
    };

    this.getFaceSearchServiceURL = function() {
      return this.configuration.api.faceSearchURL;
    };
  })

//TODO: track down issue requiring $ionicPlatform.ready
.factory('dbService', function($cordovaSQLite, $q, $ionicPlatform, utilService) {
  var self = this;

  self.execute = function(db, query, parameters) {
    parameters = parameters || [];
    var q = $q.defer();

    $ionicPlatform.ready(function() {
      $cordovaSQLite.execute(db, query, parameters).then(
        function(result){
          q.resolve(result);
      }, function(error){
          var msg = "Error with DB - " + error.message;
          utilService.notify(msg);
          q.reject(error);
        });
    });
    return q.promise;
  };

  self.getAll = function(result) {
    var output = [];
    for (var i = 0; i < result.rows.length; i++){
      output.push(result.rows.item(i));
    }
    return output;
  };

  self.getById = function(result) {
    var output = null;
    output = angular.copy(result.rows.item(0));
    return output;
  };

  return self;
})

.factory('VIDA_localDB', function($cordovaSQLite, dbService, networkService){
    var self = this;

    //self.addReport = function();

    self.queryDB_select = function(tableName, columnName, afterQuery) {
      return dbService.execute(db, "SELECT " + columnName + " FROM " + tableName)
        .then(function(result){
          afterQuery(dbService.getAll(result));
        });
    };

    self.queryDB_update = function(tableName, JSONObject) {
      var query = "UPDATE " + tableName + " SET settings=" + JSONObject;
      console.log(query);
      dbService.execute(db, query)
        .then(function (result) {
          console.log(result);
        });
    };

    self.queryDB_update_settings = function(){
      var fields = ['serverURL', 'username', 'password', 'protocol', 'language', 'workOffline'];
      var currentConfiguration = networkService.getConfiguration();
      var JSONObject = "'{\"configuration\":{";
      for (var i = 0; i < fields.length; i++){
        JSONObject += '\"' + fields[i] + '\":\"' + currentConfiguration[fields[i]] + '\"';
        if (i !== fields.length - 1)
          JSONObject += ", ";
      }
      JSONObject += "}}'";
      var query = "UPDATE configuration SET settings=" + JSONObject;
      console.log(query);
      dbService.execute(db, query).then(function(result){
        console.log(result);
      });
    };

    self.queryDB_insert = function(tableName, JSONObject) {
      var query = "INSERT INTO " + tableName + " VALUES (" + JSONObject + ")";
      console.log(query);
      dbService.execute(db, query)
        .then(function (result) {
          console.log(result);
        });
    };

    return self;
  })

.service('localDBService', function($q, $cordovaSQLite, dbService, utilService) {
  var service_ = this;
  var localDB_ = null;

  this.openLocalDB = function(){
    localDB_ = $cordovaSQLite.openDB('localDB.sqlite');
  };

  this.createKVTableIfNotExist = function(tableName) {
    var sql = 'CREATE TABLE IF NOT EXISTS ' + tableName + ' (key text not null primary key, value text not null);';
    return dbService.execute(localDB_, sql);
  };

  this.setKey = function(tableName, key, value) {
    var deferred = $q.defer();
    if (typeof key !== 'string') {
      utilService.notify('localDBService, key must be a string');
      deferred.reject();
    }

    if (typeof value !== 'string') {
      value = JSON.stringify(value);
    }

    var rejected = function() {
      utilService.notify('localDBService.set, error. key: ' + key + ', value: ' + value);
      deferred.reject();
    };

    var sql = 'SELECT key, value FROM ' + tableName + ' WHERE key=?;';
    dbService.execute(localDB_, sql, [key]).then(function(res) {
      if (res.rows.length === 0) {
        var sql = 'INSERT INTO ' + tableName + ' (key, value) VALUES (?, ?);';
        dbService.execute(localDB_, sql, [key, value]).then(function(res) {
          deferred.resolve();
        }, rejected);
      } else if (res.rows.length === 1) {
        var sql = 'UPDATE ' + tableName + ' SET value=? WHERE key=?;';
        dbService.execute(localDB_, sql, [value, key]).then(function(res) {
          deferred.resolve();
        }, rejected);
      } else {
        utilService.notify('localDBService.set, Multiple entries for property: ' + key);
        deferred.reject();
      }
    }, rejected);

    return deferred.promise;
  };

  this.getKey = function(tableName, key, parse) {
    var deferred = $q.defer();
    if (typeof key !== 'string') {
      utilService.notify('localDBService, key must be a string');
      deferred.reject();
    }

    var rejected = function() {
      utilService.notify('localDBService.get, error. key: ' + key);
      deferred.reject();
    };

    var sql = 'SELECT key, value FROM ' + tableName + ' WHERE key=?;';
    dbService.execute(localDB_, sql, [key]).then(function(res) {
      if (res.rows.length === 0) {
        deferred.resolve();
      } else if (res.rows.length === 1) {
        var value = res.rows.item(0).value;
        if (parse) {
          value = JSON.parse(value);
        }
        deferred.resolve(value);
      } else {
        utilService.notify('localDBService.get, Multiple entries for property: ' + key);
        deferred.reject();
      }
    }, rejected);

    return deferred.promise;
  };
});
