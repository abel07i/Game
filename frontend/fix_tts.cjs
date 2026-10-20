const fs = require('fs');

const filePath = 'src/App.jsx';
let content = fs.readFileSync(filePath, 'utf8');

// Replace the previous synthesis code in the tick handler
const tickRegex = /if \(localStorage\.getItem\('sound'\) !== 'false'\) \{\s*const amhNums.*?window\.speechSynthesis\.speak\(numMsg\);\s*\}\s*\}/s;

const newTick = `if (localStorage.getItem('sound') !== 'false') {
                    const amhNums = {10: "አስር", 9: "ዘጠኝ", 8: "ስምንት", 7: "ሰባት", 6: "ስድስት", 5: "አምስት", 4: "አራት", 3: "ሶስት", 2: "ሁለት", 1: "አንድ"};
                    const speak = (text) => {
                        const url = \`https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=am&q=\${encodeURIComponent(text)}\`;
                        new Audio(url).play().catch(e => console.error("Audio error", e));
                    };
                    
                    if (timeRemaining === 10) {
                        speak("የከፈቱት ክፍል እጣ ሊወጣ አስር ሰከንድ ብቻ ቀርቷል");
                    }
                    if (timeRemaining <= 10 && timeRemaining > 0) {
                        setTimeout(() => { speak(amhNums[timeRemaining]); }, timeRemaining === 10 ? 3000 : 0);
                    }
                }`;
content = content.replace(tickRegex, newTick);


// Replace the winner reveal logic
const winnerRegex = /if \(localStorage\.getItem\('sound'\) !== 'false'.*?window\.speechSynthesis\.speak\(msg\);\s*\}/s;

const newWinner = `if (localStorage.getItem('sound') !== 'false' && (seatModalRef.current.room?.id === data.roomId || drawModal.room === data.roomId || drawModal.open)) {
                    const text = \`ዕጣው የወጣለት አሸናፊ ቁጥር \${data.winnerSeatNumber} ነው! እንኳን ደስ አሎት!\`;
                    const url = \`https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=am&q=\${encodeURIComponent(text)}\`;
                    new Audio(url).play().catch(e => console.error("Audio error", e));
                }`;
content = content.replace(winnerRegex, newWinner);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Fixed TTS with Google Translate Audio API.');
