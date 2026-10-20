const fs = require('fs');

const filePath = 'src/App.jsx';
let content = fs.readFileSync(filePath, 'utf8');

// The activeRoom was incorrectly replaced inside buySeat because my string slice was too early.
// Let's manually fix it in buySeat.

// In buySeat:
// roomId: activeRoom.id, -> roomId: seatModal.room.id,
content = content.replace(
    /roomId:\s*activeRoom\.id,/,
    'roomId: seatModal.room.id,'
);

// setUser(u => ({ ...u, balance: u.balance - (activeRoom.ticketPrice * 
content = content.replace(
    /balance: u\.balance - \(activeRoom\.ticketPrice \*/,
    'balance: u.balance - (seatModal.room.ticketPrice *'
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Fixed activeRoom reference error in buySeat');
