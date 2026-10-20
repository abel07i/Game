const fs = require('fs');

const filePath = 'src/App.jsx';
let content = fs.readFileSync(filePath, 'utf8');

const replacements = {
    "{language === 'am' ? 'በስምዎ፣ ስልክ ቁጥርዎ እና የይለፍ ቃል ይመዝገቡ። ስልክ ቁጥርዎ እንደ መግቢያ ስም (username) ያገለግላል።' : 'Register with full name, phone number, and password. Your phone number is your username.'}": "{t('howToPlayDesc1')}",
    "{language === 'am' ? 'ወደ ዋሌት ይሂዱ። ለቀረበው የስልክ ቁጥር በቴሌብር ገንዘብ ይላኩ፣ ከዚያ የትራንዛክሽን ቁጥሩን ያስገቡ።' : 'Go to Wallet. Send Telebirr to the merchant phone, then enter the transaction number. Balance updates after verification.'}": "{t('howToPlayDesc2')}",
    "{language === 'am' ? 'አካውንት ይፍጠሩ' : 'Create an account'}": "{t('createAccount')}",
    "{language === 'am' ? 'ክፍል ይምረጡ' : 'Choose a room'}": "{t('chooseRoom')}",
    "{language === 'am' ? 'ጨዋታውን ለመቀላቀል የመግቢያ ክፍያዎን መሰረት በማድረግ ክፍል ይምረጡ።' : 'Join a game by choosing a room based on the entry fee you wish to wager.'}": "{t('howToPlayDesc3')}",
    "{language === 'am' ? 'ቁጥሮችን ይምረጡ እና ይጫወቱ' : 'Pick numbers & BET'}": "{t('pickNumbersBet')}",
    "{language === 'am' ? 'ክፍል ከገቡ በኋላ መቀመጫዎችን ለመምረጥ 60 ሰከንዶች አልዎት። በጣም ፈጣን እና ቀላል ምርጫ።' : 'You have 60 seconds to pick a seat or seats after entering a room. Very fast and simple selection.'}": "{t('howToPlayDesc4')}",
    "{language === 'am' ? 'ሽልማት ይውሰዱ' : 'Draw A prize'}": "{t('drawPrize')}",
    "{language === 'am' ? 'ሰዓቱ 0 ሲደርስ፣ ዕጣው ይታያል። አሸናፊው 100% ሽልማቱን ይወስዳል (15% የአገልግሎት ክፍያ ይቀነሳል)።' : 'After the clock is 0, the drawing will be shown. The winner gets 100% of the pot minus 15%.'}": "{t('howToPlayDesc5')}",
    "{language === 'am' ? 'ጠቃሚ ምክሮች' : 'Tips'}": "{t('tips')}"
};

// Handle cases with weird unicode gibberish in the file by matching the English part
// since the gibberish comes from bad encoding of the amharic characters when reading via powershell or writing
// I'll replace using regex targeting the English string in the ternary.

content = content.replace(/\{language === 'am' \? '[^']*' : 'Join a game by choosing a room based on the entry fee you wish to wager.'\}/g, "{t('howToPlayDesc3')}");
content = content.replace(/\{language === 'am' \? '[^']*' : 'Pick numbers & BET'\}/g, "{t('pickNumbersBet')}");
content = content.replace(/\{language === 'am' \? '[^']*' : 'You have 60 seconds to pick a seat or seats after entering a room. Very fast and simple selection.'\}/g, "{t('howToPlayDesc4')}");
content = content.replace(/\{language === 'am' \? '[^']*' : 'Draw A prize'\}/g, "{t('drawPrize')}");
content = content.replace(/\{language === 'am' \? '[^']*' : 'After the clock is 0, the drawing will be shown. The winner gets 100% of the pot minus 15%.'\}/g, "{t('howToPlayDesc5')}");
content = content.replace(/\{language === 'am' \? '[^']*' : 'Tips'\}/g, "{t('tips')}");

// Also add these new keys to i18n
const amNewStr = `amh: "አማ",
        createAccount: "አካውንት ይፍጠሩ",
        chooseRoom: "ክፍል ይምረጡ",
        pickNumbersBet: "ቁጥሮችን ይምረጡ እና ይጫወቱ",
        drawPrize: "ሽልማት ይውሰዱ",
        tips: "ጠቃሚ ምክሮች",
        howToPlayDesc1: "በስምዎ፣ ስልክ ቁጥርዎ እና የይለፍ ቃል ይመዝገቡ። ስልክ ቁጥርዎ እንደ መግቢያ ስም (username) ያገለግላል።",
        howToPlayDesc2: "ወደ ዋሌት ይሂዱ። ለቀረበው የስልክ ቁጥር በቴሌብር ገንዘብ ይላኩ፣ ከዚያ የትራንዛክሽን ቁጥሩን ያስገቡ።",
        howToPlayDesc3: "ጨዋታውን ለመቀላቀል የመግቢያ ክፍያዎን መሰረት በማድረግ ክፍል ይምረጡ።",
        howToPlayDesc4: "ክፍል ከገቡ በኋላ መቀመጫዎችን ለመምረጥ 60 ሰከንዶች አልዎት። በጣም ፈጣን እና ቀላል ምርጫ።",
        howToPlayDesc5: "ሰዓቱ 0 ሲደርስ፣ ዕጣው ይታያል። አሸናፊው 100% ሽልማቱን ይወስዳል (15% የአገልግሎት ክፍያ ይቀነሳል)።",`;

const enNewStr = `amh: "AMH",
        createAccount: "Create an account",
        chooseRoom: "Choose a room",
        pickNumbersBet: "Pick numbers & BET",
        drawPrize: "Draw A prize",
        tips: "Tips",
        howToPlayDesc1: "Register with full name, phone number, and password. Your phone number is your username.",
        howToPlayDesc2: "Go to Wallet. Send Telebirr to the merchant phone, then enter the transaction number. Balance updates after verification.",
        howToPlayDesc3: "Join a game by choosing a room based on the entry fee you wish to wager.",
        howToPlayDesc4: "You have 60 seconds to pick a seat or seats after entering a room. Very fast and simple selection.",
        howToPlayDesc5: "After the clock is 0, the drawing will be shown. The winner gets 100% of the pot minus 15%.",`;

content = content.replace('amh: "አማ",\n        createAccount: "አካውንት ይፍጠሩ",', amNewStr);
content = content.replace('amh: "AMH",\n        createAccount: "Create an account",', enNewStr);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Final how to play translation strings replaced successfully.');
