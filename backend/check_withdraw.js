const db = require('./src/db');
async function run() {
  const res = await db.query("SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'fn_wallet_withdraw'");
  console.log(res.rows[0].pg_get_functiondef);
  process.exit(0);
}
run();
