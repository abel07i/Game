const db = require('./src/db');
async function setup() {
  try {
    await db.query(`CREATE TABLE IF NOT EXISTS system_config (
      config_key VARCHAR(100) PRIMARY KEY,
      config_value TEXT
    )`);
    console.log('Table created');

    const queries = [
      ['TELEBIRR_PHONE', '0949626463'],
      ['TELEBIRR_NAME', 'Abel Wondmeneh'],
      ['VERIFY_ET_API_KEY', process.env.VERIFY_ET_API_KEY || '']
    ];

    for (const [k, v] of queries) {
      await db.query(
        'INSERT INTO system_config (config_key, config_value) VALUES ($1, $2) ON CONFLICT (config_key) DO UPDATE SET config_value = EXCLUDED.config_value',
        [k, v]
      );
    }
    console.log('Inserted config values');
  } catch (err) {
    console.error(err);
  } finally {
    process.exit();
  }
}
setup();
