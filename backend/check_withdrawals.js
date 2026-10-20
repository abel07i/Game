const db = require('./src/db');
async function run() {
  const res = await db.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'withdrawal_requests'");
  console.log(res.rows);
  process.exit(0);
}
run();
