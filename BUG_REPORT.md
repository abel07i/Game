# Bug Report: Frontend & Backend

## CRITICAL BUGS (Production-Blocking)

### Backend - CRITICAL

#### 1. SQL Injection - adminRoutes.js Line 213-214
**File**: `backend/src/adminRoutes.js`
**Issue**: Parameter placeholders missing `$` prefix
```javascript
// VULNERABLE:
whereClause += ` AND (u.display_name ILIKE ${params.length} OR u.phone_number ILIKE ${params.length})`;

// FIXED:
whereClause += ` AND (u.display_name ILIKE $${params.length} OR u.phone_number ILIKE $${params.length})`;
```
**Impact**: SQL injection attacks possible

#### 2. SQL Injection - adminRoutes.js Line 245
**File**: `backend/src/adminRoutes.js`
**Issue**: LIMIT/OFFSET using template interpolation instead of parameters
```javascript
// VULNERABLE:
LIMIT ${dataParams.length - 1} OFFSET ${dataParams.length}

// FIXED:
const limitParam = dataParams.length - 1;
const offsetParam = dataParams.length;
LIMIT $${limitParam} OFFSET $${offsetParam}
```

#### 3. Race Condition - roomManager.js Line 145-195
**File**: `backend/src/roomManager.js`
**Issue**: No transaction wrapping seat purchase validation and execution
**Problem**: Two users can buy the same seat simultaneously
**Fix**: Wrap in database transaction:
```javascript
await db.query('BEGIN');
try {
  await db.query('SELECT * FROM seats WHERE room_id = $1 FOR UPDATE', [roomId]);
  // ... seat purchase logic ...
  await db.query('COMMIT');
} catch (err) {
  await db.query('ROLLBACK');
  throw err;
}
```

#### 4. Race Condition - roomManager.js Line 78-95
**File**: `backend/src/roomManager.js`
**Issue**: `tickRooms()` has no synchronization - multiple calls can trigger same game start
**Problem**: Without locks, concurrent ticks can start same room multiple times
**Fix**: Add room lock check:
```javascript
if (room.isProcessing) return; // Skip if already being processed
room.isProcessing = true;
try {
  // ... game start logic ...
} finally {
  room.isProcessing = false;
}
```

#### 5. Memory Leak - roomManager.js Line 43
**File**: `backend/src/roomManager.js`
**Issue**: Socket listeners registered but never cleaned up
```javascript
// Missing cleanup:
socket.on('disconnect', () => {
  // Remove all listeners for this socket
  socket.removeAllListeners();
});
```

#### 6. Double-Spending - walletLedger.js Line 29-42
**File**: `backend/src/walletLedger.js`
**Issue**: Race condition in Telebirr deposit verification
**Problem**: Two simultaneous requests with same transactionId both get credited
**Fix**: Use unique constraint + transaction:
```javascript
async depositTelebirr(userId, amount, transactionId) {
  try {
    // Atomically insert AND check uniqueness
    await db.query('BEGIN');
    const existing = await db.query(
      'SELECT * FROM external_deposits WHERE transaction_id = $1 FOR UPDATE',
      [transactionId]
    );
    if (existing.rows.length > 0) throw new Error('Duplicate transaction');
    
    await db.query(
      'INSERT INTO external_deposits (user_id, transaction_id, amount) VALUES ($1, $2, $3)',
      [userId, transactionId, amount]
    );
    const balance = await this.deposit(userId, amount, 'real');
    await db.query('COMMIT');
    return balance;
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  }
}
```

### Frontend - CRITICAL

#### 7. Memory Leak - App.jsx Line 3
**File**: `frontend/src/App.jsx`
**Issue**: Global socket connection never disconnected
```javascript
// VULNERABLE:
const socket = io('http://localhost:3000'); // Created once at module level

// FIXED: Use useEffect to manage lifecycle
useEffect(() => {
  const socket = io('http://localhost:3000');
  // ... event handlers ...
  return () => socket.disconnect(); // Cleanup on unmount
}, []);
```

