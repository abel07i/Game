const fs = require('fs');

const filePath = 'src/App.jsx';
let content = fs.readFileSync(filePath, 'utf8');

const brokenValuesAm = [
    ['step1: "{t(\'step1\')}"', 'step1: "1 · በክፍሉ ውስጥ ተጫዋቾች"'],
    ['selectGroupSize: "{t(\'selectGroupSize\')}"', 'selectGroupSize: "የቡድን መጠን ይምረጡ"'],
    ['step2: "{t(\'step2\')}"', 'step2: "2 · የሽልማት ገንዘብ"'],
    ['selectPrize: "{t(\'selectPrize\')}"', 'selectPrize: "ሽልማት ይምረጡ"'],
    ['step3: "{t(\'step3\')}"', 'step3: "3 · የእርስዎ ቁጥር"'],
    ['openRoomBtn: "{t(\'openRoomBtn\')}"', 'openRoomBtn: "ክፍል ክፈት · መቀመጫዎች አሳይ"'],
    ['recentWinners: "t(\'recentWinners\')"', 'recentWinners: "የቅርብ ጊዜ አሸናፊዎች"'],
    ['noOpenGames: "{t(\'noOpenGames\')}"', 'noOpenGames: "ክፍት ጨዋታ የለም — ከላይ አዲስ ዑደት ይፍጠሩ"'],
    ['loginFirst: "t(\'loginFirst\')"', 'loginFirst: "እባክዎ በመጀመሪያ ይግቡ (Please login first)"'],
    ['selectSeats: "{t(\'selectSeats\')}"', 'selectSeats: "መቀመጫ ይምረጡ (Select Seats)"'],
    ['limitReached: "t(\'limitReached\')"', 'limitReached: "ሙሉ ነው (Limit Reached)"'],
    ['buySeat: "t(\'buySeat\')"', 'buySeat: "መቀመጫ ግዛ (Buy Seat)"'],
    ['drawing: "{t(\'drawing\')}"', 'drawing: "ዕጣ እየወጣ ነው..."']
];

for (const [broken, correct] of brokenValuesAm) {
    content = content.replaceAll(broken, correct);
}

// Fix \${rooms.length} issue
content = content.replaceAll('\\${rooms.length}', '${rooms.length}');
content = content.replaceAll('\\${t(\'allOpenGames\')}', '${t(\'allOpenGames\')}');
content = content.replaceAll('\\${t(\'selectedRooms\')}', '${t(\'selectedRooms\')}');
content = content.replaceAll('\\${t(\'congrats\')}', '${t(\'congrats\')}');
content = content.replaceAll('\\${t(\'wonSeat\')}', '${t(\'wonSeat\')}');

// Fix the canSelect issue
// Replace any literal occurrence of "እስከ 2 ቁጥሮች መምረጥ ይችላሉ" in JSX with the variables, just in case
// Wait, the exact string rendered on screen is `{t('canSelect')} X {t('numbers')}`. But the user says they literally saw "እስከ 2 ቁጥሮች መምረጥ ይችላሉ".
// How is that possible? If the string evaluates to Amharic even when toggled to English?
// Oh! If the Amharic translation was overwritten into the EN dictionary?
// Let's look at what the EN dictionary has for step1.

fs.writeFileSync(filePath, content, 'utf8');
console.log('Fixed using replaceAll');
