const db = require('./db');
const drawEngine = require('./drawEngine');

class RoomManager {
  constructor() {
    this.rooms = new Map();   // roomId -> room object (in-memory cache)
    this.io = null;
    this.syncInterval = null;
  }

  setIo(io) {
    this.io = io;
  }

  // ─── Startup: Load all active rooms from DB into memory cache ─────────────
  async loadActiveRooms() {
    const res = await db.query('SELECT * FROM vw_active_rooms');
    for (const r of res.rows) {
      if (this.rooms.has(r.id)) continue;

      // Fetch current tickets/seats for this room
      const tRes = await db.query(`
        SELECT t.seat_number, u.display_name AS username, t.user_id
        FROM tickets t
        JOIN users u ON u.id = t.user_id
        WHERE t.room_id = $1 AND t.is_refunded = FALSE
      `, [r.id]);

      const roomObj = {
        id: r.id,
        roomNumber: r.room_number,
        tierCategory: r.tier,
        targetJackpot: parseFloat(r.target_jackpot),
        groupSize: r.group_size,
        ticketPrice: parseFloat(r.ticket_price),
        filledSeats: tRes.rows.length,
        timeRemaining: Math.max(1, parseInt(r.seconds_remaining) || 60),
        maxSeatsPerUser: r.max_seats_per_player,
        status: r.status,
        createdAt: r.created_at || new Date().toISOString(),
        seats: tRes.rows.map(t => ({
          seatNumber: t.seat_number,
          username: t.username,
          userId: t.user_id
        })),
        isProcessing: false
      };

      this.rooms.set(r.id, roomObj);
    }

    console.log(`🗂️  Loaded ${this.rooms.size} active rooms into memory cache.`);
    await this.ensureStarterRooms();
    this.startTick();
  }

  // ─── 1-Second Timer Tick (60-Second Game Cycle) ───────────────────────────
  startTick() {
    if (this.syncInterval) clearInterval(this.syncInterval);
    this.syncInterval = setInterval(() => this.tickRooms(), 1000);
  }

  async tickRooms() {
    for (const [roomId, room] of this.rooms.entries()) {
      if (room.status !== 'open' || room.filledSeats === 0) continue;

      room.timeRemaining -= 1;

      const uniquePlayers = new Set(room.seats.map(s => s.userId)).size;

      // Broadcast 1-second tick to all connected players
      if (this.io) {
        this.io.emit('room:time_tick', {
          roomId,
          roomNumber: room.roomNumber,
          timeRemaining: Math.max(0, room.timeRemaining),
          filledSeats: room.filledSeats,
          groupSize: room.groupSize,
          playerCount: uniquePlayers
        });
      }

      // Auto-replenish starter rooms if needed
      if (Math.random() < 0.1) {
        this.ensureStarterRooms().catch(() => {});
      }

      // Check if all spaces are filled: game only begins when all seats are filled!
      if (room.filledSeats >= room.groupSize) {
        if (uniquePlayers >= 2) {
          console.log(`⚡ All spaces filled for Game #${room.roomNumber} (${room.filledSeats}/${room.groupSize} seats). Starting game!`);
          this.startRoomGame(roomId);
        } else {
          console.log(`⏳ Game #${room.roomNumber} all seats filled but waiting for ≥2 distinct players.`);
        }
      } else if (room.timeRemaining <= 0) {
        // All spaces are not filled yet: do NOT begin, keep waiting for players to fill all seats
        room.timeRemaining = 60; // Reset wait cycle
        console.log(`⏳ Game #${room.roomNumber} waiting for all spaces to be filled (${room.filledSeats}/${room.groupSize} filled).`);
        if (this.io) {
          this.io.emit('room:waiting_for_players', {
            roomId,
            roomNumber: room.roomNumber,
            filledSeats: room.filledSeats,
            groupSize: room.groupSize,
            currentPlayers: uniquePlayers,
            requiredSeats: room.groupSize
          });
          this.io.emit('room:state_update', this.getRoomSummaries());
        }
      }
    }
  }

