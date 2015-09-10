var generate_bsd_url = require("./bsd-api-auth.js");
var habitat = require("habitat");
var request = require('request');
var async = require('async');
var db = require('./models.js');
var dbdirect = require('./directdb.js');
var parser = require('xml2json');

var env = habitat.load('.env');

var BSD_API_ID;
var BSD_SECRET;
var BATCH_SIZE;
var SIMULTANIOUS_REQUESTS;
var BATCHES_TO_PROCESS;
var HRS_TO_UPDATE;

if (env) {
  BSD_API_ID = env.get("BSD_API_ID");
  BSD_SECRET = env.get("BSD_SECRET");
  BATCH_SIZE = env.get("BATCH_SIZE");
  SIMULTANIOUS_REQUESTS = env.get("SIMULTANIOUS_REQUESTS");
  BATCHES_TO_PROCESS = env.get("BATCHES_TO_PROCESS");
  HRS_TO_UPDATE = env.get("HRS_TO_UPDATE");
} else {
  BSD_API_ID = process.env.BSD_API_ID;
  BSD_SECRET = process.env.BSD_SECRET;
  BATCH_SIZE = parseInt(process.env.BATCH_SIZE);
  SIMULTANIOUS_REQUESTS = parseInt(process.env.SIMULTANIOUS_REQUESTS);
  BATCHES_TO_PROCESS = parseInt(process.env.BATCHES_TO_PROCESS);
  HRS_TO_UPDATE = parseInt(process.env.HRS_TO_UPDATE);
}

// standard api params
var api_root = "https://sendto.mozilla.org/page/api/";
var api_id = BSD_API_ID;
var api_timestamp = Date.now() / 1000 | 0;
var api_version = "2";
var api_secret = BSD_SECRET;

// tracking until done
var _complete = false;


function bsd_url (api_path, params) {
  var api_url = api_root + api_path;
  return generate_bsd_url(api_id, api_timestamp, api_url, api_version, params, api_secret);
}

/*
  Constituent Groups Related to Mailing List Prefs
 */

// WEBMAKER
// 268   Webmaker for Android
// 211  Webmaker
var constituentGroupsWebmaker = [ 268, 211 ];

// LEARNING
// 260   Learning Networks 2015
// 258  2014_contributors_with_email_optin
// 256  Teach the Web Talks 2015
// 254  TTWT
// 237  2014 Aug - Pledge to Teach the Web
// 229  2014 MakerParty MadLib Contributors
// 226  2014 MakerParty FF Snippet Survey
// 220  June 2014 snippet test - MP landing page
// 164  Super Mentors
var constituentGroupsLearning = [ 260, 258, 256, 254, 237, 229, 226, 220, 164 ];

// MOZFEST
// 262   Mozfest 2015 Save the Date
// 222  2014 Mozfest Registration
// 206  Mozfest 2014 Save the Date
// 197  Recipients - MozFest 2013 Recap (Participants)
// 190  MozPub October 2013 Attendees
var constituentGroupsMozfest = [ 262, 222, 206, 197, 190 ];

// MAKER PARTY
// 213  MP Save the Date to old lists - May 2014
// 207  Maker Party 2014
// 163  Interest in Maker Party 2013
var constituentGroupsMakerParty = [ 213, 207, 163 ];


/*
  Fetching constituents by ID, as the ids are incrementing INTs
 */

// Batch



function buildIDQuery (startingID, number) {
  var ids = "";
  var start = startingID;
  var stop =  startingID + number;
  for (var i = start; i <= stop; i++) {
    ids += [i];
    if (i < stop) {
      ids += ",";
    }
  }
  return ids;
}

function getClean(x) {
  if (typeof x === 'object') {
    return '';
  }
  return x;
}

function getCurrentHighestId (callback) {
    db.Constituent.find({order: '`bsdId` DESC'})
    .then(function (latest) {
      var highest = 0;
      if (latest && latest.bsdId) {
        highest = latest.bsdId;
      }
      callback(null, highest);
    });
}

