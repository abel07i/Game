require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD
});
pool.query("SELECT id, display_name, phone_number, password_hash, role FROM users WHERE role='admin';").then(res => {
  console.log(res.rows);
  process.exit(0);
}).catch(console.error);
