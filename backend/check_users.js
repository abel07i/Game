const db = require('./src/db');
async function run() {
  try {
    const res = await db.query('SELECT id, phone_number, display_name, password_hash, role FROM users LIMIT 5');
    console.table(res.rows);
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
run();
