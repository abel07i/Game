const express = require('express');
const router = express.Router();
const db = require('./db');
const { hashPassword, verifyPassword, generateToken, adminMiddleware } = require('./adminAuth');

// ── Admin Auth ────────────────────────────────────────────────────────────────

router.post('/auth/login', async (req, res) => {
  try {
    const { phoneNumber, password } = req.body;
    if (!phoneNumber || !password)
      return res.status(400).json({ error: 'Phone number and password required' });

    const result = await db.query(
      `SELECT id, display_name, phone_number, password_hash, role FROM users
       WHERE phone_number = $1 AND role = 'admin'`,
      [phoneNumber]
    );

    if (result.rows.length === 0)
      return res.status(401).json({ error: 'Invalid credentials or not an admin' });

    const admin = result.rows[0];
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

router.get('/dashboard/stats', adminMiddleware, async (req, res) => {
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

router.get('/dashboard/recent-transactions', adminMiddleware, async (req, res) => {
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

router.get('/dashboard/recent-games', adminMiddleware, async (req, res) => {
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
    const { search, status, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
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

    const countResult = await db.query(
      `SELECT COUNT(*) FROM users u ${whereClause}`,
      params
    );

    const dataParams = [...params, parseInt(limit), offset];
    const result = await db.query(`
      SELECT
        u.id, u.display_name, u.phone_number, u.is_active, u.role,
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
      GROUP BY u.id, w.balance, w.total_deposited, w.total_withdrawn, w.total_wagered, w.total_won
      ORDER BY u.created_at DESC
      LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}
    `, dataParams);

    res.json({
      players: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit)
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
          t.id, r.room_number, r.tier, r.target_jackpot, t.seat_number,
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
      await db.query('SELECT * FROM fn_wallet_deposit($1, $2, $3, $4)', [id, parsedAmount, mode, null]);
    } else {
      await db.query('SELECT * FROM fn_wallet_withdraw($1, $2, $3, $4)', [id, Math.abs(parsedAmount), mode, null]);
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
    
    roomManager.startRoomGame(roomId);
    
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

router.get('/transactions', adminMiddleware, async (req, res) => {
  try {
    const { type, status, dateFrom, dateTo, search, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let whereClause = 'WHERE 1=1';
    const params = [];

    if (type)     { params.push(type);     whereClause += ` AND t.tx_type = $${params.length}`; }
    if (status)   { params.push(status);   whereClause += ` AND t.status = $${params.length}`; }
    if (dateFrom) { params.push(dateFrom); whereClause += ` AND t.created_at >= $${params.length}`; }
    if (dateTo)   { params.push(dateTo);   whereClause += ` AND t.created_at < ($${params.length}::DATE + INTERVAL '1 day')`; }
    if (search)   { params.push(`%${search}%`); whereClause += ` AND (u.display_name ILIKE $${params.length} OR u.phone_number ILIKE $${params.length})`; }

    const countResult = await db.query(`
      SELECT COUNT(*) FROM transactions t
      JOIN wallets w ON w.id = t.wallet_id
      JOIN users u ON u.id = w.user_id ${whereClause}
    `, params);

    const dataParams = [...params, parseInt(limit), offset];
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
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (err) {
    console.error('Transactions error:', err);
    res.status(500).json({ error: 'Failed to fetch transactions' });
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
      await db.query('UPDATE system_config SET config_value = $1 WHERE config_key = $2', [telebirrPhone, 'TELEBIRR_PHONE']);
    }
    if (telebirrName !== undefined) {
      await db.query('UPDATE system_config SET config_value = $1 WHERE config_key = $2', [telebirrName, 'TELEBIRR_NAME']);
    }
    if (verifyEtApiKey !== undefined) {
      await db.query('UPDATE system_config SET config_value = $1 WHERE config_key = $2', [verifyEtApiKey, 'VERIFY_ET_API_KEY']);
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
    const { phoneNumber, displayName, password } = req.body;
    if (!phoneNumber || !displayName || !password)
      return res.status(400).json({ error: 'All fields required' });

    const existing = await db.query(`SELECT id FROM users WHERE phone_number = $1`, [phoneNumber]);
    if (existing.rows.length > 0)
      return res.status(400).json({ error: 'Phone number already registered' });

    const hash = await hashPassword(password);
    const result = await db.query(`
      INSERT INTO users (phone_number, display_name, password_hash, role)
      VALUES ($1, $2, $3, 'admin') RETURNING id, display_name, phone_number, created_at
    `, [phoneNumber, displayName, hash]);

    res.json({ success: true, admin: result.rows[0] });
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

router.get('/withdrawals', adminMiddleware, async (req, res) => {
  try {
    const { status, search } = req.query;
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
      params.push(status);
      conditions.push(`w.status = $${params.length}`);
    }

    if (search && search.trim()) {
      params.push(`%${search.trim()}%`);
      conditions.push(`(u.display_name ILIKE $${params.length} OR w.phone_number ILIKE $${params.length} OR w.notes ILIKE $${params.length} OR CAST(w.id AS TEXT) ILIKE $${params.length})`);
    }

    if (conditions.length > 0) {
      query += ` WHERE ` + conditions.join(' AND ');
    }

    query += ` ORDER BY w.created_at DESC`;

    const result = await db.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Fetch withdrawals error:', err);
    res.status(500).json({ error: 'Failed to fetch withdrawals' });
  }
});

// Single update (Approve / Reject) with concurrency protection & transaction
router.put('/withdrawals/:id', adminMiddleware, async (req, res) => {
  const client = await db.getClient();
  try {
    const { id } = req.params;
    const { status, notes = '' } = req.body;
    const adminId = req.admin ? req.admin.id : null;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be approved or rejected.' });
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

    // Verify admin ID if present to satisfy foreign key constraint
    let validAdminId = null;
    if (adminId) {
      const adminCheck = await client.query(`SELECT id FROM users WHERE id = $1`, [adminId]);
      if (adminCheck.rows.length > 0) validAdminId = adminCheck.rows[0].id;
    }

    const trimmedNotes = notes ? notes.trim() : '';

    if (status === 'rejected') {
      const refundAmount = parseFloat(request.amount);
      const refundNote = trimmedNotes ? `Withdrawal rejected: ${trimmedNotes}` : 'Withdrawal rejected/refunded by Admin';

      // Atomic refund via stored procedure
      const refundRes = await client.query(
        `SELECT * FROM fn_wallet_refund($1, $2, 'real', $3)`,
        [request.user_id, refundAmount, refundNote]
      );

      if (!refundRes.rows[0]?.success) {
        await client.query('ROLLBACK');
        return res.status(500).json({ error: 'Failed to refund user balance' });
      }
    } else if (status === 'approved') {
      // Update linked transaction note if available
      const payoutNote = trimmedNotes ? `Withdrawal paid via Telebirr (${trimmedNotes})` : `Withdrawal paid via Telebirr`;
      if (request.transaction_id) {
        await client.query(
          `UPDATE transactions SET reference_note = $1, status = 'completed' WHERE id = $2`,
          [payoutNote, request.transaction_id]
        );
      }
    }

    await client.query(
      `UPDATE withdrawal_requests SET status = $1, admin_id = $2, notes = $3, updated_at = NOW() WHERE id = $4`,
      [status, validAdminId, trimmedNotes || null, id]
    );

    await client.query('COMMIT');

    res.json({ success: true, status, id });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Update withdrawal error:', err);
    res.status(400).json({ error: err.message || 'Failed to update withdrawal request' });
  } finally {
    client.release();
  }
});

// Single Delete Withdrawal Request
router.delete('/withdrawals/:id', adminMiddleware, async (req, res) => {
  const client = await db.getClient();
  try {
    const { id } = req.params;
    const refundPending = req.query.refundPending === 'true' || req.body?.refundPending === true;

    await client.query('BEGIN');

    const checkRes = await client.query(`SELECT * FROM withdrawal_requests WHERE id = $1 FOR UPDATE`, [id]);
    if (checkRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Withdrawal request not found' });
    }
    const request = checkRes.rows[0];

    // If pending and refund requested, refund first
    if (request.status === 'pending') {
      if (!refundPending) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: 'This withdrawal request is currently PENDING. Deleting it would leave the user without their funds. To automatically refund the player before deleting, confirm with refundPending=true, or reject it first.'
        });
      }

      const refundAmount = parseFloat(request.amount);
      await client.query(
        `SELECT * FROM fn_wallet_refund($1, $2, 'real', $3)`,
        [request.user_id, refundAmount, `Withdrawal #${id.slice(0, 8)} deleted & refunded by Admin`]
      );
    }

    await client.query(`DELETE FROM withdrawal_requests WHERE id = $1`, [id]);
    await client.query('COMMIT');

    res.json({ success: true, message: 'Withdrawal request deleted successfully', id });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Delete withdrawal error:', err);
    res.status(500).json({ error: err.message || 'Failed to delete withdrawal request' });
  } finally {
    client.release();
  }
});

// Bulk Delete Withdrawal Requests
router.post('/withdrawals/bulk-delete', adminMiddleware, async (req, res) => {
  const client = await db.getClient();
  try {
    const { ids, refundPending = false } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Please provide an array of withdrawal request IDs to delete.' });
    }

    await client.query('BEGIN');

    // Fetch all requests to delete with row lock
    const fetchRes = await client.query(
      `SELECT * FROM withdrawal_requests WHERE id = ANY($1::uuid[]) FOR UPDATE`,
      [ids]
    );

    if (fetchRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'No matching withdrawal requests found.' });
    }

    let refundedCount = 0;
    const pendingList = fetchRes.rows.filter(r => r.status === 'pending');

    if (pendingList.length > 0 && !refundPending) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `Selected items contain ${pendingList.length} PENDING request(s). Please confirm refunding them prior to deletion (set refundPending: true).`
      });
    }

    // Refund any pending requests if requested
    for (const reqItem of pendingList) {
      const refundAmount = parseFloat(reqItem.amount);
      await client.query(
        `SELECT * FROM fn_wallet_refund($1, $2, 'real', $3)`,
        [reqItem.user_id, refundAmount, `Withdrawal #${reqItem.id.slice(0, 8)} deleted & refunded by Admin`]
      );
      refundedCount++;
    }

    // Execute bulk deletion
    const delRes = await client.query(
      `DELETE FROM withdrawal_requests WHERE id = ANY($1::uuid[]) RETURNING id`,
      [ids]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      deletedCount: delRes.rowCount,
      refundedCount,
      deletedIds: delRes.rows.map(r => r.id)
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Bulk delete withdrawals error:', err);
    res.status(500).json({ error: err.message || 'Failed to perform bulk delete.' });
  } finally {
    client.release();
  }
});

// Bulk Update / Batch Process (Approve / Reject multiple)
router.post('/withdrawals/bulk-update', adminMiddleware, async (req, res) => {
  const client = await db.getClient();
  try {
    const { ids, status, notes = '' } = req.body;
    const adminId = req.admin ? req.admin.id : null;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Please provide an array of withdrawal request IDs.' });
    }

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Status must be approved or rejected.' });
    }

    await client.query('BEGIN');

    // Verify admin ID
    let validAdminId = null;
    if (adminId) {
      const adminCheck = await client.query(`SELECT id FROM users WHERE id = $1`, [adminId]);
      if (adminCheck.rows.length > 0) validAdminId = adminCheck.rows[0].id;
    }

    // Fetch and lock pending requests
    const fetchRes = await client.query(
      `SELECT * FROM withdrawal_requests WHERE id = ANY($1::uuid[]) AND status = 'pending' FOR UPDATE`,
      [ids]
    );

    if (fetchRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'No pending withdrawal requests found among selected IDs.' });
    }

    const trimmedNotes = notes ? notes.trim() : '';

    for (const reqItem of fetchRes.rows) {
      if (status === 'rejected') {
        const refundAmount = parseFloat(reqItem.amount);
        const refundNote = trimmedNotes ? `Withdrawal rejected: ${trimmedNotes}` : 'Withdrawal rejected/refunded by Admin';
        await client.query(
          `SELECT * FROM fn_wallet_refund($1, $2, 'real', $3)`,
          [reqItem.user_id, refundAmount, refundNote]
        );
      } else if (status === 'approved' && reqItem.transaction_id) {
        const payoutNote = trimmedNotes ? `Withdrawal paid via Telebirr (${trimmedNotes})` : `Withdrawal paid via Telebirr`;
        await client.query(
          `UPDATE transactions SET reference_note = $1, status = 'completed' WHERE id = $2`,
          [payoutNote, reqItem.transaction_id]
        );
      }
    }

    const processedIds = fetchRes.rows.map(r => r.id);
    await client.query(
      `UPDATE withdrawal_requests 
       SET status = $1, admin_id = $2, notes = $3, updated_at = NOW() 
       WHERE id = ANY($4::uuid[])`,
      [status, validAdminId, trimmedNotes || null, processedIds]
    );

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
    res.status(500).json({ error: err.message || 'Failed to perform bulk update.' });
  } finally {
    client.release();
  }
});


module.exports = router;

