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

if (!global.hasOwnProperty('db')) {

  var Sequelize = require('sequelize');

  var sequelizeOptions = {};
  sequelizeOptions.port = DB_PORT;
  sequelizeOptions.host = DB_HOST;
  sequelizeOptions.dialect = 'mysql';

  if (process.env.DB_SSL) {
    // SSL is used for Amazon RDS, but not necessarily for local dev
    sequelizeOptions.dialectOptions = {
      'SSL_VERIFY_SERVER_CERT': './cert/amazon-rds-ca-cert.pem'
    };
  }

  var sequelize = new Sequelize(DB_NAME,
                                DB_USER,
                                DB_PASSWORD,
                                sequelizeOptions);
  sequelize
    .authenticate()
    .then(function(err) {
      'use strict';
      if (!!err) {
        console.log('Unable to connect to the database:', err);
      } else {
        console.log('Connection has been established successfully.');
      }
    });

  // Models
  var Constituent = sequelize.define('Constituent', {
    bsdId: { type: Sequelize.INTEGER, primaryKey: true, unique: 'bsdID'},
    bsdCreatedAt: Sequelize.DATE,
    emailAddress: Sequelize.STRING,
    firstName: Sequelize.STRING,
    lastName: Sequelize.STRING,
    addr1: Sequelize.STRING,
    addr2: Sequelize.STRING,
    city: Sequelize.STRING,
    state: Sequelize.STRING,
    zip: Sequelize.STRING,
    countryCode: Sequelize.STRING,
    subscribedMofo: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
    subscribedWebmaker: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
    subscribedLearning: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
    subscribedMozfest: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
    interestMakerparty: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false }
  });

  var Activity = sequelize.define('Activity', {
    constituentBSDId: { type: Sequelize.INTEGER, unique: 'keyPerActivity'},
    constituentGroupName: { type: Sequelize.STRING, unique: 'keyPerActivity'},
    constituentGroupDate: Sequelize.DATE
  });

  // RUN THIS TO GENERATE THE TABLES
  // sequelize
  //   .sync({ force: false, logging: false })
  //   .then(function(err) {
  //     'use strict';
  //      if (!!err) {
  //        console.log('An error occurred while creating the table:', err);
  //      } else {
  //        console.log('Tables Created');
  //      }
  //   });

  // Singleton
  global.db = {
    Sequelize: Sequelize,
    sequelize: sequelize,
    Constituent: Constituent,
    Activity: Activity
  };
}

module.exports = global.db;
