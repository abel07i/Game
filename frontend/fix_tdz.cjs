const fs = require('fs');

const filePath = 'src/App.jsx';
let content = fs.readFileSync(filePath, 'utf8');

content = content.replace(
    /const activeRoom = seatModal\.open && activeRoom \? \(rooms\.find\(r => r\.id === activeRoom\.id\) \|\| activeRoom\) : null;/,
    `const activeRoom = seatModal.open && seatModal.room ? (rooms.find(r => r.id === seatModal.room.id) || seatModal.room) : null;`
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Fixed activeRoom definition');
