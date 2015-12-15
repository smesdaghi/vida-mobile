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
        config.headers.Authorization = networkService.getBasicAuthentication();
        config.timeout = 30000;
        return config;
      }
    };
})

.config(function($interpolateProvider, $httpProvider, $resourceProvider) {
//  $interpolateProvider.startSymbol('{[');
//  $interpolateProvider.endSymbol(']}');

  //$httpProvider.defaults.xsrfCookieName = 'csrftoken';
  //$httpProvider.defaults.xsrfHeaderName = 'X-CSRFToken';
  $httpProvider.interceptors.push('httpRequestInterceptor');
  $httpProvider.defaults.headers.common['X-Requested-With'] = 'XMLHttpRequest';
  //$httpProvider.defaults.headers.common['X-Auth-Token'] = undefined;

  $resourceProvider.defaults.stripTrailingSlashes = false;
})

/*.provider('configService', function() {
  var service_ = null;
  this.configuration = {};
  this.$get = function($window, $http, $location, $translate) {
    service_ = this;
    this.username = 'admin';
    this.password = 'admin';
    //this.csrfToken = $cookies.csrftoken;
    //$translate.use(this.currentLanguage);
    return this;
  };

  this.isAuthenticated = function() {
    return service_.authStatus == 200;
  };
})*/

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

.service('uploadService', function($http, networkService) {
  this.uploadPhotoToUrl = function(photo, uploadUrl, callSuccess, callFailure) {

    var photoBlob = dataURLtoBlob(photo);
    var formData = new FormData();
    formData.append("file", photoBlob, 'filename.jpg');

    $http.post(uploadUrl, formData, {
      transformRequest: angular.identity,
      headers: {
        'Content-Type': undefined,
        'Authorization': networkService.getAuthenticationHeader().headers.Authorization
      }
    }).success(function(data) {
      callSuccess(data);
    }).error(function(err) {
      // can be moved to callFailure(err)
      if (err) {
        // if err is null, server not found?
        alert('Photo not uploaded! Error: ' + err.error_message);
      }
      callFailure(err);
    });
  };

  this.uploadPersonToUrl = function(person, uploadUrl, callSuccess, callFailure) {

    var JSONPerson = '{';
    var hasItem = false;

    // TODO: Take all fields and put into service (for each list like this)
    var uploadFields = ['given_name', 'family_name', 'fathers_given_name', 'mothers_given_name', 'age',
      'date_of_birth', 'street_and_number', 'city', 'neighborhood', 'notes', 'description', 'phone_number',
      'barcode', 'gender', 'injury', 'nationality', 'shelter_id', 'pic_filename', 'province_or_state',
      'status'];

    for (var i = 0; i < uploadFields.length; i++) {
      if (i > 0 && i < uploadFields.length) {
        // Add ,
        if (hasItem)
          JSONPerson += ', ';
      }

      JSONPerson += '"' + uploadFields[i] + '":"' + person[uploadFields[i]] + '"';
      hasItem = true;
    }

    JSONPerson += '}';

    $http.post(uploadUrl, JSONPerson, {
      transformRequest: angular.identity,
      headers: {
        'Authorization': 'Basic ' + btoa('admin:admin')
      }
    }).success(function() {
      callSuccess();
    }).error(function(err) {
      // can be moved to callFailure(err)
      alert('Person not uploaded! Error: ' + err.error_message);
      callFailure();
    });
  };
})

