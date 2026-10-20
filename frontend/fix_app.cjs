const fs = require('fs');

const filePath = 'src/App.jsx';
let content = fs.readFileSync(filePath, 'utf8');

const i18n_am_old = 'pass: "የይለፍ ቃል (Password)"';
const i18n_am_new = `pass: "የይለፍ ቃል (Password)",
        seatLabel: "መቀመጫ", drawLabel: "ዕጣ", winnerLabel: "አሸናፊ", rulesLabel: "ደንቦች",
        rule1: "ክፍል ይምረጡ (ቁጥር እና ሽልማት)", rule2: "በሰሌዳው ላይ አንድ ልዩ ቁጥር ይምረጡ", rule3: "መቀመጫዎችን ይሙሉ (ከጓደኞች ጋር)", rule4: "ክሪፕቶ ዕጣ → የሚመሳሰል ቁጥር ሽልማቱን ያሸንፋል",
        step1: "1 · በክፍሉ ውስጥ ተጫዋቾች", selectGroupSize: "የቡድን መጠን ይምረጡ",
        step2: "2 · የሽልማት ገንዘብ", selectPrize: "ሽልማት ይምረጡ", birr: "ብር",
        totalEntry: "ጠቅላላ መግቢያ", players: "ተጫዋቾች", prize: "ሽልማት",
        step3: "3 · የእርስዎ ቁጥር", canSelect: "እስከ", numbers: "ቁጥሮች መምረጥ ይችላሉ",
        openRoomBtn: "ክፍል ክፈት · መቀመጫዎች አሳይ",
        recentWinners: "የቅርብ ጊዜ አሸናፊዎች", allOpenGames: "ሁሉም ክፍት ጨዋታዎች", selectedRooms: "የተመረጡ ክፍሎች",
        all: "ሁሉም", selected: "የተመረጡ", resultsTitle: "ውጤቶች", noResults: "ምንም ውጤት የለም",
        noOpenGames: "ክፍት ጨዋታ የለም — ከላይ አዲስ ዑደት ይፍጠሩ", loginFirst: "እባክዎ በመጀመሪያ ይግቡ (Please login first)",
        selectSeats: "መቀመጫ ይምረጡ (Select Seats)", playersJoined: "ተጫዋቾች (Players Joined):", 
        gameStarts: "⚠️ ጨዋታው በ60 ሰከንድ ይጀምራል (ቢያንስ 2 ተጫዋቾች ያስፈልጋሉ)",
        totalPrice: "መግቢያ (Total Price)", limitReached: "ሙሉ ነው (Limit Reached)", buySeat: "መቀመጫ ግዛ (Buy Seat)",
        drawing: "ዕጣ እየወጣ ነው...", nextCycle: "ቀጣዩ ዑደት ተከፍቷል · Next game cycle is now open for joins!",
        winnerPrefix: "አሸናፊ:", congrats: "🎉 እንኳን ደስ አለዎት! ያሸነፉት መቀመጫ #", wonSeat: "ያሸነፈው መቀመጫ #", awesome: "አስደናቂ!"`;

const i18n_en_old = 'pass: "Password"';
const i18n_en_new = `pass: "Password",
        seatLabel: "Seat", drawLabel: "Draw", winnerLabel: "Winner", rulesLabel: "Rules",
        rule1: "Choose a room (Amount & Prize)", rule2: "Pick a unique number on the board", rule3: "Fill the seats (with friends)", rule4: "Crypto draw → Matching number wins prize",
        step1: "1 · Players in the room", selectGroupSize: "Select Group Size",
        step2: "2 · Prize Money", selectPrize: "Select Prize", birr: "ETB",
        totalEntry: "Total Entry", players: "Players", prize: "Prize",
        step3: "3 · Your Number", canSelect: "You can select up to", numbers: "numbers",
        openRoomBtn: "Open Room · Show Seats",
        recentWinners: "Recent Winners", allOpenGames: "All Open Games", selectedRooms: "Selected Rooms",
        all: "All", selected: "Selected", resultsTitle: "Results", noResults: "No results",
        noOpenGames: "No open games — create a new cycle above", loginFirst: "Please login first",
        selectSeats: "Select Seats", playersJoined: "Players Joined:", 
        gameStarts: "⚠️ Game starts in 60s (min 2 players required)",
        totalPrice: "Total Price", limitReached: "Limit Reached", buySeat: "Buy Seat",
        drawing: "Drawing...", nextCycle: "Next game cycle is now open for joins!",
        winnerPrefix: "Winner:", congrats: "🎉 Congratulations! You won with seat #", wonSeat: "Winning seat is #", awesome: "Awesome!"`;

content = content.replace(i18n_am_old, i18n_am_new).replace(i18n_en_old, i18n_en_new);

