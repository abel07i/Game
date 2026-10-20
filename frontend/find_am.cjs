const fs = require('fs');

const filePath = 'src/App.jsx';
let content = fs.readFileSync(filePath, 'utf8');

const lines = content.split('\n');
for(let i=0; i<lines.length; i++) {
    if(lines[i].includes('canSelect:')) {
        console.log(`Line ${i+1}: ${lines[i].trim()}`);
    }
}
