require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'fastderash',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD
});

async function run() {
  try {
    const userRes = await pool.query("SELECT id FROM users LIMIT 1");
    if (userRes.rows.length === 0) return console.log('No users found');
    const userId = userRes.rows[0].id;

    const roomRes = await pool.query("SELECT id FROM rooms WHERE status = 'open' LIMIT 1");
    if (roomRes.rows.length === 0) return console.log('No open rooms found');
    const roomId = roomRes.rows[0].id;

    // ensure user has balance
    await pool.query("UPDATE wallets SET balance = 50000 WHERE user_id = $1", [userId]);

    console.log('Testing buy_tickets...');
    const res = await pool.query('SELECT buy_tickets($1, $2, $3, $4, $5)', [userId, roomId, 100, [1, 2], 'real']);
    console.log('Success:', res.rows);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    pool.end();
  }
}

run();
