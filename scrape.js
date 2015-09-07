var generate_bsd_url = require("./bsd-api-auth.js");
var habitat = require("habitat");
var request = require('request');
var async = require('async');

var env = habitat.load('.env');

// standard api params
var api_root = "https://sendto.mozilla.org/page/api/";
var api_id = env.get("BSD_API_ID");
var api_timestamp = Date.now() / 1000 | 0;
var api_version = "2";
var api_secret = env.get("BSD_SECRET");


// call the bulk API
// filter to constituent group
// filter to is_subscribed


function bsd_url (api_path, params) {
  var api_url = api_root + api_path;
  return generate_bsd_url(api_id, api_timestamp, api_url, api_version, params, api_secret);
}


// Returns 'API User not recognized', but user has correct permissions
// var query_url = bsd_url("cons/get_bulk_constituent_data", {
//                                 format: 'csv',
//                                 fields: 'firstname,lastname,primary_email',
//                                 filter: 'is_subscribed',
//                                 cons_ids: 262
//                               });

// var query_url = bsd_url("cons/get_constituents", {
//                                 filter: 'is_subscribed',
//                               });


// var query_url = bsd_url("cons/get_updated_constituents", {
//                                 changed_since: 1,
//                                 filter: 'is_subscribed'
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



// testing getting a batch
var ids = "";
var start = 1;
var stop =  30;
for (var i = start; i <= stop; i++) {
  ids += [i];
  if (i < stop) {
    ids += ",";
  }
}

var query_url = bsd_url("cons/get_constituents_by_id", {
                                cons_ids: ids,
                                bundles: 'primary_cons_addr,primary_cons_email,cons_group,primary_cons_phone'
                              });


console.log(query_url);


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

          // callback
          setTimeout(callback, 1000);
        });
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
    console.log(body);
  }

});


