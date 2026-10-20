const crypto = require('crypto');
const db = require('../backend/src/db');
const pw = crypto.createHash('sha256').update('admin123').digest('hex');
db.query("INSERT INTO users (display_name, phone_number, password_hash, role) VALUES ('Super Admin', '+251900000000', $1, 'admin') ON CONFLICT (phone_number) DO NOTHING", [pw])
  .then(() => { console.log('Admin created'); process.exit(0); })
  .catch(console.error);
