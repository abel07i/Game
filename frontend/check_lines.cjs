const fs = require('fs');

const filePath = 'src/App.jsx';
let content = fs.readFileSync(filePath, 'utf8');

const lines = content.split('\n');
for(let i=0; i<lines.length; i++) {
    if(lines[i].includes('allOpenGames') || lines[i].includes('canSelect') || lines[i].includes('step1:')) {
        console.log(`Line ${i+1}: ${lines[i].trim()}`);
    }
}
