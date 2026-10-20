const fs = require('fs');

const filePath = 'src/App.jsx';
const content = fs.readFileSync(filePath, 'utf8');

const lines = content.split('\n');
let found = false;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('እስከ')) {
        console.log(`Line ${i + 1}: ${lines[i].trim()}`);
        found = true;
    }
}
if (!found) {
    console.log("No occurrences of 'እስከ' found.");
}
