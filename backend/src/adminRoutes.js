const express = require('express');
const router = express.Router();
const db = require('./db');
const { hashPassword, verifyPassword, generateToken, adminMiddleware } = require('./adminAuth');
const { isValidUuid, createRateLimiter } = require('./security');

const adminLoginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: (req) => `${req.ip}:adminlogin:${String(req.body?.phoneNumber || '').trim()}`,
  message: 'Too many admin login attempts. Please wait 15 minutes.'
});

const txMutationLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 15,
  keyGenerator: (req) => `${req.ip}:${req.admin?.id || 'anon'}:txdel`,
  message: 'Too many transaction modification attempts. Please wait 15 minutes.'
});

const withdrawalMutationLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 15,
  keyGenerator: (req) => `${req.ip}:${req.admin?.id || 'anon'}:wdr`,
  message: 'Too many withdrawal modification attempts. Please wait 15 minutes.'
});

const adminReadLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 120,
  keyGenerator: (req) => `${req.ip}:${req.admin?.id || 'anon'}:adminread`,
  message: 'Too many admin requests. Please slow down.'
});

const ALLOWED_TX_TYPES = new Set([
  'deposit', 'withdrawal', 'ticket_buy', 'payout_win',
  'platform_tax', 'refund', 'demo_credit', 'adjustment'
]);
const ALLOWED_TX_STATUSES = new Set(['pending', 'completed', 'failed', 'reversed']);
const ALLOWED_WITHDRAWAL_STATUSES = new Set(['pending', 'approved', 'rejected', 'cancelled']);
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_BULK_ITEMS = 100;

function validateUuidArray(ids, label = 'IDs') {
  if (!Array.isArray(ids) || ids.length === 0) {
    return { ok: false, error: `Please provide an array of ${label}.` };
  }
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length > MAX_BULK_ITEMS) {
    return { ok: false, error: `Bulk action is capped at ${MAX_BULK_ITEMS} records per request.` };
  }
  if (!uniqueIds.every(isValidUuid)) {
    return { ok: false, error: `All ${label} must be valid UUIDs.` };
  }
  return { ok: true, uniqueIds };
}

async function verifyAdminActionPassword(adminId, confirmPassword) {
  if (typeof confirmPassword !== 'string' || confirmPassword.length === 0) {
    return { ok: false, status: 400, error: 'Admin password confirmation is required' };
  }
  const res = await db.query(
    `SELECT id, display_name, password_hash, is_active FROM users WHERE id = $1 AND role = 'admin'`,
    [adminId]
  );
  if (res.rows.length === 0 || res.rows[0].is_active === false) {
    return { ok: false, status: 403, error: 'Admin account is inactive or unauthorized' };
  }
  const matched = await verifyPassword(confirmPassword, res.rows[0].password_hash);
  if (!matched) {
    return { ok: false, status: 403, error: 'Incorrect admin password confirmation' };
  }
  return { ok: true, adminName: res.rows[0].display_name || null };
}

async function recordAdminAudit(client, { adminId, adminUsername, action, targetType, targetIds, snapshot, req }) {
  const ip = String(req.ip || '').slice(0, 64) || null;
  const ua = String(req.headers['user-agent'] || '').slice(0, 500) || null;
  await client.query(
    `INSERT INTO admin_audit_logs
       (admin_id, admin_username, action, target_type, target_ids, snapshot, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5::text[], $6::jsonb, $7, $8)`,
    [adminId, adminUsername, action, targetType, targetIds, JSON.stringify(snapshot), ip, ua]
  );
}

async function deleteTransactionsWithAudit({ client, ids, action, adminId, adminUsername, req }) {
  const locked = await client.query(
    `SELECT t.id, t.wallet_id, t.tx_type, t.amount, t.direction, t.status,
            t.reference_note, t.created_at, w.user_id
     FROM transactions t
     LEFT JOIN wallets w ON w.id = t.wallet_id
     WHERE t.id = ANY($1::uuid[])
     FOR UPDATE OF t`,
    [ids]
  );
  if (locked.rows.length === 0) {
    return [];
  }

  const targetIds = locked.rows.map(r => r.id);
  await recordAdminAudit(client, {
    adminId,
    adminUsername,
    action,
    targetType: 'transaction',
    targetIds,
    snapshot: locked.rows,
    req
  });

  await client.query("SET LOCAL app.allow_tx_delete = 'true'");
  const delRes = await client.query(
    'DELETE FROM transactions WHERE id = ANY($1::uuid[]) RETURNING id',
    [targetIds]
  );
  return delRes.rows.map(r => r.id);
}

async function applyWithdrawalDecisions({ client, items, status, adminId, adminUsername, action, trimmedNotes, req }) {
  for (const reqItem of items) {
    if (status === 'rejected') {
      const refundAmount = parseFloat(reqItem.amount);
      if (!Number.isFinite(refundAmount) || refundAmount <= 0) {
        throw new Error('Invalid withdrawal refund amount');
      }
      const refundNote = trimmedNotes ? `Withdrawal rejected: ${trimmedNotes}` : 'Withdrawal rejected/refunded by Admin';
      const refundRes = await client.query(
        `SELECT * FROM fn_wallet_refund($1, $2, 'real', $3)`,
        [reqItem.user_id, refundAmount, refundNote]
      );
      if (!refundRes.rows[0]?.success) {
        throw new Error('Failed to refund user balance');
      }
    } else if (status === 'approved' && reqItem.transaction_id) {
      const payoutNote = trimmedNotes ? `Withdrawal paid via Telebirr (${trimmedNotes})` : 'Withdrawal paid via Telebirr';
      await client.query(
        `UPDATE transactions SET reference_note = $1, status = 'completed' WHERE id = $2`,
        [payoutNote, reqItem.transaction_id]
      );
    }
  }

  const processedIds = items.map(r => r.id);
  const snapshot = items.map(r => ({ ...r, decision: status, decision_notes: trimmedNotes || null }));
  await recordAdminAudit(client, {
    adminId,
    adminUsername,
    action,
    targetType: 'withdrawal',
    targetIds: processedIds,
    snapshot,
    req
  });

  await client.query(
    `UPDATE withdrawal_requests
     SET status = $1, admin_id = $2, notes = $3, updated_at = NOW()
     WHERE id = ANY($4::uuid[])`,
    [status, adminId, trimmedNotes || null, processedIds]
  );
  return processedIds;
}

async function deleteWithdrawalsWithAudit({ client, ids, refundPending, adminId, adminUsername, action, req }) {
  const locked = await client.query(
    `SELECT * FROM withdrawal_requests WHERE id = ANY($1::uuid[]) FOR UPDATE`,
    [ids]
  );
  if (locked.rows.length === 0) {
    return { ok: false, status: 404, error: 'Withdrawal request not found' };
  }

  const pendingList = locked.rows.filter(r => r.status === 'pending');
  if (pendingList.length > 0 && !refundPending) {
    return {
      ok: false,
      status: 400,
      error: pendingList.length === 1 && ids.length === 1
        ? 'This withdrawal request is currently PENDING. Deleting it would leave the user without their funds. To automatically refund the player before deleting, confirm with refundPending=true, or reject it first.'
        : `Selected items contain ${pendingList.length} PENDING request(s). Please confirm refunding them prior to deletion (set refundPending: true).`
    };
  }

  let refundedCount = 0;
  for (const reqItem of pendingList) {
    const refundAmount = parseFloat(reqItem.amount);
    if (!Number.isFinite(refundAmount) || refundAmount <= 0) {
      throw new Error('Invalid withdrawal refund amount');
    }
    const refundRes = await client.query(
      `SELECT * FROM fn_wallet_refund($1, $2, 'real', $3)`,
      [reqItem.user_id, refundAmount, `Withdrawal #${reqItem.id.slice(0, 8)} deleted & refunded by Admin`]
    );
    if (!refundRes.rows[0]?.success) {
      throw new Error('Failed to refund user balance before deletion');
    }
    refundedCount++;
  }

  const targetIds = locked.rows.map(r => r.id);
  await recordAdminAudit(client, {
    adminId,
    adminUsername,
    action,
    targetType: 'withdrawal',
    targetIds,
    snapshot: locked.rows.map(r => ({ ...r, refunded_on_delete: r.status === 'pending' && Boolean(refundPending) })),
    req
  });

  const delRes = await client.query(
    `DELETE FROM withdrawal_requests WHERE id = ANY($1::uuid[]) RETURNING id`,
    [targetIds]
  );
  return { ok: true, deletedIds: delRes.rows.map(r => r.id), refundedCount };
}

