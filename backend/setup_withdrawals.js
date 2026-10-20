const db = require('./src/db');
async function run() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS withdrawal_requests (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID REFERENCES users(id) NOT NULL,
          amount NUMERIC(14,2) NOT NULL,
          phone_number VARCHAR(50) NOT NULL,
          status VARCHAR(20) DEFAULT 'pending', 
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          admin_id UUID REFERENCES users(id),
          notes TEXT
      );
    `);
    console.log("Table created");
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
run();