.factory('geofenceService', function ($rootScope, $window, $q, $log, $ionicLoading, toaster) {
  $window.geofence = $window.geofence || {
    addOrUpdate: function (fences) {
      var deffered = $q.defer();
      $log.log('Mocked geofence plugin addOrUpdate', fences);
      deffered.resolve();
      return deffered.promise;
    },
    remove: function (ids) {
      var deffered = $q.defer();
      $log.log('Mocked geofence plugin remove', ids);
      deffered.resolve();
      return deffered.promise;
    },
    removeAll: function () {
      var deffered = $q.defer();
      $log.log('Mocked geofence plugin removeAll');
      deffered.resolve();
      return deffered.promise;
    },
    receiveTransition: function (obj) {
      $rootScope.$apply(function () {
        toaster.pop('info', 'title', 'text');
      });
    }
  };
  $window.TransitionType = $window.TransitionType || {
    ENTER: 1,
    EXIT: 2,
    BOTH: 3
  };

  var geofenceService = {
    _geofences: [],
    _geofencesPromise: null,
    createdGeofenceDraft: null,
    loadFromLocalStorage: function () {
      var result = localStorage.geofences;
      var geofences = [];
      if (result) {
        try {
          geofences = angular.fromJson(result);
        } catch (ex) {

        }
      }
      this._geofences = geofences;
      return $q.when(this._geofences);
    },
    saveToLocalStorage: function () {
      localStorage.geofences = angular.toJson(this._geofences);
    },
    loadFromDevice: function () {
      var self = this;
      if ($window.geofence && $window.geofence.getWatched) {
        return $window.geofence.getWatched().then(function (geofencesJson) {
          self._geofences = angular.fromJson(geofencesJson);
          return self._geofences;
        });
      }
      return this.loadFromLocalStorage();
    },
    getAll: function () {
      var self = this;
      if (!self._geofencesPromise) {
        self._geofencesPromise = $q.defer();
        self.loadFromDevice().then(function (geofences) {
          self._geofences = geofences;
          self._geofencesPromise.resolve(geofences);
        }, function (reason) {
          $log.log("Error fetching geofences", reason);
          self._geofencesPromise.reject(reason);
        });
      }
      return self._geofencesPromise.promise;
    },
    addOrUpdate: function (geofence) {
      var self = this;
      $window.geofence.addOrUpdate(geofence).then(function () {
        if ((self.createdGeofenceDraft && self.createdGeofenceDraft === geofence) ||
          !self.findById(geofence.id)) {
          self._geofences.push(geofence);
          self.saveToLocalStorage();
        }

        if (self.createdGeofenceDraft) {
          self.createdGeofenceDraft = null;
        }
      });

    },
    findById: function (id) {
      if (this.createdGeofenceDraft && this.createdGeofenceDraft.id === id) {
        return this.createdGeofenceDraft;
      }
      var geoFences = this._geofences.filter(function (g) {
        return g.id === id;
      });
      if (geoFences.length > 0) {
        return geoFences[0];
      }
      return undefined;
    },
    remove: function (geofence) {
      var self = this;
      $ionicLoading.show({
        template: 'Removing geofence...'
      });
      $window.geofence.remove(geofence.id).then(function () {
        $ionicLoading.hide();
        self._geofences.splice(self._geofences.indexOf(geofence), 1);
        self.saveToLocalStorage();
      }, function (reason) {
        $log.log('Error while removing geofence', reason);
        $ionicLoading.show({
          template: 'Error',
          duration: 1500
        });
      });
    },
    removeAll: function () {
      var self = this;
      $ionicLoading.show({
        template: 'Removing all geofences...'
      });
      $window.geofence.removeAll().then(function () {
        $ionicLoading.hide();
        self._geofences.length = 0;
        self.saveToLocalStorage();
      }, function (reason) {
        $log.log('Error while removing all geofences', reason);
        $ionicLoading.show({
          template: 'Error',
          duration: 1500
        });
      });
    },
    getNextNotificationId: function () {
      var max = 0;
      this._geofences.forEach(function (gf) {
        if (gf.notification && gf.notification.id) {
          if (gf.notification.id > max) {
            max = gf.notification.id;
          }
        }
      });
      return max + 1;
    }
  };

  return geofenceService;
})

.factory('geolocationService', function ($q, $timeout) {
  var currentPositionCache;
  return {
    getCurrentPosition: function () {
      if (!currentPositionCache) {
        var deffered = $q.defer();
        navigator.geolocation.getCurrentPosition(function (position) {
          deffered.resolve(currentPositionCache = position);
          $timeout(function () {
            currentPositionCache = undefined;
          }, 10000);
        }, function () {
          deffered.reject();
        });
        return deffered.promise;
      }
      return $q.when(currentPositionCache);
    }
  };
})

