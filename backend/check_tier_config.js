require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD
});
pool.query("SELECT * FROM tier_config LIMIT 1;").then(res => {
  console.log('tier_config:', res.rows[0]);
  process.exit(0);
}).catch(console.error);
