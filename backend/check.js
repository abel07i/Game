const db = require('./src/db');
async function run() {
  const res = await db.query("SELECT group_size, target_jackpot, count(*) FROM rooms WHERE status = 'open' GROUP BY group_size, target_jackpot ORDER BY target_jackpot, group_size");
  console.table(res.rows);
  process.exit(0);
}
run();
