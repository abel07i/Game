const db = require('./db');

const DEFAULT_COMMISSION_RATE = 0.01; // 1% default lifetime referral commission
const MIN_COMMISSION_RATE = 0.00;
const MAX_COMMISSION_RATE = 0.50; // Max 50% for safety guardrails

class ReferralManager {
  constructor() {
    this.rateCache = null;
    this.rateCacheTime = 0;
  }

  /**
   * Safe idempotent schema migrations for the lifetime referral commission system.
   */
  async initSchema() {
    try {
      // 1. Extend enums if needed
      await db.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_enum e 
            JOIN pg_type t ON t.oid = e.enumtypid 
            WHERE t.typname = 'account_mode' AND e.enumlabel = 'referral'
          ) THEN
            ALTER TYPE account_mode ADD VALUE 'referral';
          END IF;

          IF NOT EXISTS (
            SELECT 1 FROM pg_enum e 
            JOIN pg_type t ON t.oid = e.enumtypid 
            WHERE t.typname = 'transaction_type' AND e.enumlabel = 'referral_commission'
          ) THEN
            ALTER TYPE transaction_type ADD VALUE 'referral_commission';
          END IF;

          IF NOT EXISTS (
            SELECT 1 FROM pg_enum e 
            JOIN pg_type t ON t.oid = e.enumtypid 
            WHERE t.typname = 'transaction_type' AND e.enumlabel = 'referral_reversal'
          ) THEN
            ALTER TYPE transaction_type ADD VALUE 'referral_reversal';
          END IF;

          IF NOT EXISTS (
            SELECT 1 FROM pg_enum e 
            JOIN pg_type t ON t.oid = e.enumtypid 
            WHERE t.typname = 'transaction_type' AND e.enumlabel = 'referral_payout'
          ) THEN
            ALTER TYPE transaction_type ADD VALUE 'referral_payout';
          END IF;
        END $$;
      `);

      // 2. Add wallet_type to withdrawal_requests for separate referral withdrawal tracking
      await db.query(`
        ALTER TABLE withdrawal_requests 
        ADD COLUMN IF NOT EXISTS wallet_type VARCHAR(20) DEFAULT 'real';
      `);

      // 3. Enhance user_invites with lifetime referral commission tracking columns
      await db.query(`
        ALTER TABLE user_invites 
        ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(6, 4) DEFAULT 0.0100,
        ADD COLUMN IF NOT EXISTS total_commissions_earned NUMERIC(14, 2) DEFAULT 0.00,
        ADD COLUMN IF NOT EXISTS last_commission_at TIMESTAMP WITH TIME ZONE;
      `);

      // 4. Create dedicated referral_commissions audit table
      await db.query(`
        CREATE TABLE IF NOT EXISTS referral_commissions (
          id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          referrer_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          referred_user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          room_id                 UUID REFERENCES rooms(id) ON DELETE SET NULL,
          winning_ticket_id       UUID REFERENCES tickets(id) ON DELETE SET NULL,
          winning_amount          NUMERIC(14, 2) NOT NULL,
          commission_rate         NUMERIC(6, 4) NOT NULL DEFAULT 0.0100,
          commission_amount       NUMERIC(14, 2) NOT NULL,
          status                  VARCHAR(20) NOT NULL DEFAULT 'credited',
          transaction_id          UUID REFERENCES transactions(id) ON DELETE SET NULL,
          reversal_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
          idempotency_key         VARCHAR(128) UNIQUE NOT NULL,
          created_at              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          updated_at              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_ref_comm_referrer ON referral_commissions(referrer_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_ref_comm_referred ON referral_commissions(referred_user_id);
        CREATE INDEX IF NOT EXISTS idx_ref_comm_room ON referral_commissions(room_id);
        CREATE INDEX IF NOT EXISTS idx_ref_comm_status ON referral_commissions(status);
      `);

      // 5. Seed default 1% commission rate in system_config if missing
      await db.query(`
        INSERT INTO system_config (config_key, config_value)
        VALUES ('REFERRAL_COMMISSION_RATE', '0.01')
        ON CONFLICT (config_key) DO NOTHING;
      `);

      console.log('✅ Referral commission system schema initialized successfully.');
    } catch (err) {
      console.error('❌ Failed to initialize referral commission schema:', err);
      throw err;
    }
  }

  /**
   * Fetches the active referral commission rate (configurable by administrators in system_config).
   */
  async getCommissionRate(fresh = false) {
    const now = Date.now();
    if (!fresh && this.rateCache !== null && (now - this.rateCacheTime < 30000)) {
      return this.rateCache;
    }

    try {
      const res = await db.query(
        `SELECT config_value FROM system_config WHERE config_key = 'REFERRAL_COMMISSION_RATE' LIMIT 1`
      );
      if (res.rows.length > 0) {
        const val = parseFloat(res.rows[0].config_value);
        if (Number.isFinite(val) && val >= MIN_COMMISSION_RATE && val <= MAX_COMMISSION_RATE) {
          this.rateCache = val;
          this.rateCacheTime = now;
          return val;
        }
      }
    } catch (e) {
      console.warn('Could not read REFERRAL_COMMISSION_RATE from DB, using default:', e.message);
    }

    this.rateCache = DEFAULT_COMMISSION_RATE;
    this.rateCacheTime = now;
    return DEFAULT_COMMISSION_RATE;
  }

  /**
   * Updates the global referral commission rate (admin only).
   */
  async setCommissionRate(rate) {
    const num = Number(rate);
    if (!Number.isFinite(num) || num < MIN_COMMISSION_RATE || num > MAX_COMMISSION_RATE) {
      throw new Error(`Referral commission rate must be between ${MIN_COMMISSION_RATE * 100}% and ${MAX_COMMISSION_RATE * 100}%.`);
    }

    await db.query(
      `INSERT INTO system_config (config_key, config_value)
       VALUES ('REFERRAL_COMMISSION_RATE', $1)
       ON CONFLICT (config_key) DO UPDATE SET config_value = EXCLUDED.config_value`,
      [num.toFixed(4)]
    );

    this.rateCache = num;
    this.rateCacheTime = Date.now();
    return num;
  }

  /**
   * Atomically ensures the user has a separate referral wallet.
   */
  async ensureReferralWallet(clientOrDb, userId) {
    const exec = clientOrDb || db;
    const res = await exec.query(
      `INSERT INTO wallets (user_id, mode, balance, total_deposited, total_withdrawn, total_won)
       VALUES ($1, 'referral', 0.00, 0.00, 0.00, 0.00)
       ON CONFLICT (user_id, mode) DO UPDATE SET updated_at = NOW()
       RETURNING id, balance, total_withdrawn, total_won`,
      [userId]
    );
    return res.rows[0];
  }

  /**
   * Automatically calculates and awards 1% lifetime commission when a referred player wins.
   *
   * Rules:
   * 1. Lifetime association: checks user_invites for permanent referrer_id.
   * 2. Self-referrals and circular referrals are strictly skipped.
   * 3. Referrer must be an active real player (no deactivated users or bots).
   * 4. Calculated as exactly 1% (or active configured rate) of net winner payout.
   * 5. The referred player receives their full winnings in full — commission is paid by platform.
   * 6. Completely idempotent using unique idempotency_key.
   * 7. Real-time Socket.IO notification to referrer.
   */
  async processWinningSettlementCommission({ client, roomId, winnerTicketId, winnerUserId, netPayout, roomNumber, io }) {
    if (!client) throw new Error('processWinningSettlementCommission requires a transactional client');
    const payoutNum = parseFloat(netPayout);
    if (!Number.isFinite(payoutNum) || payoutNum <= 0) return null;

    // 1. Check if the winner was invited by a referrer (lifetime relationship)
    const invRes = await client.query(
      `SELECT ui.referrer_id, 
              u.display_name AS winner_name, 
              u.phone_number AS winner_phone,
              ref.is_active AS referrer_active, 
              ref.role AS referrer_role, 
              ref.display_name AS referrer_name
       FROM user_invites ui
       JOIN users u ON u.id = ui.user_id
       JOIN users ref ON ref.id = ui.referrer_id
       WHERE ui.user_id = $1
       LIMIT 1`,
      [winnerUserId]
    );

    if (invRes.rows.length === 0) {
      return null; // Not referred by anyone
    }

    const { referrer_id, winner_name, referrer_active, referrer_role, referrer_name } = invRes.rows[0];

    // 2. Anti-fraud & eligibility checks
    if (!referrer_id || referrer_id === winnerUserId) {
      console.warn(`[Referral] Skipped self-referral commission for user ${winnerUserId}`);
      return null;
    }
    if (referrer_active === false || referrer_role !== 'player') {
      console.warn(`[Referral] Skipped commission: Referrer ${referrer_id} is inactive or non-player`);
      return null;
    }

    // 3. Determine commission amount (1% default or admin-configured)
    const commissionRate = await this.getCommissionRate();
    const commissionAmount = Math.round(payoutNum * commissionRate * 100) / 100;
    if (commissionAmount <= 0) {
      return null;
    }

    // 4. Idempotency Key check: ref_comm:<roomId>:<ticketId>:<referrerId>
    const idempotencyKey = `ref_comm:${roomId}:${winnerTicketId}:${referrer_id}`;
    const dupCheck = await client.query(
      `SELECT id, commission_amount FROM referral_commissions WHERE idempotency_key = $1`,
      [idempotencyKey]
    );
    if (dupCheck.rows.length > 0) {
      console.log(`[Referral] Commission already processed for idempotency key ${idempotencyKey}`);
      return dupCheck.rows[0];
    }

    // 5. Ensure & lock referrer's referral wallet
    await this.ensureReferralWallet(client, referrer_id);
    const walRes = await client.query(
      `SELECT id, balance, total_won FROM wallets WHERE user_id = $1 AND mode = 'referral' FOR UPDATE`,
      [referrer_id]
    );
    if (walRes.rows.length === 0) {
      throw new Error('Referral wallet could not be locked');
    }

    const refWallet = walRes.rows[0];
    const prevBalance = parseFloat(refWallet.balance);
    const newBalance = Math.round((prevBalance + commissionAmount) * 100) / 100;

    // 6. Credit referral wallet
    await client.query(
      `UPDATE wallets 
       SET balance = $1, 
           total_won = total_won + $2, 
           updated_at = NOW() 
       WHERE id = $3`,
      [newBalance, commissionAmount, refWallet.id]
    );

    // 7. Append immutable transaction to double-entry financial ledger
    const txNote = `${(commissionRate * 100).toFixed(1)}% Referral commission (${commissionAmount} ETB) from ${winner_name} winning Game #${roomNumber} (Payout: ${payoutNum} ETB)`;
    const txRes = await client.query(
      `INSERT INTO transactions 
         (wallet_id, room_id, ticket_id, tx_type, amount, direction, running_balance, reference_note, idempotency_key)
       VALUES 
         ($1, $2, $3, 'referral_commission', $4, 1, $5, $6, $7)
       RETURNING id`,
      [refWallet.id, roomId, winnerTicketId, commissionAmount, newBalance, txNote, idempotencyKey]
    );
    const txId = txRes.rows[0].id;

    // 8. Record in dedicated referral_commissions table
    const commRes = await client.query(
      `INSERT INTO referral_commissions
         (referrer_id, referred_user_id, room_id, winning_ticket_id, winning_amount, 
          commission_rate, commission_amount, status, transaction_id, idempotency_key)
       VALUES 
         ($1, $2, $3, $4, $5, $6, $7, 'credited', $8, $9)
       RETURNING *`,
      [referrer_id, winnerUserId, roomId, winnerTicketId, payoutNum, commissionRate, commissionAmount, txId, idempotencyKey]
    );

    // 9. Update summary statistics on user_invites
    await client.query(
      `UPDATE user_invites 
       SET total_commissions_earned = COALESCE(total_commissions_earned, 0) + $1,
           last_commission_at = NOW(),
           commission_rate = $2
       WHERE user_id = $3 AND referrer_id = $4`,
      [commissionAmount, commissionRate, winnerUserId, referrer_id]
    );

    const commissionRecord = commRes.rows[0];
    console.log(`💰 [Referral Commission] Credited ${commissionAmount} ETB to ${referrer_name} (${referrer_id}) from ${winner_name}'s win in Game #${roomNumber}`);

    // 10. Emit real-time notification to the inviter
    if (io) {
      const payload = {
        type: 'referral_commission',
        commissionId: commissionRecord.id,
        amount: commissionAmount,
        ratePercent: Math.round(commissionRate * 1000) / 10,
        referredPlayerName: winner_name,
        winningAmount: payoutNum,
        roomNumber,
        newReferralBalance: newBalance,
        timestamp: new Date().toISOString()
      };
      // Send directly to inviter's private user room
      io.to(`user_${referrer_id}`).emit('referral:commission_earned', payload);
      // Also broadcast general activity notification if desired
      io.emit('feed:referral_win', {
        referrerName: referrer_name,
        referredPlayerName: winner_name,
        commissionAmount,
        roomNumber
      });
    }

    return commissionRecord;
  }

  /**
   * Automatically reverses any referral commissions if a winning game room is cancelled, refunded, or reversed.
   */
  async reverseCommissionsForRoom({ client, roomId, roomNumber, reason = 'Room refunded/cancelled', io }) {
    const exec = client || db;

    // Find all credited commissions for this room
    const commRes = await exec.query(
      `SELECT rc.*, u.display_name AS referrer_name
       FROM referral_commissions rc
       JOIN users u ON u.id = rc.referrer_id
       WHERE rc.room_id = $1 AND rc.status = 'credited'
       FOR UPDATE`,
      [roomId]
    );

    if (commRes.rows.length === 0) {
      return { reversedCount: 0, totalReversed: 0 };
    }

    let reversedCount = 0;
    let totalReversed = 0;

    for (const comm of commRes.rows) {
      const revAmount = parseFloat(comm.commission_amount);
      const revKey = `ref_rev:${comm.id}`;

      // Check if already reversed
      if (comm.status === 'reversed') continue;

      // Lock referrer's referral wallet
      const walRes = await exec.query(
        `SELECT id, balance, total_won FROM wallets WHERE user_id = $1 AND mode = 'referral' FOR UPDATE`,
        [comm.referrer_id]
      );

      if (walRes.rows.length > 0) {
        const wal = walRes.rows[0];
        const prevBal = parseFloat(wal.balance);
        const newBal = Math.max(0, Math.round((prevBal - revAmount) * 100) / 100);

        // Update wallet
        await exec.query(
          `UPDATE wallets 
           SET balance = $1, 
               total_won = GREATEST(0, total_won - $2), 
               updated_at = NOW() 
           WHERE id = $3`,
          [newBal, revAmount, wal.id]
        );

        // Record reversal transaction
        const revNote = `Reversal of referral commission for Game #${roomNumber || comm.room_id}: ${reason}`;
        const txRes = await exec.query(
          `INSERT INTO transactions 
             (wallet_id, room_id, ticket_id, tx_type, amount, direction, running_balance, reference_note, idempotency_key)
           VALUES 
             ($1, $2, $3, 'referral_reversal', $4, -1, $5, $6, $7)
           RETURNING id`,
          [wal.id, comm.room_id, comm.winning_ticket_id, revAmount, newBal, revNote, revKey]
        );
        const revTxId = txRes.rows[0]?.id;

        // Update commission record
        await exec.query(
          `UPDATE referral_commissions 
           SET status = 'reversed', 
               reversal_transaction_id = $1, 
               updated_at = NOW() 
           WHERE id = $2`,
          [revTxId, comm.id]
        );

        // Adjust stats in user_invites
        await exec.query(
          `UPDATE user_invites 
           SET total_commissions_earned = GREATEST(0, COALESCE(total_commissions_earned, 0) - $1)
           WHERE user_id = $2 AND referrer_id = $3`,
          [revAmount, comm.referred_user_id, comm.referrer_id]
        );

        reversedCount++;
        totalReversed += revAmount;

        if (io) {
          io.to(`user_${comm.referrer_id}`).emit('referral:commission_reversed', {
            commissionId: comm.id,
            amount: revAmount,
            roomNumber,
            reason,
            newReferralBalance: newBal
          });
        }
      }
    }

    console.log(`🔄 [Referral Reversal] Reversed ${reversedCount} commissions (${totalReversed.toFixed(2)} ETB) for room ${roomId}`);
    return { reversedCount, totalReversed };
  }

  /**
   * Retrieves player's complete lifetime referral dashboard data.
   */
  async getReferralDashboard(userId) {
    // 1. Fetch user & ensure referral wallet
    const userRes = await db.query(
      `SELECT id, display_name, phone_number, invite_code FROM users WHERE id = $1`,
      [userId]
    );
    if (userRes.rows.length === 0) throw new Error('User not found');
    const user = userRes.rows[0];

    const refWallet = await this.ensureReferralWallet(db, userId);
    const commissionRate = await this.getCommissionRate();

    // 2. Aggregate statistics (clean scalar subqueries prevent cartesian multiplication)
    const [statsRes, invitedRes, commHistRes, wdrRes] = await Promise.all([
      db.query(`
        SELECT 
          (SELECT COUNT(*)::int FROM user_invites WHERE referrer_id = $1) AS total_invited,
          (SELECT COUNT(DISTINCT ui.user_id)::int FROM user_invites ui JOIN tickets t ON t.user_id = ui.user_id WHERE ui.referrer_id = $1) AS active_players,
          (SELECT COALESCE(SUM(commission_amount), 0)::float FROM referral_commissions WHERE referrer_id = $1 AND status = 'credited') AS total_commissions_earned,
          (SELECT COUNT(*)::int FROM referral_commissions WHERE referrer_id = $1 AND status = 'credited') AS total_commissions_count,
          (SELECT COUNT(DISTINCT winning_ticket_id)::int FROM referral_commissions WHERE referrer_id = $1 AND status = 'credited') AS total_games_won_by_referred
      `, [userId]),

      db.query(`
        SELECT 
          u.id AS user_id,
          u.display_name,
          CONCAT(SUBSTRING(u.phone_number FROM 1 FOR 4), '****', SUBSTRING(u.phone_number FROM 9)) AS masked_phone,
          ui.created_at AS joined_at,
          COALESCE(ui.total_commissions_earned, 0)::float AS commissions_generated,
          COUNT(DISTINCT t.room_id)::int AS games_played,
          COUNT(t.id) FILTER (WHERE t.is_winner = TRUE)::int AS games_won
        FROM user_invites ui
        JOIN users u ON u.id = ui.user_id
        LEFT JOIN tickets t ON t.user_id = u.id AND t.is_refunded = FALSE
        WHERE ui.referrer_id = $1
        GROUP BY u.id, u.display_name, u.phone_number, ui.created_at, ui.total_commissions_earned
        ORDER BY ui.created_at DESC
        LIMIT 50
      `, [userId]),

      db.query(`
        SELECT 
          rc.id,
          rc.created_at,
          rc.winning_amount::float AS winning_amount,
          rc.commission_rate::float AS commission_rate,
          rc.commission_amount::float AS commission_amount,
          rc.status,
          r.room_number,
          r.tier,
          u.display_name AS referred_player_name
        FROM referral_commissions rc
        JOIN users u ON u.id = rc.referred_user_id
        LEFT JOIN rooms r ON r.id = rc.room_id
        WHERE rc.referrer_id = $1
        ORDER BY rc.created_at DESC
        LIMIT 50
      `, [userId]),

      db.query(`
        SELECT 
          id, 
          amount::float AS amount, 
          phone_number, 
          payment_method, 
          status, 
          notes, 
          created_at, 
          updated_at
        FROM withdrawal_requests
        WHERE user_id = $1 AND wallet_type = 'referral'
        ORDER BY created_at DESC
        LIMIT 20
      `, [userId])
    ]);

    const stats = statsRes.rows[0] || {};
    const ownCode = (user.invite_code || `EQUB-${String(user.id).slice(0, 6)}`).toUpperCase();

    return {
      ownInviteCode: ownCode,
      referralLink: `/?ref=${ownCode}`,
      commissionRate,
      commissionRatePercent: Math.round(commissionRate * 1000) / 10,
      referralWallet: {
        id: refWallet.id,
        balance: parseFloat(refWallet.balance || 0),
        totalWithdrawn: parseFloat(refWallet.total_withdrawn || 0),
        totalWon: parseFloat(refWallet.total_won || 0)
      },
      stats: {
        totalInvited: stats.total_invited || 0,
        activePlayers: stats.active_players || 0,
        totalCommissionsEarned: stats.total_commissions_earned || 0,
        totalCommissionsCount: stats.total_commissions_count || 0,
        totalGamesWonByReferred: stats.total_games_won_by_referred || 0
      },
      invitedPlayers: invitedRes.rows,
      commissionHistory: commHistRes.rows,
      referralWithdrawals: wdrRes.rows
    };
  }

  /**
   * Dedicated withdrawal strictly from player's referral wallet.
   */
  async withdrawReferralWallet({ userId, amount, phoneNumber, paymentMethod = 'telebirr', accountHolderName }) {
    const rawAmount = Number(amount);
    const withdrawAmount = Math.round(rawAmount * 100) / 100;
    if (!Number.isFinite(withdrawAmount) || withdrawAmount <= 0) {
      throw new Error('Please enter a valid withdrawal amount.');
    }

    // 1. Fetch system limits
    const configRes = await db.query(
      `SELECT config_key, config_value FROM system_config 
       WHERE config_key IN ('MIN_WITHDRAWAL_AMOUNT', 'MAX_WITHDRAWAL_AMOUNT', 'MAX_PENDING_WITHDRAWALS')`
    );
    const configMap = {};
    configRes.rows.forEach(r => configMap[r.config_key] = parseFloat(r.config_value));

    const minAmount = configMap['MIN_WITHDRAWAL_AMOUNT'] || 500;
    const maxAmount = configMap['MAX_WITHDRAWAL_AMOUNT'] || 50000;
    const maxPending = configMap['MAX_PENDING_WITHDRAWALS'] || 1;

    if (withdrawAmount < minAmount) {
      throw new Error(`Minimum withdrawal amount is ${minAmount} ETB.`);
    }
    if (withdrawAmount > maxAmount) {
      throw new Error(`Maximum withdrawal per request is ${maxAmount.toLocaleString()} ETB.`);
    }

    // 2. Lookup user & validate phone
    const userRes = await db.query(`SELECT phone_number, display_name, is_active FROM users WHERE id = $1`, [userId]);
    if (userRes.rows.length === 0 || userRes.rows[0].is_active === false) {
      throw new Error('Account inactive or not found.');
    }

    const payPhone = (typeof phoneNumber === 'string' && phoneNumber.trim()) 
      ? phoneNumber.trim() 
      : (userRes.rows[0].phone_number || '').trim();
    if (!payPhone || payPhone.length < 9 || payPhone.length > 20) {
      throw new Error('A valid phone number is required for payout.');
    }

    const client = await db.getClient();
    try {
      await client.query('BEGIN');

      // 3. Ensure & lock referral wallet
      await this.ensureReferralWallet(client, userId);
      const walRes = await client.query(
        `SELECT id, balance, total_withdrawn FROM wallets WHERE user_id = $1 AND mode = 'referral' FOR UPDATE`,
        [userId]
      );
      if (walRes.rows.length === 0) {
        throw new Error('Referral wallet not found.');
      }

      const wallet = walRes.rows[0];
      const currentBalance = parseFloat(wallet.balance);

      // 4. Enforce pending limit inside lock
      const pendingRes = await client.query(
        `SELECT COUNT(*) FROM withdrawal_requests WHERE user_id = $1 AND wallet_type = 'referral' AND status = 'pending'`,
        [userId]
      );
      if (parseInt(pendingRes.rows[0].count, 10) >= maxPending) {
        throw new Error('You already have a pending referral withdrawal request. Please wait for it to be processed.');
      }

      if (currentBalance < withdrawAmount) {
        throw new Error(`Insufficient referral balance. Current balance is ${currentBalance.toFixed(2)} ETB.`);
      }

      const newBalance = Math.round((currentBalance - withdrawAmount) * 100) / 100;

      // 5. Deduct from referral wallet
      await client.query(
        `UPDATE wallets 
         SET balance = $1, 
             total_withdrawn = total_withdrawn + $2, 
             updated_at = NOW() 
         WHERE id = $3`,
        [newBalance, withdrawAmount, wallet.id]
      );

      // 6. Record in transactions ledger
      const note = `Referral commission withdrawal to ${payPhone} via ${paymentMethod} (Pending Admin Review)`;
      const txRes = await client.query(
        `INSERT INTO transactions 
           (wallet_id, tx_type, amount, direction, running_balance, reference_note)
         VALUES 
           ($1, 'withdrawal', $2, -1, $3, $4)
         RETURNING id`,
        [wallet.id, withdrawAmount, newBalance, note]
      );
      const txId = txRes.rows[0].id;

      // 7. Insert into withdrawal_requests with wallet_type = 'referral'
      const wdrRes = await client.query(
        `INSERT INTO withdrawal_requests 
           (user_id, amount, phone_number, status, payment_method, account_holder_name, wallet_type, transaction_id)
         VALUES 
           ($1, $2, $3, 'pending', $4, $5, 'referral', $6)
         RETURNING *`,
        [userId, withdrawAmount, payPhone, paymentMethod, accountHolderName || null, txId]
      );

      await client.query('COMMIT');
      return {
        success: true,
        withdrawal: wdrRes.rows[0],
        newReferralBalance: newBalance
      };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Admin: Overview statistics for referral commissions across the platform.
   */
  async getAdminStats() {
    const commissionRate = await this.getCommissionRate(true);
    const res = await db.query(`
      SELECT 
        (SELECT COUNT(*)::int FROM user_invites) AS total_referred_players,
        (SELECT COUNT(DISTINCT referrer_id)::int FROM user_invites) AS total_referrers,
        (SELECT COALESCE(SUM(commission_amount), 0)::float FROM referral_commissions WHERE status = 'credited') AS total_commissions_paid,
        (SELECT COUNT(*)::int FROM referral_commissions WHERE status = 'credited') AS total_commissions_count,
        (SELECT COALESCE(SUM(commission_amount), 0)::float FROM referral_commissions WHERE status = 'reversed') AS total_commissions_reversed,
        (SELECT COALESCE(SUM(balance), 0)::float FROM wallets WHERE mode = 'referral') AS total_unclaimed_referral_balance
    `);

    return {
      commissionRate,
      commissionRatePercent: Math.round(commissionRate * 1000) / 10,
      ...(res.rows[0] || {})
    };
  }

  /**
   * Admin: Paginated list of referral commissions with filtering.
   */
  async getAdminCommissions({ page = 1, limit = 20, status, search, dateFrom, dateTo } = {}) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    const conditions = [];
    const params = [];

    if (status && status !== 'all') {
      params.push(status);
      conditions.push(`rc.status = $${params.length}`);
    }

    if (search && search.trim()) {
      params.push(`%${search.trim()}%`);
      conditions.push(`(
        ref.display_name ILIKE $${params.length} OR 
        ref.phone_number ILIKE $${params.length} OR 
        u.display_name ILIKE $${params.length} OR 
        u.phone_number ILIKE $${params.length}
      )`);
    }

    if (dateFrom) {
      params.push(dateFrom);
      conditions.push(`rc.created_at >= $${params.length}::timestamp`);
    }
    if (dateTo) {
      params.push(`${dateTo} 23:59:59.999`);
      conditions.push(`rc.created_at <= $${params.length}::timestamp`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRes = await db.query(
      `SELECT COUNT(*)::int AS total 
       FROM referral_commissions rc
       JOIN users ref ON ref.id = rc.referrer_id
       JOIN users u ON u.id = rc.referred_user_id
       ${whereClause}`,
      params
    );

    const total = countRes.rows[0]?.total || 0;

    const dataParams = [...params, limitNum, offset];
    const dataRes = await db.query(
      `SELECT 
         rc.id,
         rc.created_at,
         rc.winning_amount::float AS winning_amount,
         rc.commission_rate::float AS commission_rate,
         rc.commission_amount::float AS commission_amount,
         rc.status,
         rc.idempotency_key,
         r.room_number,
         r.tier,
         ref.id AS referrer_id,
         ref.display_name AS referrer_name,
         ref.phone_number AS referrer_phone,
         u.id AS referred_user_id,
         u.display_name AS referred_name,
         u.phone_number AS referred_phone
       FROM referral_commissions rc
       JOIN users ref ON ref.id = rc.referrer_id
       JOIN users u ON u.id = rc.referred_user_id
       LEFT JOIN rooms r ON r.id = rc.room_id
       ${whereClause}
       ORDER BY rc.created_at DESC
       LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
      dataParams
    );

    return {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
      commissions: dataRes.rows
    };
  }

  /**
   * Admin: Top referrers leaderboard across platform.
   */
  async getAdminTopReferrers(limit = 10) {
    const res = await db.query(`
      SELECT 
        u.id AS referrer_id,
        u.display_name,
        u.phone_number,
        u.invite_code,
        (SELECT COUNT(*)::int FROM user_invites WHERE referrer_id = u.id) AS total_invited,
        (SELECT COUNT(DISTINCT ui.user_id)::int FROM user_invites ui JOIN tickets t ON t.user_id = ui.user_id WHERE ui.referrer_id = u.id) AS active_players,
        (SELECT COALESCE(SUM(commission_amount), 0)::float FROM referral_commissions WHERE referrer_id = u.id AND status = 'credited') AS total_earned,
        (SELECT COALESCE(balance, 0)::float FROM wallets WHERE user_id = u.id AND mode = 'referral') AS current_referral_balance
      FROM users u
      WHERE u.role = 'player' AND EXISTS (SELECT 1 FROM user_invites WHERE referrer_id = u.id)
      ORDER BY total_earned DESC, total_invited DESC
      LIMIT $1
    `, [Math.min(50, Math.max(1, limit))]);

    return res.rows;
  }
}

const referralManager = new ReferralManager();
module.exports = referralManager;