/**
 * FUNCTION FOR ITERATING THROUGH BSD RESULTS AND SAVING
 */
function saveConstituents (json, options, callback) {
  var cons = json.api.cons;
  var constituentsToSave = [];
  var activitiesToSave = [];

  if (!cons || (cons.length === 0)) {
    _complete = true;
    return callback(null);
  }

  for (var i = 0; i < cons.length; i++) {
    var toSave = {};
    toSave.bsdId = cons[i].id;
    toSave.bsdCreatedAt = cons[i].create_dt;

    if (cons[i].cons_email) {
      toSave.emailAddress = cons[i].cons_email.email;

        // check if they are subscribed
        if (cons[i].cons_email.is_subscribed === '1') {

          // add to main mofo list
          toSave.subscribedMofo = true;

          // check constituent group membership for other interests
          if (cons[i].cons_group) {
            var groupsArray = cons[i].cons_group;
            for (var j = groupsArray.length - 1; j >= 0; j--) {
              var groupId = groupsArray[j].id;

              if (constituentGroupsWebmaker.indexOf(groupId) !== -1) {
                toSave.subscribedWebmaker = true;
              }

              if (constituentGroupsLearning.indexOf(groupId) !== -1) {
                toSave.subscribedLearning = true;
              }

              if (constituentGroupsMozfest.indexOf(groupId) !== -1) {
                toSave.subscribedMozfest = true;
              }

              if (constituentGroupsMakerParty.indexOf(groupId) !== -1) {
                toSave.interestMakerparty = true;
              }
            }
          }
        }
      }

      toSave.firstName = getClean(cons[i].firstname) || null;
      toSave.lastName = getClean(cons[i].lastname) || null;

      if (cons[i].cons_addr) {
        toSave.addr1 = getClean(cons[i].cons_addr.addr1) || null;
        toSave.addr2 = getClean(cons[i].cons_addr.addr2) || null;
        toSave.city = getClean(cons[i].cons_addr.city) || null;
        toSave.state = getClean(cons[i].cons_addr.state_cd) || null;
        toSave.zip = getClean(cons[i].cons_addr.zip) || null;
        toSave.countryCode = getClean(cons[i].cons_addr.country) || null;
      }

      // Store a list of constituent group activities
      if (cons[i].cons_group) {
        var groupsArray2 = cons[i].cons_group;
        for (var k = groupsArray2.length - 1; k >= 0; k--) {

          var activity = {  constituentBSDId: cons[i].id,
                            constituentGroupName: groupsArray2[k].name,
                            constituentGroupDate: new Date(1000 * groupsArray2[k].modified_dt)
                          };
          activitiesToSave.push(activity);
        }
      }
      constituentsToSave.push(toSave);
    }

  if (options.isUpdate) {
    // do upserts instead of bulk inserts
    // it's slower but fine for smaller batches
    async.parallel({
      upsertConstituents: function(callback){

        async.eachLimit(constituentsToSave, 8, function (item, callback) {
          console.log('upserting:', item.bsdId);
          db.Constituent.upsert(item)
          .then(function () {
            callback(null);
          });
        }, function(err){
            callback();
        });

      },
      upsertActivities: function(callback){

        async.eachLimit(constituentsToSave, 10, function (item, callback) {
          db.Activity.upsert(item)
          .then(function () {
            callback(null);
          });
        }, function(err){
            callback();
        });

      }
    },
    function(err, results) {
      // finished saving both types of record
      console.log('Finished parallel');
      return callback(null);
    });
  } else {

    // options.isUpdate === false
    // so do a regular bulk insert
    async.parallel({
      saveConstituents: function(callback){

          db.Constituent.bulkCreate(constituentsToSave)
            .then(function () {
              callback(null);
            });

      },
      saveActivities: function(callback){

        db.Activity.bulkCreate(activitiesToSave)
            .then(function () {
              callback(null);
            });

      }
    },
    function(err, results) {
      // finished saving both types of record
      return callback(null);
    });
  }

}

