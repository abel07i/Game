const db = require('./src/db');
db.query("UPDATE rooms SET status = 'refunded'").then(() => {
  console.log('done');
  process.exit(0);
}).catch(console.error);
