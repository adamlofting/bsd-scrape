var basket = require('./basket.js');

var date = new Date (2015, 8, 30, 0, 0); // month is 0 index
console.log(date);
basket.runUpdateGivenDay(date, function () {
  console.log('Ran runUpdateGivenDay');
  process.exit(0);
});
