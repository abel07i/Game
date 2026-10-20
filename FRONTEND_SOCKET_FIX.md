# Frontend Socket Listener Cleanup Fixes

## Summary
The large useEffect in App.jsx (starting around line 911) registers 6 socket event listeners without proper cleanup. This causes memory leaks and stale listeners on page navigation.

## Required Changes

### Change 1: Replace the socket registration useEffect (Line ~911-1080)

The current useEffect does:
```javascript
useEffect(() => {
    socket.on('room:state_update', ...);
    socket.on('room:time_tick', ...);
    socket.on('room:waiting_for_players', ...);
    socket.on('room:seat_claimed', ...);
    socket.on('draw:started', ...);
    socket.on('draw:winner_revealed', ...);
    
    return () => socket.off(); // ← Removes ALL listeners (too aggressive)
}, []);
```

Replace with:
```javascript
useEffect(() => {
    const socket = getSocket();
    
    // ... event handlers (keep existing)
    const handleRoomUpdate = (roomsData) => setRooms(roomsData);
    const handleTimeTick = ({ ... }) => { ... };
    const handleWaitingForPlayers = ({ roomId }) => { ... };
    const handleSeatClaimed = ({ ... }) => { ... };
    const handleDrawStarted = (data) => { ... };
    const handleWinnerRevealed = (data) => { ... };
    
    // Register listeners with tracking
    onSocketEvent('room:state_update', handleRoomUpdate);
    onSocketEvent('room:time_tick', handleTimeTick);
    onSocketEvent('room:waiting_for_players', handleWaitingForPlayers);
    onSocketEvent('room:seat_claimed', handleSeatClaimed);
    onSocketEvent('draw:started', handleDrawStarted);
    onSocketEvent('draw:winner_revealed', handleWinnerRevealed);
    
    // Cleanup on unmount
    return () => {
        offSocketEvent('room:state_update');
        offSocketEvent('room:time_tick');
        offSocketEvent('room:waiting_for_players');
        offSocketEvent('room:seat_claimed');
        offSocketEvent('draw:started');
        offSocketEvent('draw:winner_revealed');
    };
}, []);
```

### Change 2: Replace fetch calls with fetchWithTimeout

All `fetch('http://localhost:3000/api/...` calls should be:
```javascript
fetchWithTimeout('/api/v1/...')
```

Lines to update:
- Line 917: `fetch('http://localhost:3000/api/v1/rooms')`
- Line 921: `fetch('http://localhost:3000/api/v1/results')`
- Any other hardcoded localhost URLs

### Change 3: Add AbortController to ensure-rooms fetch (Line ~510)

```javascript
useEffect(() => {
    const controller = new AbortController();
    
    fetchWithTimeout('/api/v1/rooms/ensure', { signal: controller.signal })
        .then(res => res.json())
        .then(data => setLiveRealRooms(data))
        .catch(err => {
            if (err.name !== 'AbortError') console.error('ensure rooms error:', err);
        });
    
    return () => controller.abort();
}, [activeTab]);
```

### Change 4: Fix useEffect dependency (Line ~422-432)

```javascript
// BEFORE:
useEffect(() => {
    showToast(languageRef.current ? ... : ...);
}, []); // ← Missing language dependency

// AFTER:
useEffect(() => {
    showToast(language === 'am' ? ... : ...);
}, [language]); // ← Add language
```

### Change 5: Add proper cleanup in useEffect for modals

Modal alerts should auto-clear:
```javascript
useEffect(() => {
    if (modalAlert) {
        const timer = setTimeout(() => setModalAlert(null), 5000);
        return () => clearTimeout(timer);
    }
}, [modalAlert]);
```

### Change 6: Fix App unmount cleanup

Add to the cleanup function of main App:
```javascript
useEffect(() => {
    // ... existing code ...
    
    return () => {
        cleanupSocket(); // Clean all socket listeners
        // Clean up any pending timers
        if (drawIntervalRef.current) clearInterval(drawIntervalRef.current);
    };
}, []);
```

## Replacement Strategy

Since the full replacement is complex due to JSX formatting, use this sequence:

1. Extract event handler functions into separate const definitions
2. Replace the useEffect registration to use onSocketEvent/offSocketEvent
3. Add comprehensive cleanup

Example stub structure:
```javascript
// Define handlers outside useEffect
const handleRoomUpdate = (roomsData) => setRooms(roomsData);
const handleTimeTick = ({ roomId, ... }) => { /* existing code */ };
// ... more handlers ...

// Then in useEffect
useEffect(() => {
    const socket = getSocket();
    
    const unsubscribe1 = onSocketEvent('room:state_update', handleRoomUpdate);
    const unsubscribe2 = onSocketEvent('room:time_tick', handleTimeTick);
    // ... more subscriptions ...
    
    return () => {
        unsubscribe1();
        unsubscribe2();
        // ... more cleanups ...
    };
}, []);
```

## Testing After Fix

1. Open DevTools → Network tab
2. Look for Socket.io connections
3. Should see only ONE connection (not multiple)
4. Navigate between tabs → connection should persist
5. Close and reopen app → old connections cleanup properly
6. Check Memory tab → memory usage should not grow excessively
