// Generated by CoffeeScript 1.9.3
var BASE_URL, DEFAULT_CALENDAR, Event, File, Folder, NotificationHelper, async, fs, ical, localization, log, moment, request, vcal,
  indexOf = [].indexOf || function(item) { for (var i = 0, l = this.length; i < l; i++) { if (i in this && this[i] === item) return i; } return -1; };

request = require('request');

moment = require('moment');

async = require('async');

fs = require('fs');

ical = require('cozy-ical');

vcal = require('cozy-ical').VCalendar;

NotificationHelper = require('cozy-notifications-helper');

Folder = require('../models/folder');

File = require('../models/file');

Event = require('../models/event');

localization = require('../lib/localization_manager');

log = require('printit')({
  prefix: "Isen",
  date: true
});

BASE_URL = 'https://web.isen-bretagne.fr/cc/jsonFileList/';

DEFAULT_CALENDAR = 'ISEN';

module.exports = {
  name: "ISEN",
  slug: "isen",
  description: 'konnector description isen',
  vendorLink: "https://www.isen.fr/",
  fields: {
    email: "text"
  },
  models: {
    file: File,
    folder: Folder,
    event: Event
  },
  notification: new NotificationHelper('konnectors'),
  init: function(callback) {
    var map;
    map = function(doc) {
      return emit(doc.start, doc);
    };
    return Event.defineRequest('byDate', map, callback);
  },
  fetch: function(requiredFields, callback) {
    log.info("Import started");
    this.numItems = 0;
    return async.waterfall([
      (function(_this) {
        return function(next) {
          return _this.fetchIcs(requiredFields, next);
        };
      })(this), (function(_this) {
        return function(body, next) {
          return _this.parseIcs(body, next);
        };
      })(this), (function(_this) {
        return function(rawEvents, boundaries, next) {
          return _this.processEvents(rawEvents, function(err, events) {
            return next(err, events, boundaries);
          });
        };
      })(this), (function(_this) {
        return function(events, boundaries, next) {
          return _this.checkEventsToDelete(events, boundaries, next);
        };
      })(this), (function(_this) {
        return function(events, next) {
          return _this.extractUrls(events, next);
        };
      })(this), (function(_this) {
        return function(list, next) {
          return _this.processUrls(list, next);
        };
      })(this)
    ], (function(_this) {
      return function(err) {
        var localizationKey, notifContent, options;
        if (err != null) {
          log.error(err);
          return callback(err);
        } else {
          log.info("Import finished");
          notifContent = null;
          if (_this.numItems > 0) {
            localizationKey = 'notification isen';
            options = {
              smart_count: _this.numItems
            };
            notifContent = localization.t(localizationKey, options);
          }
          return callback(err, notifContent);
        }
      };
    })(this));
  },
  fetchIcs: function(requiredFields, callback) {
    var baseMainUrl, err, fetchUrl, firstPart, firstname, lastname, options, ref, ref1, secondPart;
    baseMainUrl = 'https://web.isen-bretagne.fr/cc/PublishVCalendar';
    ref = requiredFields.email.split('@'), firstPart = ref[0], secondPart = ref[1];
    ref1 = firstPart.split('.'), firstname = ref1[0], lastname = ref1[1];
    options = {
      method: 'GET',
      jar: true
    };
    if (firstname !== '' && lastname !== '') {
      fetchUrl = baseMainUrl + "/" + firstname + "." + lastname + ".ics";
      log.debug("Fetching " + fetchUrl);
      options.uri = fetchUrl;
      options.timeout = 7000;
      return request(options, function(err, res, body) {
        if (err != null) {
          return callback(err);
        } else if (res.statusCode === 503) {
          err = "server unavailable, please try again later";
          return callback(err);
        } else if (res.statusCode === 404) {
          err = "wrong first/lastname combination, user not found";
          return callback(err);
        } else if (res.statusCode === 204) {
          return callback(null, '');
        } else if (res.statusCode === 500) {
          err = "the remote server responded with an error";
          return callback(err);
        } else {
          return callback(null, body);
        }
      });
    } else {
      err = 'Firstname and/or lastname not supplied';
      return callback(err);
    }
  },
  parseIcs: function(mainData, callback) {
    var parser;
    log.debug('Parsing file...');
    parser = new ical.ICalParser();
    if (mainData === '') {
      return callback(null, [], {
        start: moment.unix(0).toISOString(),
        end: moment.unix(0).toISOString()
      });
    } else {
      return parser.parseString(mainData, function(err, calendar) {
        var boundaries, calendarName, events, firstEvent, parts;
        if (err != null) {
          log.error(err);
          return callback(err);
        } else {
          calendarName = calendar.model.name;
          parts = calendarName.split('/');
          firstEvent = calendar.subComponents[1].model;
          boundaries = {
            start: moment.unix(parts[2] / 1000).toISOString(),
            end: moment.unix(parts[3] / 1000).toISOString()
          };
          events = Event.extractEvents(calendar, DEFAULT_CALENDAR);
          return callback(null, events, boundaries);
        }
      });
    }
  },
  processEvents: function(rawEvents, callback) {
    log.debug('Processing events, creating new ones...');
    if (rawEvents.length === 0) {
      return callback(null, []);
    } else {
      return async.reduce(rawEvents, [], (function(_this) {
        return function(memo, rawEvent, next) {
          return Event.createOrUpdate(rawEvent, function(err, event) {
            if (err != null) {
              return next(null, memo);
            } else {
              return _this.checkEventsUpdateToNotify(event, function() {
                return next(null, memo.concat([event]));
              });
            }
          });
        };
      })(this), function(err, events) {
        return callback(null, events);
      });
    }
  },
  checkEventsUpdateToNotify: function(event, callback) {
    var formatter, newStart, newStartInRange, notifContent, notificationKey, oldStart, oldStartInRange, options, startNoLongerInRange, startNowInRange, url, urlDateFormat;
    if (event.beforeUpdate != null) {
      oldStart = moment(event.start);
      newStart = moment(event.beforeUpdate.start);
      oldStartInRange = this.isInNearFuture(oldStart);
      newStartInRange = this.isInNearFuture(newStart);
      startNoLongerInRange = oldStartInRange && !newStartInRange;
      startNowInRange = !oldStartInRange && newStartInRange;
      if (startNoLongerInRange || startNowInRange) {
        notificationKey = 'notification isen event changed';
        formatter = localization.t('notification isen date format');
        options = {
          description: event.description,
          oldDate: oldStart.format(formatter),
          newDate: newStart.format(formatter)
        };
        notifContent = localization.t(notificationKey, options);
        urlDateFormat = newStart.format('YYYY/M');
        url = "month/" + urlDateFormat + "/" + event.id;
        return this.notification.createTemporary({
          app: 'konnectors',
          text: notifContent,
          resource: {
            app: 'calendar',
            url: url
          }
        }, function(err) {
          if (err != null) {
            log.error(err);
          }
          return callback();
        });
      } else {
        return callback();
      }
    } else {
      return callback();
    }
  },
  isInNearFuture: function(date) {
    var dateObject, dayOfWeek, limit, toAdd, today;
    today = moment().startOf('day');
    dayOfWeek = today.day();
    if (dayOfWeek === 4) {
      toAdd = 5;
    } else if (dayOfWeek === 5) {
      toAdd = 4;
    } else if (dayOfWeek === 6) {
      toAdd = 3;
    } else {
      toAdd = 2;
    }
    limit = moment(today).add(toAdd, 'days').endOf('day');
    dateObject = moment(date);
    return dateObject.isBetween(today, limit);
  },
  checkEventsToDelete: function(eventsReference, boundaries, callback) {
    var options;
    log.debug('Looking for events to delete...');
    if (eventsReference.length === 0) {
      return callback(null, []);
    } else {
      options = {
        startKey: boundaries.start,
        endKey: boundaries.end
      };
      return Event.getInRange(options, (function(_this) {
        return function(err, events) {
          var eventsReferenceId, removed;
          if (err != null) {
            return callback(err);
          } else {
            eventsReferenceId = eventsReference.map(function(event) {
              return event.id;
            });
            removed = [];
            return async.eachSeries(events, function(event, next) {
              var caldavuri, hasBeenCreatedByKonnector, inTheFuture, now, ref;
              now = moment();
              inTheFuture = moment(event.start).isAfter(now);
              caldavuri = event.caldavuri;
              hasBeenCreatedByKonnector = (caldavuri != null) && /Aurion.*/.test(caldavuri);
              if ((ref = event.id, indexOf.call(eventsReferenceId, ref) < 0) && event.tags[0] === DEFAULT_CALENDAR && hasBeenCreatedByKonnector && inTheFuture) {
                return event.destroy(function(err) {
                  var formatter, formatterKey, localeKey, notifContent;
                  if (err != null) {
                    log.error(err);
                  }
                  removed.push(event.id);
                  if (_this.isInNearFuture(event.start)) {
                    formatterKey = 'notification isen date format';
                    formatter = localization.t(formatterKey);
                    options = {
                      description: event.description,
                      date: moment(event.start).format(formatter)
                    };
                    localeKey = 'notification isen event deleted';
                    notifContent = localization.t(localeKey, options);
                    return _this.notification.createTemporary({
                      app: 'konnectors',
                      text: notifContent,
                      resource: {
                        app: 'calendar',
                        url: ''
                      }
                    }, function(err) {
                      if (err != null) {
                        log.error(err);
                      }
                      return next();
                    });
                  } else {
                    return next();
                  }
                });
              } else {
                return next();
              }
            }, function(err) {
              eventsReference = eventsReference.filter(function(event) {
                var ref;
                return ref = event.id, indexOf.call(removed, ref) < 0;
              });
              return callback(null, eventsReference);
            });
          }
        };
      })(this));
    }
  },
  extractUrls: function(events, callback) {
    log.debug('Extracting course URLs from events...');
    return async.reduce(events, [], function(memo, event, next) {
      var baseCourseUrl, courseUrl, courseUrlIndex, details, formattedDetails;
      details = event.details;
      if ((details != null) && details.length > 0) {
        formattedDetails = details.split('\n');
        courseUrlIndex = formattedDetails.length - 2;
        courseUrl = formattedDetails[courseUrlIndex];
        baseCourseUrl = courseUrl != null ? courseUrl.substring(0, BASE_URL.length) : void 0;
        if ((courseUrl != null) && baseCourseUrl === BASE_URL) {
          if (indexOf.call(memo, courseUrl) < 0) {
            return next(null, memo.concat([courseUrl]));
          } else {
            log.debug("skipping [" + courseUrl + "]: already in list");
            return next(null, memo);
          }
        } else {
          log.debug("No course file found in event");
          return next(null, memo);
        }
      } else {
        log.debug("Details not found in event");
        return next(null, memo);
      }
    }, function(err, list) {
      if (list.length === 0) {
        err = null;
      }
      return callback(err, list);
    });
  },
  processUrls: function(list, callback) {
    if (list.length === 0) {
      return callback(null);
    } else {
      return async.eachSeries(list, (function(_this) {
        return function(url, done) {
          return async.waterfall([
            function(next) {
              return _this.fetchJson(url, next);
            }, function(courseData, next) {
              return async.series([
                function(next) {
                  return _this.checkKeys(courseData, next);
                }, function(next) {
                  return _this.processFolder(courseData, next);
                }, function(next) {
                  return _this.parseCourse(courseData, next);
                }, function(next) {
                  return _this.checkFilesToDelete(courseData, next);
                }
              ], next);
            }
          ], function(err) {
            if (err != null) {
              log.error(err);
            }
            return done();
          });
        };
      })(this), function(err) {
        return callback(err);
      });
    }
  },
  fetchJson: function(url, callback) {
    var options;
    options = {
      method: 'GET',
      uri: url,
      timeout: 7000
    };
    log.info("Retrieving file: " + url);
    return request(options, function(err, res, body) {
      var courseData, error;
      if (err != null) {
        return callback(err);
      } else if ((body != null ? body.length : void 0) === 0) {
        err = 'Course file empty, the course may be not available ' + 'for the moment';
        return callback(err);
      } else {
        try {
          courseData = JSON.parse(body);
        } catch (_error) {
          error = _error;
          err = "JSON.parse error: " + error;
        }
        return callback(err, courseData);
      }
    });
  },
  checkKeys: function(courseData, callback) {
    var err;
    if ((courseData['File(s)'] != null) && (courseData['course'] != null) && (courseData['year'] != null) && (courseData['curriculum'] != null)) {
      return callback();
    } else {
      err = 'Error: Missing course data in the file';
      return callback(err);
    }
  },
  processFolder: function(courseData, callback) {
    var course, curriculum, year;
    year = courseData.year, curriculum = courseData.curriculum, course = courseData.course;
    return async.series([
      (function(_this) {
        return function(next) {
          var path;
          path = '';
          return _this.checkAndCreateFolder(year, path, next);
        };
      })(this), (function(_this) {
        return function(next) {
          var path;
          path = "/" + year;
          return _this.checkAndCreateFolder(curriculum, path, next);
        };
      })(this), (function(_this) {
        return function(next) {
          var path;
          path = "/" + year + "/" + curriculum;
          return _this.checkAndCreateFolder(course, path, next);
        };
      })(this)
    ], callback);
  },
  checkAndCreateFolder: function(name, path, callback) {
    return Folder.allPath(function(err, folders) {
      var document, fullpath, now;
      fullpath = path + "/" + name;
      if (err != null) {
        return callback(err);
      } else if (indexOf.call(folders, fullpath) >= 0) {
        return callback();
      } else {
        now = moment().toISOString();
        document = {
          name: name,
          path: path,
          creationDate: now,
          lastModification: now,
          "class": 'document'
        };
        return Folder.createNewFolder(document, function(err, newFolder) {
          console.log(err);
          if (err != null) {
            return callback(err);
          } else {
            log.info("Folder " + name + " created");
            return callback();
          }
        });
      }
    });
  },
  parseCourse: function(courseData, callback) {
    return async.eachSeries(courseData['File(s)'], (function(_this) {
      return function(file, done) {
        return _this.checkFile(file, courseData, function(err) {
          if (err != null) {
            log.error(err);
          }
          return done();
        });
      };
    })(this), function(err) {
      log.info("Import of course " + courseData['course'] + " finished");
      return callback(err);
    });
  },
  checkFile: function(file, courseData, callback) {
    var course, curriculum, date, dateFormat, dateLastModified, err, fileName, fullPath, path, url, year;
    dateLastModified = file.dateLastModified, fileName = file.fileName, url = file.url;
    if ((dateLastModified == null) || (fileName == null) || (url == null)) {
      err = "Error: Missing data in " + fileName;
      return callback(err);
    }
    year = courseData.year, curriculum = courseData.curriculum, course = courseData.course;
    path = "/" + year + "/" + curriculum + "/" + course;
    fullPath = path + "/" + fileName;
    dateFormat = 'YYYY-MM-DD hh:mm:ss';
    date = moment(dateLastModified, dateFormat).toISOString();
    return File.byFullPath({
      key: fullPath
    }, (function(_this) {
      return function(err, sameFiles) {
        if (err != null) {
          return callback(err);
        }
        if (sameFiles.length > 0) {
          file = sameFiles[0];
          if (file.lastModification < date) {
            return file.destroyWithBinary(function(err) {
              if (err != null) {
                return callback(err);
              } else {
                log.debug(fileName + " deleted");
                return _this.createFile(fileName, path, date, url, [], callback);
              }
            });
          } else {
            log.debug("skipping " + fileName + " (not updated)");
            return callback();
          }
        } else {
          return _this.createFile(fileName, path, date, url, [], callback);
        }
      };
    })(this));
  },
  createFile: function(fileName, path, date, url, tags, callback) {
    this.numItems++;
    return File.createNew(fileName, path, date, url, tags, function(err) {
      if (err != null) {
        return callback(err);
      } else {
        log.info(fileName + " imported");
        return callback();
      }
    });
  },
  checkFilesToDelete: function(courseData, callback) {
    var course, curriculum, path, year;
    year = courseData.year, curriculum = courseData.curriculum, course = courseData.course;
    path = "/" + year + "/" + curriculum + "/" + course;
    log.info("Check if there are files to delete");
    return File.byFolder({
      key: path
    }, function(err, files) {
      var referenceFiles, referenceFilesName;
      if (err != null) {
        return callback(err);
      } else {
        referenceFiles = courseData['File(s)'] || [];
        referenceFilesName = referenceFiles.map(function(file) {
          return file.fileName;
        });
        return async.eachSeries(files, function(file, next) {
          var ref;
          if (ref = file.name, indexOf.call(referenceFilesName, ref) < 0) {
            log.info("File " + file.name + " not found in list...");
            return file.destroyWithBinary(function(err) {
              if (err != null) {
                log.eror(err);
              }
              log.info("...file " + file.name + " destroyed");
              return next();
            });
          } else {
            return next();
          }
        }, callback);
      }
    });
  }
};
