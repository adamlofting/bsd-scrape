var scraper = require('./scrape.js');
scraper.backFillGaps(function () {
  console.log('backfilled');
  process.exit(0);
});
