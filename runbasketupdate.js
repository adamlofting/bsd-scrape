var basket = require('./basket.js');
basket.runUpdate(function () {
  console.log('Basketed');
  process.exit(0);
});
