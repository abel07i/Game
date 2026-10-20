require('dotenv').config();
const fs = require('fs');
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
    const sql = fs.readFileSync('fix2.sql', 'utf8');
    
    // First, drop the old function to avoid overload conflicts if signature differs
    try {
        await pool.query('DROP FUNCTION IF EXISTS buy_tickets(UUID, UUID, NUMERIC, INT[]);');
        await pool.query('DROP FUNCTION IF EXISTS buy_tickets(UUID, UUID, NUMERIC, INT[], account_mode);');
    } catch (e) {
        console.log("drop function error:", e.message);
    }
    
    await pool.query(sql);
    console.log('fix2.sql applied successfully!');
  } catch (err) {
    console.error('Error applying sql:', err);
  } finally {
    pool.end();
  }
}

run();
