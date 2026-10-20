const fs = require('fs');

const filePath = 'src/App.jsx';
let content = fs.readFileSync(filePath, 'utf8');

// Replace the syntax errors directly using a more generic regex that matches the structure
content = content.replace(/\{language === 'am' \? '[^']*' : '\{t\('howToPlayDesc1'\)\}'\}/g, "{t('howToPlayDesc1')}");
content = content.replace(/\{language === 'am' \? '[^']*' : '\{t\('howToPlayDesc2'\)\}'\}/g, "{t('howToPlayDesc2')}");

fs.writeFileSync(filePath, content, 'utf8');
console.log('Fixed syntax errors.');
