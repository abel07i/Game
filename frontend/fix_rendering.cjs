const fs = require('fs');

const filePath = 'src/App.jsx';
let content = fs.readFileSync(filePath, 'utf8');

// Fix the \${t(...)} escapes that render as text
content = content.replace(/\\\$\{t\(/g, "${t(");

// Fix the 'canSelect' strings that failed to replace properly because of formatting differences
// I'll use regex to catch variations in whitespace
content = content.replace(/እስከ\s*\{\s*wizard\.groupSize\s*===\s*5\s*\?\s*1\s*:\s*Math\.floor\(\s*wizard\.groupSize\s*\/\s*10\s*\)\s*\+\s*1\s*\}\s*ቁጥሮች\s*መምረጥ\s*ይችላሉ/g, "{t('canSelect')} {wizard.groupSize === 5 ? 1 : Math.floor(wizard.groupSize / 10) + 1} {t('numbers')}");

content = content.replace(/እስከ\s*\{\s*seatModal\.room\.groupSize\s*===\s*5\s*\?\s*1\s*:\s*Math\.floor\(\s*seatModal\.room\.groupSize\s*\/\s*10\s*\)\s*\+\s*1\s*\}\s*ቁጥሮች\s*መምረጥ\s*ይችላሉ/g, "{t('canSelect')} {seatModal.room.groupSize === 5 ? 1 : Math.floor(seatModal.room.groupSize / 10) + 1} {t('numbers')}");

fs.writeFileSync(filePath, content, 'utf8');
console.log('Fixed final rendering issues');