router.param('id', (req, res, next, id) => {
  if (!isValidUuid(id)) {
    return res.status(400).json({ error: 'Invalid ID format' });
  }
  next();
});

// ── Admin Auth ────────────────────────────────────────────────────────────────

router.post('/auth/login', adminLoginLimiter, async (req, res) => {
  try {
    const phoneNumber = typeof req.body?.phoneNumber === 'string' ? req.body.phoneNumber.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!phoneNumber || !password)
      return res.status(400).json({ error: 'Phone number and password required' });

    const result = await db.query(
      `SELECT id, display_name, phone_number, password_hash, role, is_active FROM users
       WHERE phone_number = $1 AND role = 'admin'`,
      [phoneNumber]
    );

    if (result.rows.length === 0)
      return res.status(401).json({ error: 'Invalid credentials or not an admin' });

    const admin = result.rows[0];
    if (admin.is_active === false) {
      return res.status(403).json({ error: 'Admin account is deactivated' });
    }
    const isMatch = await verifyPassword(password, admin.password_hash);
    if (!isMatch)
      return res.status(401).json({ error: 'Invalid credentials or not an admin' });

    // Transparently upgrade legacy SHA-256 hash to bcrypt
    if (!admin.password_hash.startsWith('$2')) {
      const upgraded = await hashPassword(password);
      await db.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [upgraded, admin.id]).catch(() => {});
    }

    await db.query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [admin.id]);

    const token = generateToken({
      id: admin.id,
      role: admin.role,
      email: admin.phone_number
    });

    res.json({
      token,
      admin: {
        id: admin.id,
        name: admin.display_name,
        phone: admin.phone_number,
        role: admin.role
      }
    });
  } catch (err) {
    console.error('Admin login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

router.get('/auth/me', adminMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, display_name, phone_number, role, last_login_at, created_at FROM users WHERE id = $1`,
      [req.admin.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Admin not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch admin profile' });
  }
});

router.put('/auth/profile', adminMiddleware, async (req, res) => {
  try {
    const { displayName, password } = req.body;
    let query, values;
    if (password) {
      const hash = await hashPassword(password);
      query = `UPDATE users SET display_name=$1, password_hash=$2, updated_at=NOW() WHERE id=$3 RETURNING display_name`;
      values = [displayName, hash, req.admin.id];
    } else {
      query = `UPDATE users SET display_name=$1, updated_at=NOW() WHERE id=$2 RETURNING display_name`;
      values = [displayName, req.admin.id];
    }
    const result = await db.query(query, values);
    res.json({ success: true, name: result.rows[0].display_name });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── Dashboard Stats ───────────────────────────────────────────────────────────

router.get('/dashboard/stats', adminMiddleware, adminReadLimiter, async (req, res) => {
  try {
    const [players, activeGames, finance, today, depositTotal, withdrawalTotal] = await Promise.all([
      db.query(`
        SELECT
          COUNT(*) FILTER (WHERE role = 'player') AS total_players,
          COUNT(*) FILTER (WHERE role = 'player' AND is_active = TRUE) AS active_players
        FROM users
      `),
      db.query(`
        SELECT
          COUNT(*) AS total_rooms,
          COUNT(*) FILTER (WHERE status = 'open') AS open_rooms,
          COUNT(*) FILTER (WHERE status = 'drawing') AS drawing_rooms,
          COUNT(*) FILTER (WHERE status = 'settled') AS settled_rooms,
          COUNT(*) FILTER (WHERE status = 'refunded') AS refunded_rooms
        FROM rooms
      `),
      db.query(`
        SELECT
          COALESCE(SUM(gross_pool), 0) AS total_gross,
          COALESCE(SUM(tax_collected), 0) AS total_platform_fees,
          COALESCE(SUM(net_paid_out), 0) AS total_payouts,
          COUNT(*) AS total_settled_games
        FROM platform_treasury
      `),
      db.query(`
        SELECT
          COALESCE(SUM(pt.gross_pool), 0) AS today_gross,
          COALESCE(SUM(pt.tax_collected), 0) AS today_fees,
          COALESCE(SUM(pt.net_paid_out), 0) AS today_payouts,
          COUNT(DISTINCT pt.id) AS today_games
        FROM platform_treasury pt
        WHERE pt.collected_at >= CURRENT_DATE
      `),
      db.query(`SELECT COALESCE(SUM(amount), 0) AS total FROM transactions WHERE tx_type = 'deposit'`),
      db.query(`SELECT COALESCE(SUM(amount), 0) AS total FROM transactions WHERE tx_type = 'withdrawal'`)
    ]);

    res.json({
      players: players.rows[0],
      games: activeGames.rows[0],
      finance: {
        ...finance.rows[0],
        total_deposits: depositTotal.rows[0].total,
        total_withdrawals: withdrawalTotal.rows[0].total
      },
      today: today.rows[0]
    });
  } catch (err) {
    console.error('Dashboard stats error:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

router.get('/dashboard/recent-transactions', adminMiddleware, adminReadLimiter, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        t.id, t.tx_type, t.amount, t.direction, t.status,
        t.reference_note, t.created_at,
        u.display_name AS player_name, u.phone_number
      FROM transactions t
      JOIN wallets w ON w.id = t.wallet_id
      JOIN users u ON u.id = w.user_id
      ORDER BY t.created_at DESC
      LIMIT 20
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch recent transactions' });
  }
});

router.get('/dashboard/recent-games', adminMiddleware, adminReadLimiter, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        r.id, r.room_number, r.tier, r.target_jackpot, r.group_size,
        r.filled_seats, r.status, r.gross_pool, r.platform_fee,
        r.net_winner_payout, r.started_at, r.settled_at,
        u.display_name AS winner_name
      FROM rooms r
      LEFT JOIN users u ON u.id = r.winner_user_id
      ORDER BY r.started_at DESC
      LIMIT 20
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch recent games' });
  }
});

router.get('/dashboard/revenue-chart', adminMiddleware, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        DATE_TRUNC('day', collected_at)::DATE AS date,
        SUM(gross_pool) AS gross,
        SUM(tax_collected) AS profit,
        SUM(net_paid_out) AS payouts,
        COUNT(*) AS games
      FROM platform_treasury
      WHERE collected_at > NOW() - INTERVAL '30 days'
      GROUP BY DATE_TRUNC('day', collected_at)
      ORDER BY date
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch chart data' });
  }
});

// ── Player Management ─────────────────────────────────────────────────────────

router.get('/players', adminMiddleware, async (req, res) => {
  try {
    const {
      search,
      status,
      balanceFilter,
      minBalance,
      maxBalance,
      sortBy,
      page = 1,
      limit = 20
    } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    let whereClause = `WHERE u.role = 'player'`;
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      whereClause += ` AND (u.display_name ILIKE $${params.length} OR u.phone_number ILIKE $${params.length})`;
    }
    if (status === 'active') {
      whereClause += ` AND u.is_active = TRUE`;
    } else if (status === 'inactive') {
      whereClause += ` AND u.is_active = FALSE`;
    }

    if (balanceFilter === 'zero') {
      whereClause += ` AND COALESCE(w.balance, 0) = 0`;
    } else if (balanceFilter === 'positive') {
      whereClause += ` AND COALESCE(w.balance, 0) > 0`;
    } else if (balanceFilter === 'high') {
      whereClause += ` AND COALESCE(w.balance, 0) >= 1000`;
    }

    if (minBalance !== undefined && minBalance !== '') {
      const minVal = Number(minBalance);
      if (!Number.isFinite(minVal) || minVal < 0) {
        return res.status(400).json({ error: 'Invalid minimum balance filter' });
      }
      params.push(minVal);
      whereClause += ` AND COALESCE(w.balance, 0) >= $${params.length}`;
    }

    if (maxBalance !== undefined && maxBalance !== '') {
      const maxVal = Number(maxBalance);
      if (!Number.isFinite(maxVal) || maxVal < 0) {
        return res.status(400).json({ error: 'Invalid maximum balance filter' });
      }
      params.push(maxVal);
      whereClause += ` AND COALESCE(w.balance, 0) <= $${params.length}`;
    }

    const orderByMap = {
      balance_desc: 'COALESCE(w.balance, 0) DESC, u.created_at DESC',
      balance_asc: 'COALESCE(w.balance, 0) ASC, u.created_at DESC',
      newest: 'u.created_at DESC'
    };
    const orderByClause = orderByMap[sortBy] || orderByMap.newest;

    const countResult = await db.query(
      `SELECT COUNT(*) FROM users u
       LEFT JOIN wallets w ON w.user_id = u.id AND w.mode = 'real'
       ${whereClause}`,
      params
    );

    const dataParams = [...params, limitNum, offset];
    const result = await db.query(`
      SELECT
        u.id, u.display_name, u.phone_number, u.telegram_id, u.is_active, u.role,
        u.created_at, u.last_login_at,
        COALESCE(w.balance, 0) AS real_balance,
        COALESCE(w.total_deposited, 0) AS total_deposited,
        COALESCE(w.total_withdrawn, 0) AS total_withdrawn,
        COALESCE(w.total_wagered, 0) AS total_wagered,
        COALESCE(w.total_won, 0) AS total_won,
        COUNT(DISTINCT t.room_id) AS games_played,
        COUNT(t.id) FILTER (WHERE t.is_winner = TRUE) AS games_won
      FROM users u
      LEFT JOIN wallets w ON w.user_id = u.id AND w.mode = 'real'
      LEFT JOIN tickets t ON t.user_id = u.id
      ${whereClause}
      GROUP BY u.id, u.telegram_id, w.balance, w.total_deposited, w.total_withdrawn, w.total_wagered, w.total_won
      ORDER BY ${orderByClause}
      LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}
    `, dataParams);

    res.json({
      players: result.rows,
      total: parseInt(countResult.rows[0].count, 10),
      page: pageNum,
      limit: limitNum
    });
  } catch (err) {
    console.error('Players list error:', err);
    res.status(500).json({ error: 'Failed to fetch players' });
  }
});

router.post('/players', adminMiddleware, async (req, res) => {
  try {
    const { phoneNumber, displayName, password, telegramId } = req.body;
    if (!phoneNumber || !displayName || !password) return res.status(400).json({ error: 'All fields required' });

    const existing = await db.query(`SELECT id FROM users WHERE phone_number = $1`, [phoneNumber]);
    if (existing.rows.length > 0) return res.status(400).json({ error: 'Phone number already registered' });

    // Check if telegram_id is already in use (if provided)
    if (telegramId) {
      const telegramCheck = await db.query('SELECT id FROM users WHERE telegram_id = $1', [telegramId]);
      if (telegramCheck.rows.length > 0)
        return res.status(400).json({ error: 'Telegram ID already linked to another account' });
    }

    const hash = await hashPassword(password);
    const result = await db.query(`
      INSERT INTO users (phone_number, display_name, password_hash, role, telegram_id)
      VALUES ($1, $2, $3, 'player', $4) RETURNING id, display_name, phone_number, telegram_id, created_at
    `, [phoneNumber, displayName, hash, telegramId || null]);

    await db.query(`INSERT INTO wallets (user_id, mode) VALUES ($1, 'real'), ($1, 'demo')`, [result.rows[0].id]);
    res.json({ success: true, player: result.rows[0] });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/players/:id', adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { phoneNumber, displayName, password, telegramId } = req.body;
    if (!phoneNumber || !displayName) return res.status(400).json({ error: 'Phone and Name required' });

    const existing = await db.query(`SELECT id FROM users WHERE phone_number = $1 AND id != $2`, [phoneNumber, id]);
    if (existing.rows.length > 0) return res.status(400).json({ error: 'Phone number already in use by another user' });

    // Check if telegram_id is already in use by another user (if provided)
    if (telegramId) {
      const telegramCheck = await db.query('SELECT id FROM users WHERE telegram_id = $1 AND id != $2', [telegramId, id]);
      if (telegramCheck.rows.length > 0)
        return res.status(400).json({ error: 'Telegram ID already linked to another account' });
    }

    if (password) {
      const hash = await hashPassword(password);
      await db.query(`UPDATE users SET phone_number = $1, display_name = $2, password_hash = $3, telegram_id = $4, updated_at = NOW() WHERE id = $5 AND role = 'player'`, [phoneNumber, displayName, hash, telegramId || null, id]);
    } else {
      await db.query(`UPDATE users SET phone_number = $1, display_name = $2, telegram_id = $3, updated_at = NOW() WHERE id = $4 AND role = 'player'`, [phoneNumber, displayName, telegramId || null, id]);
    }
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/players/:id', adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    await db.query(`DELETE FROM users WHERE id = $1 AND role = 'player'`, [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: 'Cannot delete player. They may have active tickets or financial records.' });
  }
});

router.post('/players/bulk-delete', adminMiddleware, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'No player IDs provided' });
    }
    
    // We use ANY($1) to pass an array of UUIDs to postgres
    await db.query(`DELETE FROM users WHERE id = ANY($1) AND role = 'player'`, [ids]);
    res.json({ success: true, count: ids.length });
  } catch (err) {
    res.status(400).json({ error: 'Cannot delete some players. They may have active tickets or financial records.' });
  }
});

router.get('/players/:id', adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const [player, wallets, tickets, transactions] = await Promise.all([
      db.query(`
        SELECT id, display_name, phone_number, is_active, role, created_at, last_login_at
        FROM users WHERE id = $1
      `, [id]),
      db.query(`
        SELECT mode, balance, total_deposited, total_withdrawn, total_wagered, total_won
        FROM wallets WHERE user_id = $1
      `, [id]),
      db.query(`
        SELECT
          t.id, t.room_id, r.room_number, r.tier, r.target_jackpot, r.status AS room_status, t.seat_number,
          t.purchase_price, t.is_winner, t.is_refunded, t.purchased_at,
          CASE WHEN t.is_winner THEN r.net_winner_payout WHEN t.is_refunded THEN t.purchase_price ELSE 0 END AS amount_received
        FROM tickets t
        JOIN rooms r ON r.id = t.room_id
        WHERE t.user_id = $1
        ORDER BY t.purchased_at DESC LIMIT 50
      `, [id]),
      db.query(`
        SELECT tx.tx_type, tx.amount, tx.direction, tx.running_balance, tx.reference_note, tx.created_at, tx.status
        FROM transactions tx
        JOIN wallets w ON w.id = tx.wallet_id
        WHERE w.user_id = $1
        ORDER BY tx.created_at DESC LIMIT 50
      `, [id])
    ]);

    if (player.rows.length === 0) return res.status(404).json({ error: 'Player not found' });

    res.json({
      player: player.rows[0],
      wallets: wallets.rows,
      tickets: tickets.rows,
      transactions: transactions.rows
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch player details' });
  }
});

router.put('/players/:id/status', adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;
    await db.query(
      `UPDATE users SET is_active = $1, updated_at = NOW() WHERE id = $2 AND role = 'player'`,
      [isActive, id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/players/:id/adjust-balance', adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, mode = 'real' } = req.body;
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount === 0) return res.status(400).json({ error: 'Invalid amount' });

    if (parsedAmount > 0) {
      const dRes = await db.query('SELECT * FROM fn_wallet_deposit($1, $2, $3, $4)', [id, parsedAmount, mode, null]);
      if (!dRes.rows[0]?.success) {
        return res.status(400).json({ error: 'Deposit failed' });
      }
    } else {
      const wRes = await db.query('SELECT * FROM fn_wallet_withdraw($1, $2, $3, $4)', [id, Math.abs(parsedAmount), mode, null]);
      if (!wRes.rows[0]?.success) {
        return res.status(400).json({ error: wRes.rows[0]?.error_message || 'Deduction failed' });
      }
    }

    const newBal = await db.query(`SELECT balance FROM wallets WHERE user_id=$1 AND mode=$2`, [id, mode]);
    res.json({ success: true, newBalance: parseFloat(newBal.rows[0]?.balance || 0) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── Game Management ───────────────────────────────────────────────────────────

router.get('/games', adminMiddleware, async (req, res) => {
  try {
    const { status, tier, page = 1, limit = 20, search } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let whereClause = 'WHERE 1=1';
    const params = [];

    if (status) { params.push(status); whereClause += ` AND r.status = $${params.length}`; }
    if (tier)   { params.push(tier);   whereClause += ` AND r.tier = $${params.length}`; }
    if (search) { params.push(search); whereClause += ` AND r.room_number::TEXT = $${params.length}`; }

    const countResult = await db.query(`SELECT COUNT(*) FROM rooms r ${whereClause}`, params);

    const dataParams = [...params, parseInt(limit), offset];
    const result = await db.query(`
      SELECT
        r.id, r.room_number, r.tier, r.target_jackpot, r.group_size,
        r.ticket_price, r.filled_seats, r.status, r.gross_pool,
        r.platform_fee, r.net_winner_payout, r.started_at, r.settled_at,
        r.draw_started_at,
        u.display_name AS winner_name
      FROM rooms r
      LEFT JOIN users u ON u.id = r.winner_user_id
      ${whereClause}
      ORDER BY r.started_at DESC
      LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}
    `, dataParams);

    res.json({
      games: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch games' });
  }
});

router.get('/games/:id', adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const [game, tickets] = await Promise.all([
      db.query(`
        SELECT r.*, u.display_name AS winner_name, u.phone_number AS winner_phone
        FROM rooms r
        LEFT JOIN users u ON u.id = r.winner_user_id
        WHERE r.id = $1
      `, [id]),
      db.query(`
        SELECT
          t.id, t.seat_number, t.purchase_price, t.is_winner, t.is_refunded, t.purchased_at,
          u.display_name AS player_name, u.phone_number, t.user_id
        FROM tickets t
        JOIN users u ON u.id = t.user_id
        WHERE t.room_id = $1
        ORDER BY t.seat_number
      `, [id])
    ]);

    if (game.rows.length === 0) return res.status(404).json({ error: 'Game not found' });
    res.json({ game: game.rows[0], tickets: tickets.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch game details' });
  }
});

router.post('/games/:id/refund', adminMiddleware, async (req, res) => {
  try {
    const roomId = req.params.id;
    const roomManager = require('./roomManager');
    
    await db.query('SELECT * FROM fn_refund_room($1)', [roomId]);
    await db.query(`UPDATE rooms SET status = 'refunded' WHERE id = $1`, [roomId]);
    
    if (roomManager.io) {
      roomManager.io.emit('room:refunded', { roomId, reason: 'Manually refunded by admin' });
      roomManager.io.emit('room:state_update', roomManager.getRoomSummaries());
    }
    roomManager.rooms.delete(roomId);
    
    res.json({ success: true, message: 'Room manually refunded successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to refund room' });
  }
});

router.post('/games/:id/force-start', adminMiddleware, async (req, res) => {
  try {
    const roomId = req.params.id;
    const roomManager = require('./roomManager');
    const room = roomManager.rooms.get(roomId);
    
    if (!room || room.status !== 'open') {
      return res.status(400).json({ error: 'Room is not open or not active in memory' });
    }
    
    const uniqueUsers = new Set(room.seats.map(s => s.userId)).size;
    if (uniqueUsers < 2) {
       return res.status(400).json({ error: 'Need at least 2 unique players to force start' });
    }
    
    roomManager.startRoomGame(roomId, true);
    
    res.json({ success: true, message: 'Game forced to start successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to force start game' });
  }
});

// Create new custom game room
router.post('/games', adminMiddleware, async (req, res) => {
  try {
    const { targetJackpot, groupSize, maxSeatsPerPlayer, roundDurationSeconds, customTicketPrice } = req.body;
    let { tierCategory } = req.body;

    if (!targetJackpot || parseFloat(targetJackpot) <= 0) {
      return res.status(400).json({ error: 'Valid target jackpot is required' });
    }
    if (!groupSize || parseInt(groupSize) < 2) {
      return res.status(400).json({ error: 'Group size must be at least 2 players' });
    }

    const jackpotNum = parseFloat(targetJackpot);
    const sizeNum = parseInt(groupSize);

    if (!tierCategory) {
      if (jackpotNum >= 100000) tierCategory = 'gold';
      else if (jackpotNum >= 10000) tierCategory = 'silver';
      else if (jackpotNum >= 1000)  tierCategory = 'bronze';
      else tierCategory = 'starter';
    }

    const roomManager = require('./roomManager');
    const room = await roomManager.createRoom(
      tierCategory,
      jackpotNum,
      sizeNum,
      maxSeatsPerPlayer ? parseInt(maxSeatsPerPlayer) : null,
      roundDurationSeconds ? parseInt(roundDurationSeconds) : 60,
      customTicketPrice ? parseFloat(customTicketPrice) : null
    );

    res.status(201).json({ success: true, game: room });
  } catch (err) {
    console.error('Create game error:', err);
    res.status(400).json({ error: err.message || 'Failed to create game room' });
  }
});

// Update open game room
router.put('/games/:id', adminMiddleware, async (req, res) => {
  try {
    const roomId = req.params.id;
    const roomManager = require('./roomManager');
    const updated = await roomManager.updateRoom(roomId, req.body);
    res.json({ success: true, game: updated });
  } catch (err) {
    console.error('Update game error:', err);
    res.status(400).json({ error: err.message || 'Failed to update game' });
  }
});

// Delete / Cancel game room (with auto-refund if seats were filled)
router.delete('/games/:id', adminMiddleware, async (req, res) => {
  try {
    const roomId = req.params.id;
    const roomManager = require('./roomManager');
    const result = await roomManager.deleteRoom(roomId);
    res.json({ success: true, message: 'Game room deleted / refunded successfully', ...result });
  } catch (err) {
    console.error('Delete game error:', err);
    res.status(400).json({ error: err.message || 'Failed to delete game' });
  }
});

// ── Room/Seat Configuration ───────────────────────────────────────────────────

router.get('/room-configs', adminMiddleware, async (req, res) => {
  try {
    const quotas = await db.query(`SELECT * FROM seat_quotas ORDER BY tier_index`);
    const tiers = await db.query(`SELECT tier, COUNT(*) AS jackpot_options, MIN(jackpot_amount) AS min_jackpot, MAX(jackpot_amount) AS max_jackpot FROM tier_config GROUP BY tier ORDER BY tier`);
    res.json({ quotas: quotas.rows, tiers: tiers.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch room configs' });
  }
});

router.put('/room-configs/quota/:groupSize', adminMiddleware, async (req, res) => {
  try {
    const { groupSize } = req.params;
    const { maxSeatsPerUser } = req.body;
    await db.query(
      `UPDATE seat_quotas SET max_seats_per_user = $1 WHERE group_size = $2`,
      [maxSeatsPerUser, groupSize]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── Transactions ──────────────────────────────────────────────────────────────

router.get('/transactions', adminMiddleware, adminReadLimiter, async (req, res) => {
  try {
    const { type, status, dateFrom, dateTo, search, page = 1, limit = 20 } = req.query;

    if (type && !ALLOWED_TX_TYPES.has(String(type))) {
      return res.status(400).json({ error: 'Invalid transaction type filter' });
    }
    if (status && !ALLOWED_TX_STATUSES.has(String(status))) {
      return res.status(400).json({ error: 'Invalid transaction status filter' });
    }
    if (dateFrom && !ISO_DATE_RE.test(String(dateFrom))) {
      return res.status(400).json({ error: 'Invalid dateFrom format (expected YYYY-MM-DD)' });
    }
    if (dateTo && !ISO_DATE_RE.test(String(dateTo))) {
      return res.status(400).json({ error: 'Invalid dateTo format (expected YYYY-MM-DD)' });
    }

    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (safePage - 1) * safeLimit;
    const cleanSearch = typeof search === 'string' ? search.trim().slice(0, 100) : '';

    let whereClause = 'WHERE 1=1';
    const params = [];

    if (type)     { params.push(String(type));     whereClause += ` AND t.tx_type = $${params.length}`; }
    if (status)   { params.push(String(status));   whereClause += ` AND t.status = $${params.length}`; }
    if (dateFrom) { params.push(String(dateFrom)); whereClause += ` AND t.created_at >= $${params.length}::DATE`; }
    if (dateTo)   { params.push(String(dateTo));   whereClause += ` AND t.created_at < ($${params.length}::DATE + INTERVAL '1 day')`; }
    if (cleanSearch) {
      params.push(`%${cleanSearch}%`);
      whereClause += ` AND (u.display_name ILIKE $${params.length} OR u.phone_number ILIKE $${params.length} OR COALESCE(t.reference_note, '') ILIKE $${params.length})`;
    }

    const countResult = await db.query(`
      SELECT COUNT(*) FROM transactions t
      JOIN wallets w ON w.id = t.wallet_id
      JOIN users u ON u.id = w.user_id ${whereClause}
    `, params);

    const dataParams = [...params, safeLimit, offset];
    const result = await db.query(`
      SELECT
        t.id, t.tx_type, t.amount, t.direction, t.running_balance,
        t.fee_deducted, t.status, t.reference_note, t.created_at, t.room_id,
        u.display_name AS player_name, u.phone_number, u.id AS user_id,
        w.mode
      FROM transactions t
      JOIN wallets w ON w.id = t.wallet_id
      JOIN users u ON u.id = w.user_id
      ${whereClause}
      ORDER BY t.created_at DESC
      LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}
    `, dataParams);

    res.json({
      transactions: result.rows,
      total: parseInt(countResult.rows[0].count, 10),
      page: safePage,
      limit: safeLimit
    });
  } catch (err) {
    console.error('Transactions error:', err);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// Forensic Security Audit Log for Ledger Operations
router.get('/transactions/audit-logs', adminMiddleware, adminReadLimiter, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, admin_id, admin_username, action, target_type, target_ids,
              snapshot, ip_address, created_at
       FROM admin_audit_logs
       WHERE target_type = 'transaction'
       ORDER BY created_at DESC
       LIMIT 50`
    );
    res.json({ logs: result.rows });
  } catch (err) {
    console.error('Transaction audit log error:', err);
    res.status(500).json({ error: 'Failed to fetch security audit logs' });
  }
});

