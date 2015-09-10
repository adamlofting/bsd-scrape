var habitat = require("habitat");
var env = habitat.load('.env');

var DB_PORT;
var DB_HOST;
var DB_NAME;
var DB_USER;
var DB_PASSWORD;

if (env) {
  DB_PORT = env.get("DB_PORT");
  DB_HOST = env.get("DB_HOST");
  DB_NAME = env.get("DB_NAME");
  DB_USER = env.get("DB_USER");
  DB_PASSWORD = env.get("DB_PASSWORD");
} else {
  DB_PORT = process.env.DB_PORT;
  DB_HOST = process.env.DB_HOST;
  DB_NAME = process.env.DB_NAME;
  DB_USER = process.env.DB_USER;
  DB_PASSWORD = process.env.DB_PASSWORD;
}

var mysql      = require('mysql');
var connection = mysql.createConnection({
  host     : DB_HOST,
  user     : DB_USER,
  password : DB_PASSWORD,
  database : DB_NAME
});

function getAllIds (callback) {
  connection.connect();
  connection.query('SELECT bsdId FROM Constituents ORDER BY bsdId DESC', function(err, rows, fields) {
    if (err) throw err;
    var results = rows;
    connection.end();
    return callback(null, results);
  });
}


module.exports = {
  getAllIds: getAllIds
};