  // ─── Create a new game room (New Game Cycle with unique Game ID) ───────────
  async createRoom(tierCategory, targetJackpot, groupSize, maxSeatsPerPlayer = null, roundDurationSeconds = 60, customTicketPrice = null) {
    const ticketPrice = customTicketPrice ? parseFloat(customTicketPrice) : parseFloat((targetJackpot / groupSize).toFixed(2));

    const res = await db.query(`
      INSERT INTO rooms (tier, target_jackpot, group_size, ticket_price, max_seats_per_player, round_duration_seconds)
      VALUES ($1, $2, $3, $4, COALESCE($5, (SELECT max_seats_per_user FROM seat_quotas WHERE group_size = $3 LIMIT 1), 2), $6)
      RETURNING *
    `, [tierCategory, targetJackpot, groupSize, ticketPrice, maxSeatsPerPlayer, roundDurationSeconds || 60]);

    const r = res.rows[0];
    const roomObj = {
      id: r.id,
      roomNumber: r.room_number,
      tierCategory: r.tier,
      targetJackpot: parseFloat(r.target_jackpot),
      groupSize: r.group_size,
      ticketPrice: parseFloat(r.ticket_price),
      filledSeats: 0,
      timeRemaining: parseInt(r.round_duration_seconds) || 60,
      maxSeatsPerUser: r.max_seats_per_player,
      status: r.status,
      seats: [],
      createdAt: r.created_at || new Date().toISOString(),
      isProcessing: false
    };

    this.rooms.set(r.id, roomObj);

    if (this.io) {
      this.io.emit('room:state_update', this.getRoomSummaries());
    }

    return roomObj;
  }

  // ─── Update an open game room ─────────────────────────────────────────────
  async updateRoom(roomId, updates = {}) {
    const room = this.rooms.get(roomId);
    if (!room) {
      const dbRoom = await db.query('SELECT * FROM rooms WHERE id = $1', [roomId]);
      if (dbRoom.rows.length === 0) throw new Error('Game room not found');
      if (dbRoom.rows[0].status !== 'open') throw new Error('Only open rooms can be updated');
    } else if (room.status !== 'open') {
      throw new Error('Only open game rooms can be updated');
    }

    const fields = [];
    const values = [];

    if (updates.timeRemaining !== undefined && room) {
      room.timeRemaining = Math.max(1, parseInt(updates.timeRemaining));
    }

    if (updates.maxSeatsPerUser !== undefined) {
      const quota = parseInt(updates.maxSeatsPerUser);
      if (room) room.maxSeatsPerUser = quota;
      fields.push(`max_seats_per_player = $${fields.length + 1}`);
      values.push(quota);
    }

    // Only allow updating pricing/jackpot if 0 seats are filled
    const currentFilled = room ? room.filledSeats : 0;
    if (currentFilled === 0) {
      if (updates.targetJackpot !== undefined) {
        const jackpot = parseFloat(updates.targetJackpot);
        if (room) room.targetJackpot = jackpot;
        fields.push(`target_jackpot = $${fields.length + 1}`);
        values.push(jackpot);
      }
      if (updates.ticketPrice !== undefined) {
        const price = parseFloat(updates.ticketPrice);
        if (room) room.ticketPrice = price;
        fields.push(`ticket_price = $${fields.length + 1}`);
        values.push(price);
      }
      if (updates.groupSize !== undefined) {
        const size = parseInt(updates.groupSize);
        if (room) room.groupSize = size;
        fields.push(`group_size = $${fields.length + 1}`);
        values.push(size);
      }
      if (updates.tierCategory !== undefined) {
        if (room) room.tierCategory = updates.tierCategory;
        fields.push(`tier = $${fields.length + 1}`);
        values.push(updates.tierCategory);
      }
    }

    if (fields.length > 0) {
      values.push(roomId);
      await db.query(`UPDATE rooms SET ${fields.join(', ')} WHERE id = $${values.length}`, values);
    }

    if (this.io) {
      this.io.emit('room:state_update', this.getRoomSummaries());
    }

    return room || { id: roomId, success: true };
  }