#### 8. Socket Memory Leak - App.jsx Line 1200-1350
**File**: `frontend/src/App.jsx`
**Issue**: Socket listeners registered but never removed
```javascript
// VULNERABLE:
socket.on('room:update', handleRoomUpdate);

// FIXED:
useEffect(() => {
  socket.on('room:update', handleRoomUpdate);
  return () => socket.off('room:update', handleRoomUpdate); // Cleanup
}, []);
```

#### 9. Stale Closure - App.jsx Line 422-432
**File**: `frontend/src/App.jsx`
**Issue**: useEffect uses old language reference instead of dependency
```javascript
// VULNERABLE:
useEffect(() => {
  showToast(languageRef.current ? 'am' : 'en'); // Uses ref, not dependency
}, []); // Missing language dependency

// FIXED:
useEffect(() => {
  showToast(language ? 'am' : 'en');
}, [language]); // Add language as dependency
```

#### 10. Race Condition - App.jsx Line 510-520
**File**: `frontend/src/App.jsx`
**Issue**: No AbortController for fetch, state updates on unmounted component
```javascript
// VULNERABLE:
useEffect(() => {
  fetch('/api/v1/rooms/ensure').then(res => setLiveRealRooms(res.json()));
}, [activeTab]);

// FIXED:
useEffect(() => {
  const controller = new AbortController();
  
  fetch('/api/v1/rooms/ensure', { signal: controller.signal })
    .then(res => res.json())
    .then(data => setLiveRealRooms(data))
    .catch(err => { if (err.name !== 'AbortError') console.error(err); });
    
  return () => controller.abort(); // Cleanup on unmount or tab change
}, [activeTab]);
```

---

## HIGH PRIORITY BUGS

### Backend

11. **Missing Error Handling** - server.js Line 236-273
    - Telebirr verification doesn't validate response format
    - `verifyData.data` could be undefined

12. **Unhandled Promise** - server.js Line 354
    - Auto-ensure room fetch without error handling

13. **Stuck Room States** - roomManager.js Line 105-115
    - Room can get stuck in 'drawing' state with no recovery

14. **Unique Player Count Bug** - roomManager.js Line 223
    - Using cache instead of DB for definitive player count

### Frontend

15. **Hardcoded Localhost** - App.jsx Line 500
    - Will fail in production: `'http://localhost:3000'`
    - Fix: Use environment variable or relative URL

16. **Missing Null Checks** - App.jsx Line 305
    - `response.json()` can fail without proper handling

17. **No Timeout on API Calls** - App.jsx
    - Long-running requests never cancelled

18. **Modal Alert Stacking** - App.jsx Line 550
    - No timeout to clear alerts, can stack up

---

## MEDIUM PRIORITY BUGS

19. **Parameter Binding Error** - adminRoutes.js Line 292-299
20. **Missing Error Boundary** - server.js Line 215
21. **Missing userRole Validation** - roomManager.js Line 151-154
22. **Direct Array Mutation** - App.jsx Line 327-328
23. **Missing useMemo Dependencies** - App.jsx Line 365
24. **Conditional useEffect Logic** - App.jsx Line 515
25. **Duplicate Socket Handlers** - App.jsx
26. **No Event Unsubscription** - App.jsx on tab change
27. **Off-By-One Error** - drawEngine.js Line 27
28. **Socket Handler Not Removed** - App.jsx when tab changes
29. **Status Update Not Cleared** - App.jsx modal alerts
30. **Missing User Active Check** - roomManager.js during join

---

## RECOMMENDATIONS

### Immediate Actions (Do First)
1. Fix SQL injection vulnerabilities (bugs #1-2)
2. Add transaction handling for seat purchases (bug #3)
3. Fix socket cleanup/memory leaks (bugs #7-8)
4. Fix stale closures (bug #9)
5. Add AbortController for fetches (bug #10)
6. Change hardcoded localhost to env variable (bug #15)

### Short Term (This Sprint)
7. Add proper error handling for Telebirr (bug #11)
8. Implement room state recovery (bug #13)
9. Fix double-spending race condition (bug #6)
10. Add null checks for API responses (bug #16)
11. Fix useEffect dependencies (bugs #23-24)
12. Remove direct mutations (bug #22)

### Long Term (Refactoring)
- Add request/response timeout middleware
- Implement proper transaction management layer
- Add comprehensive error boundaries
- Implement proper async operation cleanup patterns
- Add integration tests for race condition scenarios
