var habitat = require("habitat");
var request = require('request');
var async = require('async');
var db = require('./models.js');
var dbdirect = require('./directdb.js');

var env = habitat.load('.env');

var BASKET_API_KEY;
var BASKET_API_HOST;

if (env) {
  BASKET_API_KEY = env.get("BASKET_API_KEY");
  BASKET_API_HOST = env.get("BASKET_API_HOST");
} else {
  BASKET_API_KEY = process.env.BASKET_API_KEY;
  BASKET_API_HOST = process.env.BASKET_API_HOST;
}



function doesUserExist (email, callback) {
  request.get({
      url: BASKET_API_HOST + '/news/lookup-user?api-key=' + BASKET_API_KEY + '&email='+ email
    }, function (basketError, response, body) {
      if (basketError) {
        console.log(basketError);
        return callback(basketError);
      }

      if (response.statusCode === 404) {
        // user does not exist, return false
        return callback(null, false);
      }

      if (response.statusCode != 200) {
        console.log('Basket HTTP error', response.statusCode);
        return callback('Basket HTTP error');
      }

      var json = JSON.parse(response.body);
      var token = json.token;

      console.log(json);

      // user does exist, return true
      return callback(null, true, token);
    });
}

function runUnsubscribe (subscriber, listsToUnsubscribe, token, callback) {

  request.post({
    url: BASKET_API_HOST + '/news/unsubscribe/' + token + '/',
    form: {
      email: subscriber.emailAddress,
      newsletters: listsToUnsubscribe
    },
    json: true

  }, function (basketError, response, body) {
    if (basketError) {
      console.log(basketError);
      return callback(basketError);
    }

    console.log(response.statusCode);

    console.log('Confirmed unsubscribed from', listsToUnsubscribe);
    return callback();

  });
}

function runSubscribe (subscriber, listsToSubscribe, callback) {
  request.post({
    url: BASKET_API_HOST + '/news/subscribe/',
    form: {
      format: "html",
      email: subscriber.emailAddress,
      newsletters: listsToSubscribe,
      country: subscriber.countryCode,
      source_url: "Interim_BSD_Middleware_Updater",
      trigger_welcome: "N",
      optin: "Y",
      lang: "en",
      "api-key": BASKET_API_KEY
    },
    json: true

  }, function (basketError, response, body) {
    if (basketError) {
      console.log(basketError);
      return callback(basketError);
    }

    console.log(response.statusCode);


    console.log('Subscribed to:', listsToSubscribe);
    return callback();

  });
}

/*
  Newsletter IDs in Basket:

  mozilla-foundation
  mozilla-learning-network
  webmaker
  maker-party
  mozilla-festival

 */
function buildNewsletterLists (subscriber) {
  var lists = {
    subscribe: "",
    unsubscribe: ""
  };

  var str = "";

  if (subscriber.subscribedMofo) {
    lists.subscribe += "mozilla-foundation,";
  } else {
    lists.unsubscribe += "mozilla-foundation,";
  }

  if (subscriber.subscribedWebmaker) {
    lists.subscribe += "webmaker,";
  } else {
    lists.unsubscribe += "webmaker,";
  }

  if (subscriber.subscribedLearning) {
    lists.subscribe += "mozilla-learning-network,";
  } else {
    lists.unsubscribe += "mozilla-learning-network,";
  }

  if (subscriber.subscribedMozfest) {
    lists.subscribe += "mozilla-festival,";
  } else {
    lists.unsubscribe += "mozilla-festival,";
  }

  if (subscriber.interestMakerparty) {
    lists.subscribe += "maker-party,";
  } else {
    lists.unsubscribe += "maker-party,";
  }

  // trim trailing comma
  lists.subscribe = lists.subscribe.replace(/,\s*$/, "");
  lists.unsubscribe = lists.unsubscribe.replace(/,\s*$/, "");

  return lists;
}



/**
 * This is used to keep BSD subscriptions and unsubs in sync while we transition systems
 *
 * First, see if user exists in ET
 *
 * If the user exists, unsubscribe from relevant MoFo newsletters (this will catch any unsubs)
 *
 * Then use latest BSD data to set subscriptions in Basket
 *   It doesn't matter if the user is new or not, as we just cleared all mofo subs
 *   If there are no subs, no need to call Basket
 */