  // ─── Delete / Cancel a game room ──────────────────────────────────────────
  async deleteRoom(roomId) {
    // Check if tickets were purchased
    const ticketCheck = await db.query('SELECT COUNT(*) FROM tickets WHERE room_id = $1 AND is_refunded = FALSE', [roomId]);
    const soldTickets = parseInt(ticketCheck.rows[0].count);

    if (soldTickets > 0) {
      // Refund all players atomically
      await db.query('SELECT * FROM fn_refund_room($1)', [roomId]);
      await db.query(`UPDATE rooms SET status = 'refunded' WHERE id = $1`, [roomId]);
      if (this.io) {
        this.io.emit('room:refunded', { roomId, reason: 'Room cancelled & refunded by admin' });
      }
    } else {
      // Safe to delete if no tickets were purchased
      await db.query('DELETE FROM rooms WHERE id = $1', [roomId]).catch(async () => {
        await db.query(`UPDATE rooms SET status = 'refunded' WHERE id = $1`, [roomId]);
      });
    }

    this.rooms.delete(roomId);

    if (this.io) {
      this.io.emit('room:state_update', this.getRoomSummaries());
    }

    return { success: true, refundedTickets: soldTickets };
  }

  // ─── Join a Room — Enforces limits & atomic seat allocation ────────────────
  async joinRoom(roomId, userId, seatCount, mode, username = 'Anonymous', requestedSeats = null) {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error('Game not found');
    if (room.status !== 'open') throw new Error(`Game #${room.roomNumber} has already started and closed joining.`);

    // Enforce real player validation: reject any bot or non-registered account
    const userCheck = await db.query('SELECT role, display_name FROM users WHERE id = $1', [userId]);
    if (userCheck.rows.length === 0 || userCheck.rows[0].role !== 'player') {
      throw new Error('Only registered real players can join games.');
    }
    if (userCheck.rows[0].display_name) {
      username = userCheck.rows[0].display_name;
    }

    // Enforce maximum player / seat limit
    if (room.filledSeats >= room.groupSize || room.filledSeats + seatCount > room.groupSize) {
      throw new Error(`Game #${room.roomNumber} has reached its maximum player limit (${room.filledSeats}/${room.groupSize}). Please join the next game.`);
    }

    // If caller requested specific seat numbers, validate availability in cache
    if (requestedSeats && requestedSeats.length > 0) {
      for (const seatNum of requestedSeats) {
        if (room.seats.some(s => s.seatNumber === seatNum)) {
          throw new Error(`Seat ${seatNum} is already taken in Game #${room.roomNumber}`);
        }
      }
    }

    // Atomic DB stored proc: locks wallet, debits, creates tickets, records ledger
    const res = await db.query(
      'SELECT * FROM fn_purchase_seats($1, $2, $3, $4, $5)',
      [roomId, userId, seatCount, mode, requestedSeats && requestedSeats.length > 0 ? requestedSeats : null]
    );

    const result = res.rows[0];
    if (!result.success) {
      throw new Error(result.error_message || 'Purchase failed');
    }

    const assignedSeats = result.seat_numbers;

    // Update in-memory cache
    const newSeats = assignedSeats.map(num => ({ seatNumber: num, username, userId }));
    room.filledSeats += assignedSeats.length;
    room.seats.push(...newSeats);

    const uniquePlayers = new Set(room.seats.map(s => s.userId)).size;

    // Broadcast seat claim and updated player count
    if (this.io) {
      this.io.emit('room:seat_claimed', {
        roomId,
        roomNumber: room.roomNumber,
        filledSeats: room.filledSeats,
        groupSize: room.groupSize,
        playerCount: uniquePlayers,
        newSeats
      });
      this.io.emit('room:state_update', this.getRoomSummaries());
    }

    // Check maximum player limit: if room is full (groupSize reached) & has ≥ 2 players, start immediately!
    if (room.filledSeats >= room.groupSize && uniquePlayers >= 2) {
      console.log(`⚡ Game #${room.roomNumber} reached max players limit (${room.filledSeats}/${room.groupSize}). Starting game immediately!`);
      setImmediate(() => this.startRoomGame(roomId));
    }

    return { newBalance: parseFloat(result.new_balance), assignedSeats };
  }