/**
 * CALL BSD FUNCTION
 */
function callBSD (query_url, callback) {
  // call BSD
  request(query_url, function (error, response, body) {
    if (error) {
      console.error(error);
      return callback();
    }

    if (response.statusCode == 202) {
      // response is deferred
      // see http://tools.bluestatedigital.com/pages/our-API#xml-deferred
      var deferredId = body;
      var deferredStatus;
      var deferredURL;
      var finalContent;

      // polling begins
      async.doWhilst(
        function (callback) {

          setTimeout(function() {
            // regenerate on each loop as URL is timestamped
            deferredURL = bsd_url("get_deferred_results", { deferred_id: deferredId });

            console.log('Polling for deferred results...');
            console.log(deferredURL);

            request(deferredURL, function (err, res, bdy) {
              if (err) {
                console.error(err);
                return callback (err);
              }

              // this will be 503 until it's ready
              deferredStatus = res.statusCode;
              if (bdy) {
                finalContent = bdy;
              }

              if (deferredStatus === 410) {
                console.log('Status: 410 - Results already retrieved');
              } else if (deferredStatus === 204) {
                console.log('Status: 204 - No content to deliver');
              } else {
                console.log('Status:', deferredStatus);
              }

              // async doWhilst callback
              callback(null);

            });

          }, 5000); // setTimeout

        },
        function () {
          // continue whilst status is 503
          return (deferredStatus === 503);
        },
        function (err) {
          // status is no longer 503
          console.log('FINISHED WAITING:');
          console.log('finalContent');
          console.log('');
          console.log(finalContent);
        }
      );
    } else {
      // response not deferred
      console.log(response.statusCode);
      var xml = body;
      var json = parser.toJson(xml, {object: true});
      callback(null, json);
    }

  });
}



/**
 * SCRAPER LOGIC BELOW
 */
var startTime = new Date();

// parallel requests to BSD as that's the slowest point in the process


function processMoreRecords (callback) {

  var startingId;
  var endingId;

  async.waterfall([
      function(callback) {
        // Get the current highest ID saved from previous scraping
          getCurrentHighestId (function (err, res) {
            startingId = res;
            console.log('CURRENT HIGHEST ID:', res);
            callback(null, res);
          });
      },
      function(currentHighestId, callback) {
        var nextId = currentHighestId + 1;
        var startingIds = [];
        // build an array of starting IDs
        for (var i = 0; i < BATCHES_TO_PROCESS; i++) {
          startingIds.push(nextId);
          nextId += BATCH_SIZE + 1;
        }

        console.log(startingIds);
        endingId = startingIds[startingIds.length-1] + BATCH_SIZE;

        async.eachLimit(startingIds, SIMULTANIOUS_REQUESTS, function (startingID, callback) {
          var ids = buildIDQuery(startingID, BATCH_SIZE);
          var query_url = bsd_url("cons/get_constituents_by_id", {
                                    cons_ids: ids,
                                    bundles: 'primary_cons_addr,primary_cons_email,cons_group,primary_cons_phone'
                                  });
          callBSD(query_url, function (err, json) {
            saveConstituents(json, { isUpdate: false }, function () {
              callback(null);
            });
          });

        }, function (err) {
          if( err ) {
              console.log(err);
          }
          callback();
        });
      }
  ], function (err, result) {
      console.log('PARALLEL REQUESTS processed');

      var countTotal = endingId - startingId;

      var endTime = new Date();
      console.log(startTime);
      console.log(endTime);
      var diff = (endTime - startTime) / 1000;
      var timePerRecord = (diff / countTotal).toFixed(3);
      console.log('Time taken:', diff + ' seconds');
      console.log('Time taken:', timePerRecord + ' seconds per record');
      console.log(BATCH_SIZE, timePerRecord);
      callback();
  });
}


