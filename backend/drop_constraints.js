const { Pool } = require('pg');
require('dotenv').config();
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD
});
async function drop() {
  try {
    await pool.query("ALTER TABLE rooms DROP CONSTRAINT IF EXISTS chk_room_group_size;");
    await pool.query("ALTER TABLE seat_quotas DROP CONSTRAINT IF EXISTS chk_quota_group_size;");
    console.log("Constraints dropped successfully");
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
drop();
