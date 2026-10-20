const fs = require('fs');

const filePath = 'src/App.jsx';
let content = fs.readFileSync(filePath, 'utf8');

// Update executeOpenRoom to set seat modal
content = content.replace(
    /setActiveTab\('rooms'\);\s*\}/,
    `setActiveTab('rooms');
                setSeatModal({ open: true, room: data.room, selectedSeats: [] });
            }`
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Fixed executeOpenRoom');
