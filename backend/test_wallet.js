const walletLedger = require('./src/walletLedger');
const db = require('./src/db');

async function testWallet() {
  try {
    const userRes = await db.query("SELECT id FROM users LIMIT 1");
    if (userRes.rows.length === 0) return console.log("No users found");
    const userId = userRes.rows[0].id;
    console.log("Testing wallet for user:", userId);

    console.log("Depositing...");
    const depositBalance = await walletLedger.deposit(userId, 500, 'real');
    console.log("Deposit Success, new balance:", depositBalance);

    console.log("Withdrawing...");
    const withdrawBalance = await walletLedger.withdraw(userId, 100, 'real');
    console.log("Withdraw Success, new balance:", withdrawBalance);

  } catch (err) {
    console.error("Wallet Test Error:", err);
  } finally {
    process.exit(0);
  }
}
testWallet();