  // ─── Start Game: Close Joining & Immediately Open Next Game Cycle ─────────
  async startRoomGame(roomId) {
    const room = this.rooms.get(roomId);
    if (!room || room.status !== 'open') return;

    // 1. Close player joining for this game
    room.status = 'drawing';

    // 2. Immediately create the next game cycle so other players can join the next round
    const nextGame = await this.createRoom(room.tierCategory, room.targetJackpot, room.groupSize);
    console.log(`🚀 Game #${room.roomNumber} started! Created next cycle Game #${nextGame.roomNumber} (ID: ${nextGame.id}).`);

    // 3. Mark room as 'drawing' in PostgreSQL
    await db.query(`UPDATE rooms SET status = 'drawing', draw_started_at = NOW() WHERE id = $1`, [roomId]);

    // 4. Broadcast game start to all clients
    if (this.io) {
      this.io.emit('draw:started', {
        roomId,
        roomNumber: room.roomNumber,
        totalSeats: room.filledSeats,
        groupSize: room.groupSize,
        tierCategory: room.tierCategory,
        targetJackpot: room.targetJackpot,
        nextGameId: nextGame.id,
        nextRoomNumber: nextGame.roomNumber
      });
      this.io.emit('room:state_update', this.getRoomSummaries());
    }

    // 5. Run draw & settlement
    await this.resolveRoom(roomId);
  }

  // ─── Resolve Game: Pick Winner, Settle 15% Platform Fee, Credit Winner ────
  async resolveRoom(roomId) {
    try {
      const room = this.rooms.get(roomId);
      if (!room) return;

      // Fetch all tickets for this room from DB (ground truth)
      const tRes = await db.query(`
        SELECT t.id, t.user_id, t.mode, t.seat_number, u.display_name AS username
        FROM tickets t
        JOIN users u ON u.id = t.user_id
        WHERE t.room_id = $1 AND t.is_refunded = FALSE
      `, [roomId]);

      const dbTickets = tRes.rows.map(t => ({
        id: t.id,
        userId: t.user_id,
        mode: t.mode,
        seatNumber: t.seat_number,
        username: t.username
      }));

      // Require all seats to be filled before resolving
      if (dbTickets.length < room.groupSize) {
        console.warn(`⚠️ Game #${room.roomNumber} has < all seats filled (${dbTickets.length}/${room.groupSize}). Cannot resolve until full.`);
        room.status = 'open';
        return;
      }

      // Require ≥ 2 distinct real players
      const uniqueUsers = new Set(dbTickets.map(t => t.userId)).size;
      if (uniqueUsers < 2) {
        console.warn(`⚠️ Game #${room.roomNumber} has < 2 players at resolution. Refunding.`);
        await db.query('SELECT * FROM fn_refund_room($1)', [roomId]);
        await db.query(`UPDATE rooms SET status = 'refunded' WHERE id = $1`, [roomId]);
        if (this.io) this.io.emit('room:refunded', { roomId, reason: 'Insufficient players' });
        this.rooms.delete(roomId);
        return;
      }

      // 6-second exciting draw suspense delay
      await new Promise(resolve => setTimeout(resolve, 6000));

      // Provably fair winner selection among joined tickets
      const winnerTicket = drawEngine.selectWinner(dbTickets, 'real', null);

      // Atomic DB settlement: 15% fee to treasury, 85% to winner wallet
      const settleRes = await db.query(
        'SELECT * FROM fn_settle_room($1, $2)',
        [roomId, winnerTicket.id]
      );

      const settlement = settleRes.rows[0];
      if (!settlement.success) {
        throw new Error(settlement.error_message || 'Settlement failed');
      }

      // Persist provably fair seeds for auditability
      if (winnerTicket.serverSeed) {
        await db.query(
          `UPDATE rooms SET server_seed = $1, server_seed_hash = $2, client_seed = $3, nonce = $4 WHERE id = $5`,
          [winnerTicket.serverSeed, winnerTicket.serverSeedHash, winnerTicket.clientSeed, winnerTicket.nonce, roomId]
        ).catch(e => console.error('Failed to persist provably fair seeds:', e));
      }

      // Broadcast winner to all players
      if (this.io) {
        this.io.emit('draw:winner_revealed', {
          roomId,
          roomNumber: room.roomNumber,
          groupSize: room.groupSize,
          winnerUsername: winnerTicket.username,
          winnerUserId: winnerTicket.userId,
          winnerSeatNumber: winnerTicket.seatNumber,
          participantUserIds: dbTickets.map(t => t.userId),
          grossPool: parseFloat(settlement.gross_pool_out),
          platformFee: parseFloat(settlement.platform_fee_out),
          netPayout: parseFloat(settlement.net_payout_out),
          winnerBalance: parseFloat(settlement.winner_new_balance),
          tierCategory: room.tierCategory,
          targetJackpot: room.targetJackpot,
          serverSeedHash: winnerTicket.serverSeedHash,
          clientSeed: winnerTicket.clientSeed,
          nonce: winnerTicket.nonce
        });

        this.io.emit('feed:big_win', {
          username: winnerTicket.username,
          amount: parseFloat(settlement.net_payout_out),
          tierCategory: room.tierCategory
        });

        room.status = 'settled';
        this.io.emit('room:state_update', this.getRoomSummaries());
      }

      console.log(`🏆 Game #${room.roomNumber} settled! Winner: ${winnerTicket.username} (Seat #${winnerTicket.seatNumber}) -> ${settlement.net_payout_out} ETB`);

      // Clean up settled room from memory cache after 5 seconds so players can review the result
      setTimeout(() => {
        this.rooms.delete(roomId);
        if (this.io) this.io.emit('room:state_update', this.getRoomSummaries());
      }, 5000);

    } catch (err) {
      console.error(`❌ Failed to resolve game ${roomId}:`, err);
    }
  }

