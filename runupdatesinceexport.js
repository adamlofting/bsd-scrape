var basket = require('./basket.js');
basket.runUpdateSinceExport(function () {
  console.log('Ran runUpdateSinceExport');
  process.exit(0);
});
