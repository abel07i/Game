const { Pool } = require('pg');
require('dotenv').config(); // Loads variables from .env

// Create a new connection pool using environment variables
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'fastderash',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  max: process.env.DB_POOL_MAX || 10, // Max number of connections in the pool
  idleTimeoutMillis: 30000,
});

// Test the connection
pool.on('connect', () => {
  console.log('📦 Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected error on idle database client', err);
  process.exit(-1);
});

module.exports = {
  // Use this for single queries
  query: (text, params) => pool.query(text, params),
  
  // Use this when you need a dedicated client for transactions (BEGIN, COMMIT, ROLLBACK)
  getClient: () => pool.connect(),
  
  // The raw pool instance if needed
  pool
};
