require('dotenv').config();
const db = require('./src/db');

async function cleanAllPlayersAndReset() {
  console.log('--- STARTING CLEANUP ---');

  const client = await db.pool ? await db.pool.connect() : null;
  // If db exports a pool directly or query wrapper
  const query = (sql, params) => db.query(sql, params);

  try {
    // 1. Truncate gameplay and transaction tables
    console.log('1. Truncating tickets, transactions, rooms, withdrawals, treasury...');
    await query(`
      TRUNCATE TABLE 
        tickets, 
        transactions, 
        platform_treasury, 
        withdrawal_requests, 
        external_deposits, 
        password_reset_codes, 
        user_invites, 
        demo_win_history,
        rooms
      CASCADE;
    `);

    // 2. Reset rooms sequence to 1
    console.log('2. Resetting rooms_room_number_seq to 1...');
    await query(`ALTER SEQUENCE rooms_room_number_seq RESTART WITH 1;`);

    // 3. Remove non-admin wallets
    console.log('3. Deleting non-admin wallets...');
    await query(`
      DELETE FROM wallets 
      WHERE user_id IN (SELECT id FROM users WHERE role != 'admin');
    `);

    // 4. Remove all players
    console.log('4. Deleting all players from users table...');
    const delRes = await query(`
      DELETE FROM users 
      WHERE role != 'admin'
      RETURNING display_name, phone_number;
    `);
    console.log(`Deleted ${delRes.rowCount} players:`, delRes.rows);

    // 5. Reset admin wallets balance to 0 (clean start)
    console.log('5. Resetting admin wallets balance to 0.00...');
    await query(`UPDATE wallets SET balance = 0.00;`);

    // 6. Verify final counts
    console.log('\n--- VERIFICATION OF REMAINING DATA ---');
    const uCount = await query('SELECT count(*) FROM users');
    const wCount = await query('SELECT count(*) FROM wallets');
    const rCount = await query('SELECT count(*) FROM rooms');
    const tCount = await query('SELECT count(*) FROM tickets');
    const txCount = await query('SELECT count(*) FROM transactions');
    const wrCount = await query('SELECT count(*) FROM withdrawal_requests');

    console.log({
      users: uCount.rows[0].count,
      wallets: wCount.rows[0].count,
      rooms: rCount.rows[0].count,
      tickets: tCount.rows[0].count,
      transactions: txCount.rows[0].count,
      withdrawal_requests: wrCount.rows[0].count
    });

    const remainingUsers = await query('SELECT id, display_name, phone_number, role FROM users');
    console.log('\nRemaining (Admin) Users:');
    console.table(remainingUsers.rows);

    console.log('\n✅ Cleanup successfully completed!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error during cleanup:', err);
    process.exit(1);
  }
}

cleanAllPlayersAndReset();