function saveSubscriber (subscriber, callback) {
  console.log('UPDATING SUBSCRIBER:', subscriber.emailAddress);

  var userExistsInET = false;
  var userToken = null;
  var lists = buildNewsletterLists(subscriber);

  console.log(lists);

  async.waterfall([

    // See if user exists already
    function(callback) {

        doesUserExist(subscriber.emailAddress, function (err, userExists, token) {
          console.log('Does user exist?', userExists);
          userExistsInET = userExists;
          userToken = token;
          callback(null);
        });
    },

    // if exists, unsubscribe from relevant MoFo newsletters
    function(callback) {

        if (!userExistsInET) {
          // brand new user - no need to handle unsubs
          return callback(null);
        }

        // else - user may have unsubscribed

        if (lists.unsubscribe.length === 0) {
          // is subscribed to all lists - nothing to do here
          return callback(null);
        }

        runUnsubscribe(subscriber, lists.unsubscribe, userToken, function (err, res) {
          console.log('Finished registering unsubscribes with Basket');
          callback(null);
        });

    },

    // register any new subscriptions
    function(callback) {

        if (lists.subscribe.length === 0) {
          // user is not subscribed to any mofo lists
          return callback(null);
        }

        runSubscribe(subscriber, lists.subscribe, function (err, res) {
          console.log('Finished registering subscriptions with Basket');
          callback(null);
        });
    }
  ], function (err) {
      // async.waterfall COMPLETE
      return callback();
  });

}


function updateSubscribers (subscribers, callback) {
  async.eachLimit(subscribers, 1, function (subscriber, callback) {
    saveSubscriber(subscriber, function (err, res) {
      if (err) {
        console.log(err);
        return callback(err);
      }
      console.log('Completed runUpdate');
      return callback();
    });
  }, function (err) {
    if (err) {
      console.log(err);
    }
    callback();
  });
}

function getUpdatedSince (date, callback) {
  db.Constituent.findAll({
      where: {
        updatedAt: {
          $gte: date
        }
      }
    })
    .then(function (results) {
      callback(null, results);
    });
}

function updatedSinceExport (callback) {
  var date = new Date (2015,8,30);
  getUpdatedSince(date, function (err, results) {
    console.log('Got latest');
    console.log(results.length);
    callback();
  });
}


function runUpdate (callback) {

  var date = new Date();
  date.setMinutes(date.getMinutes() - 60);
  getUpdatedSince(date, function (err, results) {
    console.log('Got latest');
    console.log(results.length);

    results.forEach(function(result) {
      console.log(result.bsdId, result.emailAddress);
    });

    callback();
  });

  // var sub1 = {
  //   bsdCreatedAt: new Date(2015,0,1),
  //   emailAddress: 'contactme+sub1@adamlofting.com',
  //   firstName: 'TestFirst',
  //   lastName: 'TestLastName',
  //   countryCode: 'UK',
  //   subscribedMofo: true,
  //   subscribedWebmaker: false,
  //   subscribedLearning: false,
  //   subscribedMozfest: true,
  //   interestMakerparty: false
  // };

  // var sub2 = {
  //   bsdCreatedAt: new Date(2015,0,2),
  //   emailAddress: 'alofting+example@gmail.com',
  //   firstName: 'TestFirst',
  //   lastName: 'TestLastName',
  //   countryCode: 'UK',
  //   subscribedMofo: true,
  //   subscribedWebmaker: false,
  //   subscribedLearning: false,
  //   subscribedMozfest: false,
  //   interestMakerparty: false
  // };

  // var sub3 = {
  //   bsdCreatedAt: new Date(2015,0,3),
  //   emailAddress: 'contactme+sub3@adamlofting.com',
  //   firstName: 'TestFirst',
  //   lastName: 'TestLastName',
  //   countryCode: 'UK',
  //   subscribedMofo: false,
  //   subscribedWebmaker: false,
  //   subscribedLearning: false,
  //   subscribedMozfest: false,
  //   interestMakerparty: false
  // };

  // var subscribers = [sub1, sub2, sub3];

  // updateSubscribers(subscribers, function (err, res) {
  //   if (err) {
  //     console.error(err);
  //   }
  //   console.log('Updated Subscribers');
  //   return callback();
  // });

}

module.exports = {
  runUpdate: runUpdate,
  runUpdateSinceExport: updatedSinceExport
};
