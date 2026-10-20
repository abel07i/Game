const fs = require('fs');

const filePath = 'src/App.jsx';
let content = fs.readFileSync(filePath, 'utf8');

// Replace the invalid className=`...` with className={`...`}
content = content.replace(/className=`([^`]+)`/g, 'className={`$1`}');

fs.writeFileSync(filePath, content, 'utf8');
console.log('Fixed syntax error');