// Single Delete Transaction (requires admin password confirmation + immutable audit log)
router.delete('/transactions/:id', adminMiddleware, txMutationLimiter, async (req, res) => {
  const client = await db.getClient();
  try {
    const { id } = req.params;
    const pwCheck = await verifyAdminActionPassword(req.admin.id, req.body?.confirmPassword);
    if (!pwCheck.ok) {
      return res.status(pwCheck.status).json({ error: pwCheck.error });
    }

    await client.query('BEGIN');
    const deletedIds = await deleteTransactionsWithAudit({
      client,
      ids: [id],
      action: 'delete_transaction',
      adminId: req.admin.id,
      adminUsername: pwCheck.adminName,
      req
    });

    if (deletedIds.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Transaction not found' });
    }

    await client.query('COMMIT');
    res.json({ success: true, message: 'Transaction deleted and logged', id: deletedIds[0] });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Delete transaction error:', err);
    res.status(500).json({ error: 'Failed to delete transaction' });
  } finally {
    client.release();
  }
});

// Bulk Delete Transactions (requires admin password confirmation + bounded batch + immutable audit log)
router.post('/transactions/bulk-delete', adminMiddleware, txMutationLimiter, async (req, res) => {
  const client = await db.getClient();
  try {
    const { ids, confirmPassword } = req.body || {};

    const idCheck = validateUuidArray(ids, 'transaction IDs');
    if (!idCheck.ok) {
      return res.status(400).json({ error: idCheck.error });
    }
    const uniqueIds = idCheck.uniqueIds;

    const pwCheck = await verifyAdminActionPassword(req.admin.id, confirmPassword);
    if (!pwCheck.ok) {
      return res.status(pwCheck.status).json({ error: pwCheck.error });
    }

    await client.query('BEGIN');
    const deletedIds = await deleteTransactionsWithAudit({
      client,
      ids: uniqueIds,
      action: 'bulk_delete_transactions',
      adminId: req.admin.id,
      adminUsername: pwCheck.adminName,
      req
    });

    await client.query('COMMIT');

    res.json({
      success: true,
      deletedCount: deletedIds.length,
      deletedIds
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Bulk delete transactions error:', err);
    res.status(500).json({ error: 'Failed to bulk delete transactions' });
  } finally {
    client.release();
  }
});


// ── Profit / Revenue ──────────────────────────────────────────────────────────

router.get('/profit/summary', adminMiddleware, async (req, res) => {
  try {
    const [treasury, deposits, withdrawals, balances] = await Promise.all([
      db.query(`SELECT COALESCE(SUM(tax_collected),0) AS platform_profit, COALESCE(SUM(gross_pool),0) AS total_wagered, COALESCE(SUM(net_paid_out),0) AS total_won FROM platform_treasury`),
      db.query(`SELECT COALESCE(SUM(amount), 0) AS total_deposits FROM transactions WHERE tx_type = 'deposit'`),
      db.query(`SELECT COALESCE(SUM(amount), 0) AS total_withdrawals FROM transactions WHERE tx_type = 'withdrawal'`),
      db.query(`SELECT COALESCE(SUM(balance), 0) AS total_player_balances FROM wallets WHERE mode = 'real'`)
    ]);

    res.json({
      platform_profit: treasury.rows[0].platform_profit,
      total_wagered: treasury.rows[0].total_wagered,
      total_won: treasury.rows[0].total_won,
      total_deposits: deposits.rows[0].total_deposits,
      total_withdrawals: withdrawals.rows[0].total_withdrawals,
      total_player_balances: balances.rows[0].total_player_balances
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch profit summary' });
  }
});

router.get('/profit/chart', adminMiddleware, async (req, res) => {
  try {
    const { period = '30d' } = req.query;
    const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
    const result = await db.query(`
      SELECT
        DATE_TRUNC('day', collected_at)::DATE AS date,
        SUM(tax_collected) AS profit,
        SUM(gross_pool) AS gross,
        COUNT(*) AS games
      FROM platform_treasury
      WHERE collected_at >= NOW() - ($1 || ' days')::INTERVAL
      GROUP BY DATE_TRUNC('day', collected_at)
      ORDER BY date
    `, [days]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch profit chart' });
  }
});

// ── Prize / Platform Settings ─────────────────────────────────────────────────

router.get('/prize-settings', adminMiddleware, async (req, res) => {
  try {
    const quotas = await db.query(`SELECT * FROM seat_quotas ORDER BY tier_index`);
    res.json({
      platformFeePct: 15,
      prizePct: 85,
      quotas: quotas.rows,
      note: 'Platform fee is 15% of gross pool. Prize is 85% of gross pool.'
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch prize settings' });
  }
});

// ── Reports ───────────────────────────────────────────────────────────────────

router.get('/reports/players', adminMiddleware, async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.query;
    let whereClause = `WHERE u.role = 'player'`;
    const params = [];
    if (dateFrom) { params.push(dateFrom); whereClause += ` AND u.created_at >= $${params.length}`; }
    if (dateTo)   { params.push(dateTo);   whereClause += ` AND u.created_at < ($${params.length}::DATE + INTERVAL '1 day')`; }

    const result = await db.query(`
      SELECT
        u.id, u.display_name, u.phone_number, u.is_active, u.created_at, u.last_login_at,
        COALESCE(w.balance, 0) AS balance,
        COALESCE(w.total_deposited, 0) AS total_deposited,
        COALESCE(w.total_withdrawn, 0) AS total_withdrawn,
        COALESCE(w.total_wagered, 0) AS total_wagered,
        COALESCE(w.total_won, 0) AS total_won,
        COUNT(DISTINCT t.room_id) AS games_played,
        COUNT(t.id) FILTER (WHERE t.is_winner = TRUE) AS wins
      FROM users u
      LEFT JOIN wallets w ON w.user_id = u.id AND w.mode = 'real'
      LEFT JOIN tickets t ON t.user_id = u.id
      ${whereClause}
      GROUP BY u.id, w.balance, w.total_deposited, w.total_withdrawn, w.total_wagered, w.total_won
      ORDER BY u.created_at DESC
    `, params);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate player report' });
  }
});

router.get('/reports/games', adminMiddleware, async (req, res) => {
  try {
    const { dateFrom, dateTo, tier, status } = req.query;
    let whereClause = 'WHERE 1=1';
    const params = [];
    if (dateFrom) { params.push(dateFrom); whereClause += ` AND r.started_at >= $${params.length}`; }
    if (dateTo)   { params.push(dateTo);   whereClause += ` AND r.started_at < ($${params.length}::DATE + INTERVAL '1 day')`; }
    if (tier)     { params.push(tier);     whereClause += ` AND r.tier = $${params.length}`; }
    if (status)   { params.push(status);   whereClause += ` AND r.status = $${params.length}`; }

    const result = await db.query(`
      SELECT r.room_number, r.tier, r.target_jackpot, r.group_size, r.ticket_price, r.filled_seats,
        r.status, r.gross_pool, r.platform_fee, r.net_winner_payout, r.started_at, r.settled_at,
        u.display_name AS winner_name
      FROM rooms r
      LEFT JOIN users u ON u.id = r.winner_user_id
      ${whereClause}
      ORDER BY r.started_at DESC
    `, params);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate game report' });
  }
});

router.get('/reports/transactions', adminMiddleware, async (req, res) => {
  try {
    const { dateFrom, dateTo, type } = req.query;
    let whereClause = 'WHERE 1=1';
    const params = [];
    if (dateFrom) { params.push(dateFrom); whereClause += ` AND t.created_at >= $${params.length}`; }
    if (dateTo)   { params.push(dateTo);   whereClause += ` AND t.created_at < ($${params.length}::DATE + INTERVAL '1 day')`; }
    if (type)     { params.push(type);     whereClause += ` AND t.tx_type = $${params.length}`; }

    const result = await db.query(`
      SELECT t.id, t.tx_type, t.amount, t.direction, t.running_balance, t.status, t.reference_note, t.created_at,
        u.display_name AS player_name, u.phone_number, w.mode
      FROM transactions t
      JOIN wallets w ON w.id = t.wallet_id
      JOIN users u ON u.id = w.user_id
      ${whereClause}
      ORDER BY t.created_at DESC
    `, params);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate transaction report' });
  }
});

router.get('/reports/profit', adminMiddleware, async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.query;
    let whereClause = 'WHERE 1=1';
    const params = [];
    if (dateFrom) { params.push(dateFrom); whereClause += ` AND pt.collected_at >= $${params.length}`; }
    if (dateTo)   { params.push(dateTo);   whereClause += ` AND pt.collected_at < ($${params.length}::DATE + INTERVAL '1 day')`; }

    const result = await db.query(`
      SELECT r.room_number, r.tier, pt.gross_pool, pt.tax_rate, pt.tax_collected AS profit,
        pt.net_paid_out, u.display_name AS winner_name, pt.collected_at
      FROM platform_treasury pt
      JOIN rooms r ON r.id = pt.room_id
      LEFT JOIN users u ON u.id = pt.winner_user_id
      ${whereClause}
      ORDER BY pt.collected_at DESC
    `, params);

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate profit report' });
  }
});

// ── Platform Settings ─────────────────────────────────────────────────────────

router.get('/settings', adminMiddleware, async (req, res) => {
  try {
    const quotas = await db.query(`SELECT * FROM seat_quotas ORDER BY tier_index`);
    const tiers = await db.query(`SELECT tier, COUNT(*) AS jackpot_options FROM tier_config GROUP BY tier ORDER BY tier`);
    const sysConfig = await db.query(`SELECT * FROM system_config`);
    const configMap = sysConfig.rows.reduce((acc, row) => ({ ...acc, [row.config_key]: row.config_value }), {});
    const platformFee = parseFloat(configMap.PLATFORM_FEE_RATE || '0.15');

    res.json({
      quotas: quotas.rows,
      tiers: tiers.rows,
      platformFee: platformFee,
      prizePct: 1 - platformFee,
      telebirrPhone: configMap.TELEBIRR_PHONE || '',
      telebirrName: configMap.TELEBIRR_NAME || '',
      verifyEtApiKey: configMap.VERIFY_ET_API_KEY || ''
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

router.put('/settings', adminMiddleware, async (req, res) => {
  try {
    const { telebirrPhone, telebirrName, verifyEtApiKey, platformFee } = req.body;
    
    if (platformFee !== undefined) {
      await db.query('INSERT INTO system_config (config_key, config_value) VALUES ($1, $2) ON CONFLICT (config_key) DO UPDATE SET config_value = EXCLUDED.config_value', ['PLATFORM_FEE_RATE', platformFee.toString()]);
    }
    if (telebirrPhone !== undefined) {
      await db.query('INSERT INTO system_config (config_key, config_value) VALUES ($1, $2) ON CONFLICT (config_key) DO UPDATE SET config_value = EXCLUDED.config_value', ['TELEBIRR_PHONE', telebirrPhone]);
    }
    if (telebirrName !== undefined) {
      await db.query('INSERT INTO system_config (config_key, config_value) VALUES ($1, $2) ON CONFLICT (config_key) DO UPDATE SET config_value = EXCLUDED.config_value', ['TELEBIRR_NAME', telebirrName]);
    }
    if (verifyEtApiKey !== undefined) {
      await db.query('INSERT INTO system_config (config_key, config_value) VALUES ($1, $2) ON CONFLICT (config_key) DO UPDATE SET config_value = EXCLUDED.config_value', ['VERIFY_ET_API_KEY', verifyEtApiKey]);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// ── Admin Users CRUD ──────────────────────────────────────────────────────────

router.get('/admins', adminMiddleware, async (req, res) => {
  try {
    const result = await db.query(`
      SELECT id, phone_number, display_name, role, is_active, created_at, last_login_at
      FROM users
      WHERE role = 'admin'
      ORDER BY created_at ASC
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch admins' });
  }
});

router.post('/create-admin', adminMiddleware, async (req, res) => {
  try {
    const phoneNumber = typeof req.body?.phoneNumber === 'string' ? req.body.phoneNumber.trim() : '';
    const displayName = typeof req.body?.displayName === 'string' ? req.body.displayName.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (!phoneNumber || !displayName || !password)
      return res.status(400).json({ error: 'Username/phone, display name, and password are required' });
    if (phoneNumber.length > 20)
      return res.status(400).json({ error: 'Username / phone number must be 20 characters or less' });
    if (displayName.length > 50)
      return res.status(400).json({ error: 'Display name must be 50 characters or less' });
    if (password.trim().length < 6)
      return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const existing = await db.query(`SELECT id FROM users WHERE phone_number = $1`, [phoneNumber]);
    if (existing.rows.length > 0)
      return res.status(400).json({ error: 'Username or phone number is already registered' });

    const hash = await hashPassword(password);
    const result = await db.query(`
      INSERT INTO users (phone_number, display_name, password_hash, role)
      VALUES ($1, $2, $3, 'admin') RETURNING id, display_name, phone_number, role, is_active, created_at, last_login_at
    `, [phoneNumber, displayName, hash]);

    res.json({ success: true, admin: result.rows[0] });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/admins/:id', adminMiddleware, async (req, res) => {
  try {
    const targetId = req.params.id;
    const phoneNumber = typeof req.body?.phoneNumber === 'string' ? req.body.phoneNumber.trim() : '';
    const displayName = typeof req.body?.displayName === 'string' ? req.body.displayName.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const hasIsActive = typeof req.body?.isActive === 'boolean';
    const isActive = req.body?.isActive;

    const existingAdmin = await db.query(
      `SELECT id, phone_number, display_name, is_active FROM users WHERE id = $1 AND role = 'admin'`,
      [targetId]
    );
    if (existingAdmin.rows.length === 0) {
      return res.status(404).json({ error: 'Administrator account not found.' });
    }

    if (!phoneNumber || !displayName) {
      return res.status(400).json({ error: 'Username / phone number and display name are required.' });
    }
    if (phoneNumber.length > 20) {
      return res.status(400).json({ error: 'Username / phone number must be 20 characters or less.' });
    }
    if (displayName.length > 50) {
      return res.status(400).json({ error: 'Display name must be 50 characters or less.' });
    }
    if (password.length > 0 && password.trim().length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters.' });
    }

    const dupCheck = await db.query(
      `SELECT id FROM users WHERE phone_number = $1 AND id <> $2`,
      [phoneNumber, targetId]
    );
    if (dupCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Username or phone number is already in use by another account.' });
    }

    if (hasIsActive && isActive === false) {
      if (req.admin && req.admin.id === targetId) {
        return res.status(400).json({ error: 'You cannot deactivate your own admin account.' });
      }
      const activeOthers = await db.query(
        `SELECT COUNT(*) AS cnt FROM users WHERE role = 'admin' AND is_active = TRUE AND id <> $1`,
        [targetId]
      );
      if (parseInt(activeOthers.rows[0].cnt, 10) < 1) {
        return res.status(400).json({ error: 'Cannot deactivate the last remaining active administrator.' });
      }
    }

    const setClauses = ['phone_number = $1', 'display_name = $2', 'updated_at = NOW()'];
    const values = [phoneNumber, displayName];

    if (password.length > 0) {
      const hash = await hashPassword(password);
      values.push(hash);
      setClauses.push(`password_hash = $${values.length}`);
    }
    if (hasIsActive) {
      values.push(isActive);
      setClauses.push(`is_active = $${values.length}`);
    }

    values.push(targetId);
    const updated = await db.query(
      `UPDATE users SET ${setClauses.join(', ')}
       WHERE id = $${values.length} AND role = 'admin'
       RETURNING id, phone_number, display_name, role, is_active, created_at, last_login_at`,
      values
    );

    const updatedAdmin = updated.rows[0];
    const responsePayload = { success: true, admin: updatedAdmin };
    if (req.admin && req.admin.id === targetId) {
      responsePayload.token = generateToken({
        id: updatedAdmin.id,
        role: updatedAdmin.role,
        email: updatedAdmin.phone_number
      });
    }

    res.json(responsePayload);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/admins/:id', adminMiddleware, async (req, res) => {
  try {
    const targetId = req.params.id;
    if (req.admin && req.admin.id === targetId) {
      return res.status(400).json({ error: 'You cannot delete your own admin account.' });
    }

    const countRes = await db.query(`SELECT COUNT(*) AS cnt FROM users WHERE role = 'admin'`);
    if (parseInt(countRes.rows[0].cnt, 10) <= 1) {
      return res.status(400).json({ error: 'Cannot delete the last remaining administrator account.' });
    }

    const delRes = await db.query(`DELETE FROM users WHERE id = $1 AND role = 'admin' RETURNING id, display_name`, [targetId]);
    if (delRes.rowCount === 0) {
      return res.status(404).json({ error: 'Admin user not found.' });
    }

    res.json({ success: true, message: `Admin ${delRes.rows[0].display_name} deleted successfully.` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete admin: ' + err.message });
  }
});

// ── Withdrawals ──────────────────────────────────────────────────────────────

router.get('/withdrawals', adminMiddleware, adminReadLimiter, async (req, res) => {
  try {
    const { status, search, limit = 200 } = req.query;

    if (status && status !== 'all' && !ALLOWED_WITHDRAWAL_STATUSES.has(String(status))) {
      return res.status(400).json({ error: 'Invalid withdrawal status filter' });
    }

    const safeLimit = Math.min(200, Math.max(1, parseInt(limit, 10) || 200));
    const cleanSearch = typeof search === 'string' ? search.trim().slice(0, 100) : '';

    let query = `
      SELECT 
        w.*, 
        COALESCE(u.display_name, 'Unknown Player') AS user_name,
        u.phone_number AS user_phone,
        COALESCE(wal.balance, 0) AS user_balance,
        adm.display_name AS admin_name
      FROM withdrawal_requests w 
      LEFT JOIN users u ON w.user_id = u.id 
      LEFT JOIN wallets wal ON wal.user_id = w.user_id AND wal.mode = 'real'
      LEFT JOIN users adm ON w.admin_id = adm.id
    `;
    const params = [];
    const conditions = [];

    if (status && status !== 'all') {
      params.push(String(status));
      conditions.push(`w.status = $${params.length}`);
    }

    if (cleanSearch) {
      params.push(`%${cleanSearch}%`);
      conditions.push(`(u.display_name ILIKE $${params.length} OR w.phone_number ILIKE $${params.length} OR w.notes ILIKE $${params.length} OR CAST(w.id AS TEXT) ILIKE $${params.length})`);
    }

    if (conditions.length > 0) {
      query += ` WHERE ` + conditions.join(' AND ');
    }

    params.push(safeLimit);
    query += ` ORDER BY w.created_at DESC LIMIT $${params.length}`;

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Fetch withdrawals error:', err);
    res.status(500).json({ error: 'Failed to fetch withdrawals' });
  }
});

// Forensic Security Audit Log for Withdrawal Operations
router.get('/withdrawals/audit-logs', adminMiddleware, adminReadLimiter, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT id, admin_id, admin_username, action, target_type, target_ids,
              snapshot, ip_address, created_at
       FROM admin_audit_logs
       WHERE target_type = 'withdrawal'
       ORDER BY created_at DESC
       LIMIT 50`
    );
    res.json({ logs: result.rows });
  } catch (err) {
    console.error('Withdrawal audit log error:', err);
    res.status(500).json({ error: 'Failed to fetch withdrawal security audit logs' });
  }
});

// Single update (Approve / Reject) with password confirmation, concurrency protection & audit log
router.put('/withdrawals/:id', adminMiddleware, withdrawalMutationLimiter, async (req, res) => {
  const client = await db.getClient();
  try {
    const { id } = req.params;
    const { status, notes = '', confirmPassword } = req.body || {};

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be approved or rejected.' });
    }

    const pwCheck = await verifyAdminActionPassword(req.admin.id, confirmPassword);
    if (!pwCheck.ok) {
      return res.status(pwCheck.status).json({ error: pwCheck.error });
    }

    await client.query('BEGIN');

    // Row-level lock on the request to prevent race conditions & double processing
    const requestRes = await client.query(
      `SELECT * FROM withdrawal_requests WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (requestRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Withdrawal request not found' });
    }
    const request = requestRes.rows[0];

    if (request.status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Request already processed (Status: ${request.status})` });
    }

    const trimmedNotes = typeof notes === 'string' ? notes.trim().slice(0, 500) : '';
    await applyWithdrawalDecisions({
      client,
      items: [request],
      status,
      adminId: req.admin.id,
      adminUsername: pwCheck.adminName,
      action: status === 'approved' ? 'approve_withdrawal' : 'reject_withdrawal',
      trimmedNotes,
      req
    });

    await client.query('COMMIT');
    res.json({ success: true, status, id });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Update withdrawal error:', err);
    res.status(500).json({ error: 'Failed to update withdrawal request' });
  } finally {
    client.release();
  }
});

// Single Delete Withdrawal Request (requires password confirmation + immutable audit log)
router.delete('/withdrawals/:id', adminMiddleware, withdrawalMutationLimiter, async (req, res) => {
  const client = await db.getClient();
  try {
    const { id } = req.params;
    const refundPending = req.query.refundPending === 'true' || req.body?.refundPending === true;

    const pwCheck = await verifyAdminActionPassword(req.admin.id, req.body?.confirmPassword);
    if (!pwCheck.ok) {
      return res.status(pwCheck.status).json({ error: pwCheck.error });
    }

    await client.query('BEGIN');
    const delResult = await deleteWithdrawalsWithAudit({
      client,
      ids: [id],
      refundPending,
      adminId: req.admin.id,
      adminUsername: pwCheck.adminName,
      action: 'delete_withdrawal',
      req
    });

    if (!delResult.ok) {
      await client.query('ROLLBACK');
      return res.status(delResult.status).json({ error: delResult.error });
    }

    await client.query('COMMIT');
    res.json({ success: true, message: 'Withdrawal request deleted and logged', id: delResult.deletedIds[0] });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Delete withdrawal error:', err);
    res.status(500).json({ error: 'Failed to delete withdrawal request' });
  } finally {
    client.release();
  }
});

// Bulk Delete Withdrawal Requests (requires password confirmation + bounded batch + immutable audit log)
router.post('/withdrawals/bulk-delete', adminMiddleware, withdrawalMutationLimiter, async (req, res) => {
  const client = await db.getClient();
  try {
    const { ids, refundPending = false, confirmPassword } = req.body || {};

    const idCheck = validateUuidArray(ids, 'withdrawal request IDs');
    if (!idCheck.ok) {
      return res.status(400).json({ error: idCheck.error });
    }

    const pwCheck = await verifyAdminActionPassword(req.admin.id, confirmPassword);
    if (!pwCheck.ok) {
      return res.status(pwCheck.status).json({ error: pwCheck.error });
    }

    await client.query('BEGIN');
    const delResult = await deleteWithdrawalsWithAudit({
      client,
      ids: idCheck.uniqueIds,
      refundPending,
      adminId: req.admin.id,
      adminUsername: pwCheck.adminName,
      action: 'bulk_delete_withdrawals',
      req
    });

    if (!delResult.ok) {
      await client.query('ROLLBACK');
      return res.status(delResult.status).json({ error: delResult.error });
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      deletedCount: delResult.deletedIds.length,
      refundedCount: delResult.refundedCount,
      deletedIds: delResult.deletedIds
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Bulk delete withdrawals error:', err);
    res.status(500).json({ error: 'Failed to perform bulk delete' });
  } finally {
    client.release();
  }
});

// Bulk Update / Batch Process (requires password confirmation + bounded batch + immutable audit log)
router.post('/withdrawals/bulk-update', adminMiddleware, withdrawalMutationLimiter, async (req, res) => {
  const client = await db.getClient();
  try {
    const { ids, status, notes = '', confirmPassword } = req.body || {};

    const idCheck = validateUuidArray(ids, 'withdrawal request IDs');
    if (!idCheck.ok) {
      return res.status(400).json({ error: idCheck.error });
    }

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Status must be approved or rejected.' });
    }

    const pwCheck = await verifyAdminActionPassword(req.admin.id, confirmPassword);
    if (!pwCheck.ok) {
      return res.status(pwCheck.status).json({ error: pwCheck.error });
    }

    await client.query('BEGIN');

    // Fetch and lock pending requests
    const fetchRes = await client.query(
      `SELECT * FROM withdrawal_requests WHERE id = ANY($1::uuid[]) AND status = 'pending' FOR UPDATE`,
      [idCheck.uniqueIds]
    );

    if (fetchRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'No pending withdrawal requests found among selected IDs.' });
    }

    const trimmedNotes = typeof notes === 'string' ? notes.trim().slice(0, 500) : '';
    const processedIds = await applyWithdrawalDecisions({
      client,
      items: fetchRes.rows,
      status,
      adminId: req.admin.id,
      adminUsername: pwCheck.adminName,
      action: status === 'approved' ? 'bulk_approve_withdrawals' : 'bulk_reject_withdrawals',
      trimmedNotes,
      req
    });

    await client.query('COMMIT');

    res.json({
      success: true,
      status,
      processedCount: processedIds.length,
      processedIds
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Bulk update withdrawals error:', err);
    res.status(500).json({ error: 'Failed to perform bulk update' });
  } finally {
    client.release();
  }
});


module.exports = router;

