// Generated by CoffeeScript 1.10.0
var Konnector, async, createKonnectors, fs, getKonnectorsToCreate, initializeKonnector, konnectorModules, konnectorResetValue, log, patch060, patch381, path;

path = require('path');

fs = require('fs');

async = require('async');

log = require('printit')({
  prefix: null,
  date: true
});

Konnector = require('../models/konnector');

konnectorModules = require('../lib/konnector_hash');

patch060 = function(callback) {
  return Konnector.request('all', function(err, konnectors) {
    return async.eachSeries(konnectors, function(konnector, done) {
      var data, slug;
      if (konnector.fieldValues != null) {
        slug = konnector.slug;
        log.info("Cleaning fields for konnector " + slug + "...");
        konnector.cleanFieldValues();
        data = {
          fieldValues: konnector.fieldValues,
          accounts: konnector.accounts,
          password: konnector.password
        };
        return konnector.updateAttributes(data, function(err) {
          if (err) {
            log.info("An error occured cleaning konnector " + slug);
            log.error(err);
          } else {
            log.info("Fields for konnector " + slug + " are cleaned.");
          }
          return done();
        });
      } else {
        return done();
      }
    }, function(err) {
      return callback();
    });
  });
};

patch381 = function(callback) {
  return Konnector.request('all', function(err, konnectors) {
    return async.eachSeries(konnectors, function(konnector, done) {
      var data, slug;
      if (konnector.accounts.length === 0 && konnector.importErrorMessage) {
        data = {
          importErrorMessage: null
        };
        slug = konnector.slug;
        return konnector.updateAttributes(data, function(err) {
          if (err) {
            log.info("An error occured cleaning konnector " + slug);
            log.error(err);
          } else {
            log.info("Fields for konnector " + slug + " are cleaned.");
          }
          return done();
        });
      } else {
        return done();
      }
    }, function(err) {
      return callback();
    });
  });
};

module.exports = function(callback) {
  return patch060(function() {
    return patch381(function() {
      return Konnector.all(function(err, konnectors) {
        var konnectorHash;
        if (err) {
          log.error(err);
          return callback(err);
        } else {
          konnectorHash = {};
          return async.eachSeries(konnectors, function(konnector, done) {
            konnectorHash[konnector.slug] = konnector;
            return konnectorResetValue(konnector, done);
          }, function(err) {
            var konnectorsToCreate;
            if (err) {
              log.error(err);
            }
            konnectorsToCreate = getKonnectorsToCreate(konnectorHash);
            if (konnectorsToCreate.length === 0) {
              return callback();
            } else {
              return createKonnectors(konnectorsToCreate, callback);
            }
          });
        }
      });
    });
  });
};

konnectorResetValue = function(konnector, callback) {
  var data;
  if (konnector.isImporting || konnector.fieldValues) {
    log.info("Reseting isImporting field for " + konnector.slug + "...");
    konnector.cleanFieldValues();
    data = {
      isImporting: false
    };
    return konnector.updateAttributes(data, function(err) {
      var slug;
      slug = konnector.slug;
      if (err) {
        log.info("An error occured reseting isImporting for " + slug);
        log.error(err);
      } else {
        log.info("IsImporting field for " + slug + " is reseted.");
        log.info(konnector.slug + " fields cleaned.");
      }
      return callback();
    });
  } else {
    return callback();
  }
};

getKonnectorsToCreate = function(konnectorHash) {
  var konnectorModule, konnectorsToCreate, name;
  konnectorsToCreate = [];
  for (name in konnectorModules) {
    konnectorModule = konnectorModules[name];
    if (konnectorHash[konnectorModule.slug] == null) {
      konnectorsToCreate.push(konnectorModule);
      log.info("New konnector to init: " + name);
    }
  }
  return konnectorsToCreate;
};

createKonnectors = function(konnectorsToCreate, callback) {
  return async.eachSeries(konnectorsToCreate, function(konnector, done) {
    return initializeKonnector(konnector, done);
  }, function(err) {
    log.info('All konnectors created');
    return callback();
  });
};

initializeKonnector = function(konnector, callback) {
  log.debug("creating " + konnector.slug);
  if (konnector.init != null) {
    return konnector.init(function(err) {
      if (err) {
        log.error(err);
        return callback(err);
      } else {
        return Konnector.create(konnector, function(err) {
          if (err) {
            log.error(err);
          }
          return callback(err);
        });
      }
    });
  } else {
    return Konnector.create(konnector, function(err) {
      if (err) {
        log.error(err);
      }
      return callback(err);
    });
  }
};
