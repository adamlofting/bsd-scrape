var generate_bsd_url = require("./bsd-api-auth.js");
var habitat = require("habitat");
var request = require('request');
var async = require('async');
var db = require('./models.js');
var parser = require('xml2json');

var env = habitat.load('.env');

// standard api params
var api_root = "https://sendto.mozilla.org/page/api/";
var api_id = env.get("BSD_API_ID");
var api_timestamp = Date.now() / 1000 | 0;
var api_version = "2";
var api_secret = env.get("BSD_SECRET");


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
      callback(null, latest.bsdId);
    });
}

/**
 * FUNCTION FOR ITERATING THROUGH BSD RESULTS AND SAVING
 */
function saveConstituents (json, callback) {
  var cons = json.api.cons;
  var constituentsToSave = [];
  var activitiesToSave = [];

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

/**
 * CALL BSD FUNCTION
 */
function callBSD (query_url, callback) {
  // call BSD
  request(query_url, function (error, response, body) {
    if (error) {
      console.error(error);
      return;
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
      console.log(response.statusCode);
      var xml = body;
      var json = parser.toJson(xml, {object: true});
      saveConstituents(json, function () {
        console.log('Finished Saving this batch of Constituents');
        callback(null);
      });
    }

  });
}

// this generates a URL string based on the length of user ids
// which reach up to 7 chars. So the total lenght needs to stay
// within sensible limits for the server to handle the request
var BATCH_SIZE = 500;

function processBatch (callback) {
  async.waterfall([
      function(callback) {
        // Get the current highest ID saved from previous scraping
          getCurrentHighestId (function (err, res) {
            console.log('CURRENT HIGHEST ID:', res);
            callback(null, res);
          });
      },
      function(currentHighestId, callback) {
        // get the next batch
        var nextId = currentHighestId + 1;
        var ids = buildIDQuery(nextId, BATCH_SIZE);
        var query_url = bsd_url("cons/get_constituents_by_id", {
                                  cons_ids: ids,
                                  bundles: 'primary_cons_addr,primary_cons_email,cons_group,primary_cons_phone'
                                });
        callBSD(query_url, function (err, res) {
          callback(null);
        });
      }
  ], function (err, result) {
      console.log('BATCH processed');
      callback();
  });
}


/**
 * SCRAPER LOGIC BELOW
 */

var count = 0;
var LOOPS = 2;

var startTime = new Date();
async.whilst(
    function () { return count < LOOPS; },
    function (callback) {
        count++;
        processBatch(function () {
          callback();
        });
    },
    function (err) {
        console.log(LOOPS + ' x LOOPS COMPLETED');
        console.log('BATCH_SIZE = ' + BATCH_SIZE);
        var countTotal = LOOPS * BATCH_SIZE;
        console.log('Processed ' + countTotal + ' Records');

        var endTime = new Date();
        console.log(startTime);
        console.log(endTime);
        console.log(endTime - startTime);
        var diff = (endTime - startTime) / 1000;
        var timePerRecord = (diff / countTotal).toFixed(2);
        console.log('Time taken:', diff + ' seconds');
        console.log('Time taken:', timePerRecord + ' seconds per record');
        console.log(BATCH_SIZE, timePerRecord);
    }
);







return;
















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


