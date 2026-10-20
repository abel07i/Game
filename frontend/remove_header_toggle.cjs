const fs = require('fs');

const filePath = 'src/App.jsx';
let content = fs.readFileSync(filePath, 'utf8');

const regexToRemove = /<button\s*onClick=\{\(\) => setSoundEnabled\(!soundEnabled\)\}\s*className=\{(.*?)'Sound On' : 'Sound Off'\}\s*>\s*\{soundEnabled \? \(\s*<svg.*?<\/svg>\s*\) : \(\s*<svg.*?<\/svg>\s*\)\s*\}\s*<\/button>\s*/gs;

content = content.replace(regexToRemove, '');
fs.writeFileSync(filePath, content, 'utf8');
console.log('Removed sound toggle from header.');