function runScrape (callback) {
  async.whilst(
    function () {
      return _complete === false;
    },
    function (callback) {
      processMoreRecords(function () {
        callback();
      });
    },
    function (err) {
      console.log("=====================================");
      console.log("=====================================");
      console.log("================ END ================");
      console.log("=====================================");
      console.log("=====================================");
      callback();
    }
  );
}

function checkForUpdates (callback) {
  var date_ts = new Date() / 1000;
  var seconds_diff = HRS_TO_UPDATE * 60 * 60;
  var since = date_ts - seconds_diff;
  var query_url = bsd_url("cons/get_updated_constituents", {
                                  changed_since: since,
                                  bundles: 'primary_cons_addr,primary_cons_email,cons_group,primary_cons_phone'
                                });
  callBSD(query_url, function (err, json) {
    saveConstituents(json, { isUpdate: true }, function () {
      console.log('Finished saving constituents');
      callback(null);
    });
  });
}


function backFillGaps (callback) {
  // get all ids
  dbdirect.getAllIds(function  (err, results) {
    console.log('Got all Ids');

    var highestId = results[0].bsdId;
    console.log('highest:', highestId);

    var existingIds = [];
    for (var i = results.length - 1; i >= 0; i--) {
      existingIds.push(results[i].bsdId);
    }

    console.log("existingIds.length:", existingIds.length);

    var expectedIds = [];
    for (var j = 1; j < highestId; j++) {
      expectedIds.push(j);
    }

    console.log("expectedIds.length:", expectedIds.length);

// 1, 2, 5, 6, 7
// 1, 2, 3, 4, 5, 6, 7

    var has = {};
    var different = [];
    var length1 = existingIds.length;
    var length2 = expectedIds.length;


    for(var i=0; i<length1; i++){
            has[existingIds[i]]=NaN;
    }
    for(var i=0; i<length2; i++){
        var val=expectedIds[i];
        if(has[val] === undefined){
            has[val]=null;
        }
        else{
            if(has[val]!=null){
                has[val]=true;
            }
        }
    }
    for(var i in has){
        if (!has[i]) different.push(i);
    }

    var diffLength = different.length;
    console.log('different.length', diffLength);

    var batch = different.slice(0, BATCH_SIZE);


    var ids = "";
    var batchLength = batch.length;
    for (var k = 0; k < batchLength; k++) {
      ids += batch[k];
      if (k < batchLength-1) {
        ids += ",";
      }
    }
    console.log(ids);

    var query_url = bsd_url("cons/get_constituents_by_id", {
                              cons_ids: ids,
                              bundles: 'primary_cons_addr,primary_cons_email,cons_group,primary_cons_phone'
                            });
    callBSD(query_url, function (err, json) {
      saveConstituents(json, { isUpdate: true }, function () {
        console.log('============', diffLength);
        return callback(null);
      });
    });
  });
}

module.exports = {
  runScrape: runScrape,
  checkForUpdates: checkForUpdates,
  backFillGaps: backFillGaps
};














// Returns 'API User not recognized', but user has correct permissions
// var query_url = bsd_url("cons/get_bulk_constituent_data", {
//                                 format: 'csv',
//                                 fields: 'firstname,lastname,primary_email',
//                                 filter: 'is_subscribed',
//                                 cons_ids: 262
//                               });

// var query_url = bsd_url("cons/get_constituents", {
//                                 filter: 'is_subscribed,email=test@example.com',
//                               });


// var date = new Date();
// date.setDate(date.getDate() - 1);
// var yesterday_timestamp = date  / 1000 | 0;
// var query_url = bsd_url("cons/get_updated_constituents", {
//                                 changed_since: yesterday_timestamp,
//                                 bundles: 'primary_cons_addr,primary_cons_email,cons_group,primary_cons_phone'
//                               });

// works
// var query_url = bsd_url("cons_group/list_constituent_groups", {});

// works
// var query_url = bsd_url("cons/get_constituents_by_id", {
//                                 cons_ids: 25730
//                               });

// works
// var query_url = bsd_url("cons_group/get_cons_ids_for_group", {
//                           cons_group_id: 262
//                         });


