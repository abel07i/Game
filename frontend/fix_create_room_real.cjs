const fs = require('fs');

const filePath = 'src/App.jsx';
let content = fs.readFileSync(filePath, 'utf8');

// Undo the broken injection in handleAuth
content = content.replace(
    /setActiveTab\('rooms'\);\s*setSeatModal\(\{ open: true, room: data\.room, selectedSeats: \[\] \}\);\s*\}/,
    `setActiveTab('rooms');
            }`
);

// Inject into executeOpenRoom properly
// Find executeOpenRoom
const execOpenRoomStart = content.indexOf('const executeOpenRoom =');
if (execOpenRoomStart !== -1) {
    const searchString = `setActiveTab('rooms');
            }`;
    const injectIndex = content.indexOf(searchString, execOpenRoomStart);
    if (injectIndex !== -1) {
        content = content.substring(0, injectIndex) + 
                  `setActiveTab('rooms');
                setSeatModal({ open: true, room: data.room, selectedSeats: [] });
            }` + 
                  content.substring(injectIndex + searchString.length);
    } else {
        // Try alternate spacing
        const altSearch = "setActiveTab('rooms');\n              }";
        const altIndex = content.indexOf(altSearch, execOpenRoomStart);
        if (altIndex !== -1) {
            content = content.substring(0, altIndex) + 
                      `setActiveTab('rooms');\n                  setSeatModal({ open: true, room: data.room, selectedSeats: [] });\n              }` + 
                      content.substring(altIndex + altSearch.length);
        }
    }
}

fs.writeFileSync(filePath, content, 'utf8');
console.log('Fixed executeOpenRoom injection');
