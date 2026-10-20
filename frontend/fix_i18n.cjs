const fs = require('fs');

const filePath = 'src/App.jsx';
let content = fs.readFileSync(filePath, 'utf8');

// I need to fix the values in i18n that got overwritten by {t('...')}
const brokenValuesAm = {
    "step1: \"{t('step1')}\"": "step1: \"1 · በክፍሉ ውስጥ ተጫዋቾች\"",
    "selectGroupSize: \"{t('selectGroupSize')}\"": "selectGroupSize: \"የቡድን መጠን ይምረጡ\"",
    "step2: \"{t('step2')}\"": "step2: \"2 · የሽልማት ገንዘብ\"",
    "selectPrize: \"{t('selectPrize')}\"": "selectPrize: \"ሽልማት ይምረጡ\"",
    "step3: \"{t('step3')}\"": "step3: \"3 · የእርስዎ ቁጥር\"",
    "openRoomBtn: \"{t('openRoomBtn')}\"": "openRoomBtn: \"ክፍል ክፈት · መቀመጫዎች አሳይ\"",
    "recentWinners: \"t('recentWinners')\"": "recentWinners: \"የቅርብ ጊዜ አሸናፊዎች\"",
    "allOpenGames: \"ሁሉም ክፍት ጨዋታዎች\"": "allOpenGames: \"ሁሉም ክፍት ጨዋታዎች\"", // already string but let's be sure
    "selectedRooms: \"የተመረጡ ክፍሎች\"": "selectedRooms: \"የተመረጡ ክፍሎች\"",
    "resultsTitle: \"ውጤቶች\"": "resultsTitle: \"ውጤቶች\"",
    "noResults: \"ምንም ውጤት የለም\"": "noResults: \"ምንም ውጤት የለም\"",
    "noOpenGames: \"{t('noOpenGames')}\"": "noOpenGames: \"ክፍት ጨዋታ የለም — ከላይ አዲስ ዑደት ይፍጠሩ\"",
    "loginFirst: \"t('loginFirst')\"": "loginFirst: \"እባክዎ በመጀመሪያ ይግቡ (Please login first)\"",
    "selectSeats: \"{t('selectSeats')}\"": "selectSeats: \"መቀመጫ ይምረጡ (Select Seats)\"",
    "limitReached: \"t('limitReached')\"": "limitReached: \"ሙሉ ነው (Limit Reached)\"",
    "buySeat: \"t('buySeat')\"": "buySeat: \"መቀመጫ ግዛ (Buy Seat)\"",
    "drawing: \"{t('drawing')}\"": "drawing: \"ዕጣ እየወጣ ነው...\"",
};

for (const [broken, correct] of Object.entries(brokenValuesAm)) {
    // Only target the amharic i18n section, though it's unique enough
    content = content.replace(new RegExp(broken.replace(/[.*+?^$\\{\\}()|[\\]\\\\]/g, '\\\\$&'), 'g'), correct);
}

// Check other missed replacements in JSX
// The JSX might have ended up with something weird too.
// The user mentioned: `${t('allOpenGames')} (${rooms.length})` 
// and `እስከ 2 ቁጥሮች መምረጥ ይችላሉ`
content = content.replace(/እስከ \{wizard.groupSize === 5 \? 1 : Math.floor\(wizard.groupSize \/ 10\) \+ 1\} ቁጥሮች መምረጥ ይችላሉ/g, "{t('canSelect')} {wizard.groupSize === 5 ? 1 : Math.floor(wizard.groupSize / 10) + 1} {t('numbers')}");
content = content.replace(/እስከ \{seatModal.room.groupSize === 5 \? 1 : Math.floor\(seatModal.room.groupSize \/ 10\) \+ 1\} ቁጥሮች መምረጥ ይችላሉ/g, "{t('canSelect')} {seatModal.room.groupSize === 5 ? 1 : Math.floor(seatModal.room.groupSize / 10) + 1} {t('numbers')}");

fs.writeFileSync(filePath, content, 'utf8');
console.log('Fixed i18n broken strings');
