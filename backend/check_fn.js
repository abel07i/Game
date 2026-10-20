const db = require('./src/db');
async function run() {
  try {
    const res = await db.query("SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'fn_settle_room'");
    console.log(res.rows[0].pg_get_functiondef);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
run();
