var scraper = require('./scrape.js');
scraper.checkForUpdates(function () {
  console.log('tadone');
  process.exit(0);
});
