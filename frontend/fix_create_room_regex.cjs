const fs = require('fs');

const filePath = 'src/App.jsx';
let content = fs.readFileSync(filePath, 'utf8');

const regex = /const executeOpenRoom = async \(\) => \{[\s\S]*?setActiveTab\('rooms'\);\r?\n\s*\}/;
content = content.replace(regex, (match) => {
    return match.replace(
        /setActiveTab\('rooms'\);\r?\n\s*\}/,
        `setActiveTab('rooms');\n                  setSeatModal({ open: true, room: data.room, selectedSeats: [] });\n              }`
    );
});

fs.writeFileSync(filePath, content, 'utf8');
console.log('Fixed executeOpenRoom with regex');