.service('shelterService', function($http, networkService, $resource, $q) {
  var service = this;
  var shelters = [];

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

.service('peopleService', function($http, networkService, uploadService, $cordovaFile) {
    var peopleInShelter = [];
    var personByID = {};
    var testPhoto = {};
    var storedSearchQuery = "";

    this.getPerson = function(URL, query, success, error) {
      $http.get(URL, networkService.getAuthenticationHeader()).then(function(xhr) {
        if (xhr.status === 200) {
          if (xhr.data !== null) {
            peopleInShelter = [];    // Reset list, is safe

            if (query !== '') { // Temporary fix (search with '' returns all objects (since all contain ''))
              for (var i = 0; i < xhr.data.objects.length; i++) {
                var personOnServer = xhr.data.objects[i];
                var newPerson = {};

                newPerson.given_name = personOnServer.given_name;
                newPerson.status = 'On Server';
                newPerson.id = personOnServer.id;

                peopleInShelter.push(xhr.data.objects[i]);
              }
            }

            success();
          } else {
            error(undefined);
          }
        } else {
          error(xhr.status);
        }
      }, function(e) {
        error(e.statusText);
      });
    };

    this.searchPersonByID = function(id, success, error) {
      var searchURL = networkService.getSearchURL();
      searchURL += id;

      $http.get(searchURL + "/?limit=100", networkService.getAuthenticationHeader()).then(function(xhr) {
        if (xhr.status === 200) {
          if (xhr.data !== null) {
            if (xhr.data.objects.length > 0) {
              if (xhr.data.objects.length > 1) {
                // Multiple objects returned, search for ID specifically
                for (var i = 0; i < xhr.data.objects.length; i++){
                  if (parseInt(id) === xhr.data.objects[i].id){
                    personByID = xhr.data.objects[i];
                    break;
                  }
                }
              } else
                personByID = xhr.data.objects[0]; // Only 1 object returned

              success();
            } else {
              error(); // No objects returned
            }
          } else {
            error();
          }
        } else {
          error();
        }
      }, function(e) {
        if (e) {
          if (e.status === 401) {
            alert("Something went wrong with credentials.."); // Should never get in here
          } else {
            alert("A problem occurred when connecting to the server. \nStatus: " + e.status + ": " + e.description);
          }
        }
        error();
      });

      personByID = undefined; // Set by default
    };

    this.getRetrievedPersonByID = function (){
      return personByID;
    };

    this.setStoredSearchQuery = function (query) {
      storedSearchQuery = query;
    };

    this.getStoredSearchQuery = function (){
      return storedSearchQuery;
    };

    this.createSearchResult = function(peopleArr){
      peopleInShelter = [];    // Reset list, is safe

      for (var i = 0; i < peopleArr.length; i++){
        peopleInShelter.push(peopleArr[i]);
      }
    };

    this.updateAllPeople = function(URL, success) {
      $http.get(URL + "?limit=100", networkService.getAuthenticationHeader()).then(function(xhr) {
        if (xhr.status === 200) {
          if (xhr.data !== null) {
            peopleInShelter = [];

            for (var i = 0; i < xhr.data.objects.length; i++) {
              var personOnServer = xhr.data.objects[i];

              // Check for duplicates (only names - then ID so far)
              var duplicate = false;
              for (var j = 0; j < peopleInShelter.length; j++) {
                if (peopleInShelter[j].given_name === personOnServer.given_name){
                  if (peopleInShelter[j].id === personOnServer.id){
                    duplicate = true;
                    break;
                  }
                }
              }

              if (!duplicate) {
                personOnServer.status = "On Server";  //TEMPORARY
                personOnServer.photo = {};

                peopleInShelter.push(personOnServer);
              }
            }

            success();
          }
        }
      });
    };

    this.editPerson_saveChanges = function(newPerson, success, error){
      var putJSON = '{';
      var hasItem = false;

      var changeList = ['given_name', 'family_name', 'fathers_given_name', 'mothers_given_name', 'age',
      'date_of_birth', 'street_and_number', 'city', 'neighborhood', 'description', 'phone_number', 'barcode',
      'gender', 'injury', 'nationality', 'shelter_id'];

      for (var i = 0; i < changeList.length; i++) {
        if (newPerson[changeList[i]] !== undefined) {
          // Add ,
          if (i !== 0) {
            if (hasItem)
              putJSON += ', ';
          }

          putJSON += '"' + changeList[i] + '":"' + newPerson[changeList[i]] + '"';
          hasItem = true;
        }
      }

      // Separate photo check (has different method)
      if (newPerson.photo !== undefined) {
        // Photo has changed, upload it
        uploadService.uploadPhotoToUrl(newPerson.photo, networkService.getFileServiceURL(), function(data) {
          // Successful
          if (hasItem)
            putJSON += ', ';

          putJSON += ' "pic_filename":"' + data.name + '"';
          hasItem = true;

          finishHttpPut(hasItem, newPerson.id, putJSON, success, error);
        }, function() {
          // Error
          finishHttpPut(hasItem, newPerson.id, putJSON, success, error);
        });
      } else {
        finishHttpPut(hasItem, newPerson.id, putJSON, success, error);
      }
    };

    var finishHttpPut = function(hasItem, id, putJSON, success, error) {
      // Put into it's own function to not have gross copy+paste everywhere
      putJSON += '}';

      if (hasItem === true) {
        $http.put(networkService.getPeopleURL() + id + '/', putJSON, networkService.getAuthenticationHeader()).then(function (xhr) {
          if (xhr.status === 204) {
            success();
          } else {
            error();
          }
        });
      } else {
        success();
      }
    };

    this.printToConsole = function() {
      for (var i = 0; i < peopleInShelter.length; i++) {
        console.log(peopleInShelter[i].given_name);
      }
    };

    this.getPeopleInShelter = function() {
      return peopleInShelter;
    };

    this.getPhoto = function() {
      return testPhoto;
    };

    this.getPlaceholderImage = function() {
      return cordova.file.applicationDirectory + 'www/img/profile-photo-placeholder.jpg';
    };

    /*this.downloadPhotos = function() {
      var array = peopleInShelter;
      for (var i = 0; i < array.length; i++) {
        if (array[i].pic_filename && array[i].pic_filename !== "undefined") {
          var thisURL = networkService.getFileServiceURL() + array[i].pic_filename + 'download/';
          $http.get(thisURL).then(function (xhr) {
            if (xhr.status === 200) {
              if (xhr.data.status !== "file not found") {
                testPhoto = xhr.data;
                if (false) {
                  var reader = new window.FileReader();
                  reader.readAsDataURL(new Blob([xhr.data]));
                  reader.onloadend = function () {
                    var start = reader.result.split(',');
                    testPhoto = "data:image/jpeg;base64," + start[1];
                  };
                }
              }
            }
          }, function (error) {
            // Error
          });
        }
      }
    };*/
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
    default_configurations.configuration.username = "user";
    default_configurations.configuration.password = "pass";
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

    var URL = this.configuration.protocol + '://' + this.configuration.serverURL + '/api/v1';
    this.configuration.api = {};
    this.configuration.api.personURL = URL + '/person/';
    this.configuration.api.searchURL = URL + '/person/?custom_query=';
    this.configuration.api.fileServiceURL = URL + '/fileservice/';
    this.configuration.api.shelterURL = URL + '/shelter/';
    this.configuration.api.faceSearchURL = URL + '/facesearchservice/';

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

      var URL = this.configuration.protocol + '://' + Addr + '/api/v1';
      // Need to reset variables
      this.configuration.api.personURL = URL + '/person/';
      this.configuration.api.searchURL = URL + '/person/?custom_query=';
      this.configuration.api.fileServiceURL = URL + '/fileservice/';
      this.configuration.api.shelterURL = URL + '/shelter/';
      this.configuration.api.faceSearchURL = URL + '/facesearchservice/';
    };

    this.getBasicAuthentication = function() {
      var authentication = btoa(this.configuration.username + ':' + this.configuration.password);
      return 'Basic ' + authentication;
    };

    this.getAuthenticationHeader = function() {
      var authentication = btoa(this.configuration.username + ':' + this.configuration.password);
      var authen = {};
      authen.headers = {};
      if (authentication !== null) {
        authen.headers.Authorization = 'Basic ' + authentication;
      } else {
        authen.headers.Authorization = '';
      }

      return authen;
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

.factory('DBHelper', function($cordovaSQLite, $q, $ionicPlatform) {
    var self = this;

    self.query = function(query, parameters) {
      parameters = parameters || [];
      var q = $q.defer();

      $ionicPlatform.ready(function() {
        $cordovaSQLite.execute(db, query, parameters).then(
          function(result){
            q.resolve(result);
        }, function(error){
            console.log("Error with DB - " + error.message);
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

.factory('VIDA_localDB', function($cordovaSQLite, DBHelper, networkService){
    var self = this;

    self.queryDB_select = function(tableName, columnName, afterQuery) {
      return DBHelper.query("SELECT " + columnName + " FROM " + tableName)
        .then(function(result){
          afterQuery(DBHelper.getAll(result));
        });
    };

    self.queryDB_update = function(tableName, JSONObject) {
      var query = "UPDATE " + tableName + " SET settings=" + JSONObject;
      console.log(query);
      DBHelper.query(query)
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
      DBHelper.query(query).then(function(result){
        console.log(result);
      });
    };

    self.queryDB_insert = function(tableName, JSONObject) {
      var query = "INSERT INTO " + tableName + " VALUES (" + JSONObject + ")";
      console.log(query);
      DBHelper.query(query)
        .then(function (result) {
          console.log(result);
        });
    };

    return self;
  });