  // ─── Return live room list for API & sockets (All Always-Open Rooms) ──
  getRoomSummaries() {
    return Array.from(this.rooms.values())
      .filter(r => r.status === 'open' || r.status === 'drawing')
      .map(r => ({
        id: r.id,
        roomNumber: r.roomNumber,
        gameId: `Game #${r.roomNumber}`,
        tierCategory: r.tierCategory,
        targetJackpot: r.targetJackpot,
        groupSize: r.groupSize,
        ticketPrice: r.ticketPrice,
        filledSeats: r.filledSeats,
        playerCount: new Set((r.seats || []).map(s => s.userId)).size,
        seats: r.seats || [],
        timeRemaining: Math.max(0, r.timeRemaining),
        maxSeatsPerUser: r.maxSeatsPerUser,
        status: r.status,
        createdAt: r.createdAt || new Date().toISOString()
      }))
      .sort((a, b) => {
        if (a.status === 'drawing' && b.status !== 'drawing') return -1;
        if (b.status === 'drawing' && a.status !== 'drawing') return 1;
        if (a.groupSize !== b.groupSize) return a.groupSize - b.groupSize;
        return (b.roomNumber || 0) - (a.roomNumber || 0);
      });
  }

  // ─── Ensure rooms for 5, 10, 15, 20, 40, 50, 60, 80 are ALWAYS open ────────
  async ensureStarterRooms() {
    const starterConfigs = [
      { size: 5,  jackpot: 500,  tier: 'starter' },
      { size: 10, jackpot: 500,  tier: 'starter' },
      { size: 15, jackpot: 500,  tier: 'starter' },
      { size: 20, jackpot: 500,  tier: 'starter' },
      { size: 40, jackpot: 500,  tier: 'starter' },
      { size: 50, jackpot: 500,  tier: 'starter' },
      { size: 60, jackpot: 500,  tier: 'starter' },
      { size: 80, jackpot: 500,  tier: 'starter' },
      { size: 5,  jackpot: 1000, tier: 'bronze' },
      { size: 10, jackpot: 1000, tier: 'bronze' },
      { size: 15, jackpot: 1000, tier: 'bronze' },
      { size: 20, jackpot: 1000, tier: 'bronze' },
      { size: 40, jackpot: 1000, tier: 'bronze' },
      { size: 50, jackpot: 1000, tier: 'bronze' },
      { size: 80, jackpot: 1000, tier: 'bronze' }
    ];

    let createdCount = 0;
    for (const cfg of starterConfigs) {
      const exists = Array.from(this.rooms.values()).some(
        r => r.status === 'open' && r.groupSize === cfg.size && Math.round(r.targetJackpot) === Math.round(cfg.jackpot)
      );
      if (!exists) {
        await this.createRoom(cfg.tier, cfg.jackpot, cfg.size);
        createdCount++;
      }
    }

    if (createdCount > 0) {
      console.log(`✅ Ensured starter rooms: created ${createdCount} missing rooms.`);
    }
  }
}

const roomManager = new RoomManager();
module.exports = roomManager;