const replacements = {
    ">መቀመጫ</p>": ">{t('seatLabel')}</p>",
    ">ዕጣ</p>": ">{t('drawLabel')}</p>",
    ">አሸናፊ</p>": ">{t('winnerLabel')}</p>",
    ">ደንቦች</p>": ">{t('rulesLabel')}</p>",
    "<span>ክፍል ይምረጡ (ቁጥር እና ሽልማት)</span>": "<span>{t('rule1')}</span>",
    "<span>በሰሌዳው ላይ አንድ ልዩ ቁጥር ይምረጡ</span>": "<span>{t('rule2')}</span>",
    "<span>መቀመጫዎችን ይሙሉ (ከጓደኞች ጋር)</span>": "<span>{t('rule3')}</span>",
    "<span>ክሪፕቶ ዕጣ → የሚመሳሰል ቁጥር ሽልማቱን ያሸንፋል</span>": "<span>{t('rule4')}</span>",
    "1 · በክፍሉ ውስጥ ተጫዋቾች": "{t('step1')}",
    "የቡድን መጠን ይምረጡ": "{t('selectGroupSize')}",
    "2 · የሽልማት ገንዘብ": "{t('step2')}",
    "ሽልማት ይምረጡ": "{t('selectPrize')}",
    "} ብር": "} {t('birr')}",
    "ጠቅላላ መግቢያ (": "{t('totalEntry')} (",
    ">ተጫዋቾች</p>": ">{t('players')}</p>",
    ">ሽልማት</p>": ">{t('prize')}</p>",
    "3 · የእርስዎ ቁጥር": "{t('step3')}",
    "ክፍል ክፈት · መቀመጫዎች አሳይ": "{t('openRoomBtn')}",
    "`የቅርብ ጊዜ አሸናፊዎች`": "t('recentWinners')",
    "`ሁሉም ክፍት ጨዋታዎች (${rooms.length})`": "`\\${t('allOpenGames')} (\\${rooms.length})`",
    "`የተመረጡ ክፍሎች (": "`\\${t('selectedRooms')} (",
    "ሁሉም (": "{t('all')} (",
    ">የተመረጡ<": ">{t('selected')}<",
    ">ውጤቶች<": ">{t('resultsTitle')}<",
    ">ምንም ውጤት የለም<": ">{t('noResults')}<",
    "ክፍት ጨዋታ የለም — ከላይ አዲስ ዑደት ይፍጠሩ": "{t('noOpenGames')}",
    "'እባክዎ በመጀመሪያ ይግቡ (Please login first)'": "t('loginFirst')",
    "መቀመጫ ይምረጡ (Select Seats)": "{t('selectSeats')}",
    ">ተጫዋቾች (Players Joined):<": ">{t('playersJoined')}<",
    ">⚠️ ጨዋታው በ60 ሰከንድ ይጀምራል (ቢያንስ 2 ተጫዋቾች ያስፈልጋሉ)<": ">{t('gameStarts')}<",
    ">መግቢያ (Total Price)<": ">{t('totalPrice')}<",
    "'ሙሉ ነው (Limit Reached)'": "t('limitReached')",
    "'መቀመጫ ግዛ (Buy Seat)'": "t('buySeat')",
    "ዕጣ እየወጣ ነው...": "{t('drawing')}",
    ">ቀጣዩ ዑደት ተከፍቷል · Next game cycle is now open for joins!<": ">{t('nextCycle')}<",
    ">አሸናፊ: <": ">{t('winnerPrefix')} <",
    "`🎉 እንኳን ደስ አለዎት! ያሸነፉት መቀመጫ #": "`\\${t('congrats')}",
    "`ያሸነፈው መቀመጫ #": "`\\${t('wonSeat')}",
    ">አሸናፊ!<": ">{t('awesome')}<"
};

for (const [oldText, newText] of Object.entries(replacements)) {
    content = content.split(oldText).join(newText);
}

// Fixing complex string replacements that were missed
content = content.split("እስከ {wizard.groupSize === 5 ? 1 : Math.floor(wizard.groupSize / 10) + 1} ቁጥሮች መምረጥ ይችላሉ").join("{t('canSelect')} {wizard.groupSize === 5 ? 1 : Math.floor(wizard.groupSize / 10) + 1} {t('numbers')}");
content = content.split("እስከ {seatModal.room.groupSize === 5 ? 1 : Math.floor(seatModal.room.groupSize / 10) + 1} ቁጥሮች መምረጥ ይችላሉ").join("{t('canSelect')} {seatModal.room.groupSize === 5 ? 1 : Math.floor(seatModal.room.groupSize / 10) + 1} {t('numbers')}");

fs.writeFileSync(filePath, content, 'utf8');
console.log('Translation strings replaced successfully.');
