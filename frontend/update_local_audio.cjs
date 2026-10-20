const fs = require('fs');

const filePath = 'src/App.jsx';
let content = fs.readFileSync(filePath, 'utf8');

const regexToReplaceTick = /const speak = \(text\) => \{\s*const url = `https:\/\/translate\.google\.com\/translate_tts\?ie=UTF-8&client=tw-ob&tl=am&q=\$\{encodeURIComponent\(text\)\}`;\s*new Audio\(url\)\.play\(\)\.catch\(e => console\.error\("Audio error", e\)\);\s*\};\s*if \(timeRemaining === 10\) \{\s*speak\("የከፈቱት ክፍል እጣ ሊወጣ አስር ሰከንድ ብቻ ቀርቷል"\);\s*\}\s*if \(timeRemaining <= 10 && timeRemaining > 0\) \{\s*setTimeout\(\(\) => \{ speak\(amhNums\[timeRemaining\]\); \}, timeRemaining === 10 \? 3000 : 0\);\s*\}/;

const newTick = `const playLocal = (file) => {
                        const audio = new Audio(\`/sounds/voice/\${file}.mp3\`);
                        audio.play().catch(e => console.error("Local audio error", e));
                    };
                    
                    if (timeRemaining === 10) {
                        playLocal('warning');
                    }
                    if (timeRemaining <= 10 && timeRemaining > 0) {
                        setTimeout(() => { playLocal(timeRemaining); }, timeRemaining === 10 ? 3000 : 0);
                    }`;

content = content.replace(regexToReplaceTick, newTick);

const regexToReplaceWinner = /const text = `ዕጣው የወጣለት አሸናፊ ቁጥር \$\{data\.winnerSeatNumber\} ነው! እንኳን ደስ አሎት!`;\s*const url = `https:\/\/translate\.google\.com\/translate_tts\?ie=UTF-8&client=tw-ob&tl=am&q=\$\{encodeURIComponent\(text\)\}`;\s*new Audio\(url\)\.play\(\)\.catch\(e => console\.error\("Audio error", e\)\);/;

const newWinner = `const audio = new Audio('/sounds/voice/winner.mp3');
                    audio.play().catch(e => console.error("Local audio error", e));`;

content = content.replace(regexToReplaceWinner, newWinner);

fs.writeFileSync(filePath, content, 'utf8');
console.log('App.jsx updated to use local mp3 files');
