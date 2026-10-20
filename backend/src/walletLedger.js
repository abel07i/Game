const db = require('./db');

class WalletLedger {

  async deposit(userId, amount, mode = 'real') {
    const res = await db.query(
      'SELECT * FROM fn_wallet_deposit($1, $2, $3)',
      [userId, parseFloat(amount), mode]
    );
    if (!res.rows[0].success) {
      throw new Error('Deposit failed');
    }
    return parseFloat(res.rows[0].new_balance);
  }

  async depositTelebirr(userId, transactionId, amount, mode = 'real') {
    // 1. Mark transaction as used FIRST to strictly prevent double-spending race conditions.
    try {
      await db.query(
        "INSERT INTO external_deposits (transaction_id, user_id, amount) VALUES ($1, $2, $3)",
        [transactionId, userId, amount]
      );
    } catch (err) {
      // 23505 is the PostgreSQL error code for unique_violation
      if (err.code === '23505') { 
        throw new Error('This Telebirr transaction has already been used.');
      }
      throw err;
    }

    // 2. Perform the deposit
    try {
      const balance = await this.deposit(userId, amount, mode);
      return balance;
    } catch (err) {
      // Rollback the lock if the actual deposit failed internally
      await db.query("DELETE FROM external_deposits WHERE transaction_id = $1", [transactionId]);
      throw err;
    }
  }

  async withdraw(userId, amount, mode = 'real') {
    const res = await db.query(
      'SELECT * FROM fn_wallet_withdraw($1, $2, $3)',
      [userId, parseFloat(amount), mode]
    );
    if (!res.rows[0].success) {
      throw new Error(res.rows[0].error_message || 'Insufficient balance');
    }
    return parseFloat(res.rows[0].new_balance);
  }

  async refund(userId, amount, note = 'Wallet refund', mode = 'real', idempotencyKey = null) {
    const res = await db.query(
      'SELECT * FROM fn_wallet_refund($1, $2, $3, $4, $5)',
      [userId, parseFloat(amount), mode, note, idempotencyKey]
    );
    if (!res.rows[0].success) {
      throw new Error('Refund failed: wallet not found or operation error');
    }
    return parseFloat(res.rows[0].new_balance);
  }

  // Alias helpers — all route through the same atomic stored procs
  async credit(userId, amount, mode = 'real') {
    return this.deposit(userId, amount, mode);
  }

  async debit(userId, amount, mode = 'real') {
    return this.withdraw(userId, amount, mode);
  }

  async getBalance(userId, mode = 'real') {
    const res = await db.query(
      'SELECT balance FROM wallets WHERE user_id = $1 AND mode = $2',
      [userId, mode]
    );
    if (res.rowCount === 0) {
      // Auto-create wallet with 0 balance via deposit of 0
      await db.query(
        'INSERT INTO wallets (user_id, mode, balance) VALUES ($1, $2, 0) ON CONFLICT (user_id, mode) DO NOTHING',
        [userId, mode]
      );
      return 0;
    }
    return parseFloat(res.rows[0].balance);
  }

  async getHistory(userId, mode = 'real') {
    const res = await db.query(`
      SELECT
        t.tx_type      AS type,
        t.direction,
        t.amount,
        t.running_balance AS balance,
        t.reference_note  AS note,
        t.created_at      AS date
      FROM transactions t
      JOIN wallets w ON w.id = t.wallet_id
      WHERE w.user_id = $1 AND w.mode = $2
      ORDER BY t.created_at DESC
      LIMIT 50
    `, [userId, mode]);

    return res.rows.map(r => ({
      type:      r.type,
      direction: r.direction,
      amount:    parseFloat(r.amount),
      balance:   parseFloat(r.balance),
      note:      r.note,
      date:      r.date
    }));
  }
}

const ledger = new WalletLedger();
module.exports = ledger;
