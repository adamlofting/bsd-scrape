var scraper = require('./scrape.js');
scraper.bigFillGaps(function () {
  console.log('bigfilled');
  process.exit(0);
});
