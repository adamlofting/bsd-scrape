var scraper = require('./scrape.js');
scraper.runScrape(function () {
  console.log('tada');
  process.exit(0);
});
