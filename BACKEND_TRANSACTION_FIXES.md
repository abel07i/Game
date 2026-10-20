# Backend Transaction & Race Condition Fixes

## Critical Issues & Fixes

### Issue #1: Double-Start Race Condition in tickRooms()

**File**: `backend/src/roomManager.js` (Line ~78-95)

**Problem**: Multiple concurrent `tickRooms()` calls can trigger `startRoomGame()` for the same room multiple times, causing:
- Duplicate draw:started events
- Multiple winners selected
- Conflicting payout calculations

**Current Code**:
```javascript
tickRooms() {
    for (const [roomId, room] of this.rooms) {
        if (room.timeRemaining <= 0 && canStart) {
            this.startRoomGame(roomId); // ← Can be called multiple times
        }
    }
}
```

**Fix**:
```javascript
tickRooms() {
    for (const [roomId, room] of this.rooms) {
        // Skip if already being processed
        if (room.isProcessing) continue;
        
        if (room.timeRemaining <= 0 && canStart) {
            room.isProcessing = true;
            try {
                this.startRoomGame(roomId);
            } finally {
                room.isProcessing = false;
            }
        }
    }
}
```

**Required Changes**:
1. Initialize `room.isProcessing = false` when creating rooms
2. Add `isProcessing` flag check before processing
3. Set flag to prevent concurrent starts

---

### Issue #2: Seat Purchase Not Protected by Transaction

**File**: `backend/src/roomManager.js` (Line ~242-310)

**Problem**: While `fn_purchase_seats()` is a stored procedure, there's no database-level locking to prevent:
- Two users claiming the same seat simultaneously
- Both requests passing the cache check but only one recording in DB

**Current Code**:
```javascript
async joinRoom(roomId, userId, seatCount, mode, ...) {
    // Cache validation (can be stale)
    if (room.seats.some(s => s.seatNumber === seatNum)) {
        throw new Error(...);
    }
    
    // DB call might allow duplicate
    await db.query('SELECT * FROM fn_purchase_seats(...)', [roomId, userId, ...]);
}
```

**Fix**: Verify the stored procedure uses:
```sql
BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE
-- Lock the seats table
SELECT * FROM seats WHERE room_id = room_id FOR UPDATE
-- Check availability
-- Create tickets
COMMIT
```

**Action**: Verify `fn_purchase_seats()` in database schema includes SERIALIZABLE transaction and row locks.

---

### Issue #3: Double-Spending in Telebirr Deposits

**File**: `backend/src/walletLedger.js` (Line ~29-42)

**Problem**: Same Telebirr transactionId can be processed twice if both requests arrive simultaneously:
```javascript
async depositTelebirr(userId, amount, transactionId) {
    // Check if already processed
    const existing = await db.query('SELECT * FROM external_deposits WHERE transaction_id = $1', [transactionId]);
    if (existing.rows.length > 0) return; // ← Race condition window
    
    // Both requests can pass the check above, then both INSERT
    await db.query('INSERT INTO external_deposits (...)', [...]);
    
    // Both succeed in crediting wallet
    return this.deposit(userId, amount, 'real');
}
```

**Fix**:
```javascript
async depositTelebirr(userId, amount, transactionId) {
    const client = await db.getClient(); // Get transaction-aware client
    try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
        
        // Atomic check-and-insert
        const existing = await client.query(
            'SELECT * FROM external_deposits WHERE transaction_id = $1 FOR UPDATE',
            [transactionId]
        );
        if (existing.rows.length > 0) {
            await client.query('ROLLBACK');
            throw new Error('Transaction already processed');
        }
        
        await client.query(
            'INSERT INTO external_deposits (user_id, transaction_id, amount) VALUES ($1, $2, $3)',
            [userId, transactionId, amount]
        );
        
        const balance = await this.deposit(userId, amount, 'real');
        await client.query('COMMIT');
        return balance;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}
```

---

### Issue #4: Room Stuck in 'drawing' State

**File**: `backend/src/roomManager.js` (Line ~105-115)

**Problem**: If `resolveRoom()` fails or crashes, the room remains in 'drawing' state forever:
- No new games can start with same room
- Players can't join
- Manual intervention required

**Current Code**:
```javascript
async startRoomGame(roomId) {
    await db.query("UPDATE rooms SET status = 'drawing' WHERE id = $1", [roomId]);
    
    try {
        await this.resolveRoom(roomId); // ← If this crashes, room stays in 'drawing'
    } catch (err) {
        console.error(err);
    }
}
```

**Fix**:
```javascript
async startRoomGame(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error('Room not found');
    
    room.drawTimeout = setTimeout(async () => {
        // Recovery: if resolveRoom takes >30s, mark as failed and create new room
        await db.query("UPDATE rooms SET status = 'failed' WHERE id = $1", [roomId]);
        console.error(`Room ${roomId} draw timed out - marked as failed`);
        this.rooms.delete(roomId);
    }, 30000);
    
    await db.query("UPDATE rooms SET status = 'drawing' WHERE id = $1", [roomId]);
    
    try {
        await this.resolveRoom(roomId);
        clearTimeout(room.drawTimeout);
    } catch (err) {
        console.error(`Game resolve failed for room ${roomId}:`, err);
        clearTimeout(room.drawTimeout);
        await db.query("UPDATE rooms SET status = 'error' WHERE id = $1", [roomId]);
        this.rooms.delete(roomId);
    }
}
```

---

### Issue #5: Incorrect Unique Player Count

**File**: `backend/src/roomManager.js` (Line ~223)

**Problem**: Using in-memory cache instead of DB query for player count validation:
```javascript
const uniquePlayers = new Set(room.seats.map(s => s.userId)).size;

if (uniquePlayers >= 2) {
    // Start game - but cache could be stale!
}
```

**Fix**:
```javascript
async validatePlayerCount(roomId) {
    const result = await db.query(`
        SELECT COUNT(DISTINCT user_id) as player_count 
        FROM tickets 
        WHERE room_id = $1 AND is_refunded = FALSE
    `, [roomId]);
    
    return result.rows[0].player_count;
}

// In startRoomGame:
const uniquePlayers = await this.validatePlayerCount(roomId);
if (uniquePlayers < 2) {
    throw new Error('Not enough unique players to start game');
}
```

---

## Implementation Checklist

- [ ] Add `isProcessing` flag to room objects
- [ ] Add check in `tickRooms()` to skip processing rooms
- [ ] Verify `fn_purchase_seats()` uses SERIALIZABLE transactions
- [ ] Add timeout recovery to `startRoomGame()`
- [ ] Replace cache-based player count with DB query
- [ ] Update `depositTelebirr()` to use SERIALIZABLE + row locks
- [ ] Add database constraint: unique(transaction_id) on external_deposits
- [ ] Test race conditions with concurrent requests

## Testing Commands

```bash
# Test double-start
# Rapid fire multiple requests to same room endpoint
for i in {1..10}; do curl -X POST http://localhost:3000/api/v1/rooms/join; done &

# Test double-spend
# Multiple requests with same transactionId
for i in {1..5}; do curl -X POST http://localhost:3000/api/v1/wallet/deposit -d '{"txId": "TEST123"}'; done &
```
