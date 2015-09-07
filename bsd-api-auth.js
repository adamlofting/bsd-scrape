// https://github.com/jbuck/bsd-api-auth
var crypto = require("crypto");
var querystring = require("querystring");
var url = require("url");

var _sort_object_by_key = function _sort_object_by_key(unsorted) {
  var sorted = {};

  Object.keys(unsorted).sort().forEach(function(key) {
    sorted[key] = unsorted[key];
  });

  return sorted;
};

module.exports = function generate_bsd_url(api_id, api_timestamp, api_url, api_version, params, api_secret) {
  // this is needed for cons_ids, but causes problems for the filter parameter
  var reAllowCommas = /%2C/g;
  var parsed_url = url.parse(api_url);

  var signing_string = "";
  signing_string += api_id + "\n";
  signing_string += api_timestamp + "\n";
  signing_string += parsed_url.pathname + "\n";

  params.api_id = api_id;
  params.api_ts = api_timestamp;
  params.api_ver = api_version;

  var sorted_querystring = _sort_object_by_key(params);
  signing_string += querystring.stringify(sorted_querystring);
  signing_string = signing_string.replace(reAllowCommas, ',');

  var sha1_hmac = crypto.createHmac("sha1", api_secret);
  sha1_hmac.update(signing_string);
  var api_mac = sha1_hmac.digest("hex");

  sorted_querystring.api_mac = api_mac;
  sorted_querystring = _sort_object_by_key(sorted_querystring);
  parsed_url.search = "?" + querystring.stringify(sorted_querystring);
  parsed_url.search = parsed_url.search.replace(reAllowCommas, ',');

  return url.format(parsed_url);
};
