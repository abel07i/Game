require('dotenv').config();
const { Pool } = require('pg');
const crypto = require('crypto');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD
});

const pw = crypto.createHash('sha256').update('admin123').digest('hex');

pool.query(`
  INSERT INTO users (display_name, phone_number, password_hash, role) 
  VALUES ('Super Admin', '+251900000000', $1, 'admin') 
  ON CONFLICT (phone_number) 
  DO UPDATE SET password_hash = EXCLUDED.password_hash, role = 'admin'
  RETURNING *;
`, [pw]).then(res => {
  console.log('Admin user created/updated:', res.rows[0]);
  process.exit(0);
}).catch(err => {
  console.error('Error inserting admin:', err);
  process.exit(1);
});
