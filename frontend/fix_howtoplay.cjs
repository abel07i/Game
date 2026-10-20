const fs = require('fs');

const filePath = 'src/App.jsx';
let content = fs.readFileSync(filePath, 'utf8');

// Update AMH dict
const amOldStr = 'awesome: "አስደናቂ!"';
const amNewStr = `awesome: "አስደናቂ!",
        amh: "አማ",
        howToPlayTitle: "እንዴት እንደሚጫወቱ (How to play)",
        stepRegister: "ይመዝገቡ (Register)",
        stepDeposit: "ገንዘብ ያስገቡ (Deposit)",
        stepPlayWin: "ይጫወቱ እና ያሸንፉ (Play & Win)",
        phoneEqualsUsername: "ስልክ = መግቢያ ስም (Phone = username)",
        depositTelebirr: "ቴሌብር ያስገቡ (Deposit Telebirr)",
        balanceUpdates: "ሲረጋገጥ ቀሪ ሂሳብ ይሞላል (Balance updates after verification)"`;

// Update EN dict
const enOldStr = 'awesome: "Awesome!"';
const enNewStr = `awesome: "Awesome!",
        amh: "AMH",
        howToPlayTitle: "How to play",
        stepRegister: "Register",
        stepDeposit: "Deposit",
        stepPlayWin: "Play & Win",
        phoneEqualsUsername: "Phone = username",
        depositTelebirr: "Deposit Telebirr",
        balanceUpdates: "Balance updates after verification"`;

content = content.replace(amOldStr, amNewStr).replace(enOldStr, enNewStr);

const replacements = {
    '<h2 className="text-3xl font-bold text-white mb-4">How to play</h2>': '<h2 className="text-3xl font-bold text-white mb-4">{t(\'howToPlayTitle\')}</h2>',
    '<span className="text-equb-400 mr-1.5">★</span> Register': '<span className="text-equb-400 mr-1.5">★</span> {t(\'stepRegister\')}',
    '<span className="text-equb-400 mr-1.5">✓</span> Deposit': '<span className="text-equb-400 mr-1.5">✓</span> {t(\'stepDeposit\')}',
    '<span className="text-equb-400 mr-1.5">🎮</span> Play & Win': '<span className="text-equb-400 mr-1.5">🎮</span> {t(\'stepPlayWin\')}',
    'Phone = username': '{t(\'phoneEqualsUsername\')}',
    'Balance updates after verification': '{t(\'balanceUpdates\')}',
    'Register with full name, phone number, and password. Your phone number is your username.': '{t(\'howToPlayDesc1\')}',
    'Go to Wallet. Send Telebirr to the merchant phone, then enter the transaction number. Balance updates after verification.': '{t(\'howToPlayDesc2\')}',
};

for (const [oldText, newText] of Object.entries(replacements)) {
    content = content.replace(oldText, newText);
    content = content.replace(oldText, newText); // some occur multiple times
}

// Add the desc translations since I missed them above
const amNewStr2 = `amh: "አማ",
        howToPlayDesc1: "በስምዎ፣ ስልክ ቁጥርዎ እና የይለፍ ቃል ይመዝገቡ። ስልክ ቁጥርዎ እንደ መግቢያ ስም (username) ያገለግላል።",
        howToPlayDesc2: "ወደ ዋሌት ይሂዱ። ለቀረበው የስልክ ቁጥር በቴሌብር ገንዘብ ይላኩ፣ ከዚያ የትራንዛክሽን ቁጥሩን ያስገቡ።",`;
const enNewStr2 = `amh: "AMH",
        howToPlayDesc1: "Register with full name, phone number, and password. Your phone number is your username.",
        howToPlayDesc2: "Go to Wallet. Send Telebirr to the merchant phone, then enter the transaction number. Balance updates after verification.",`;

content = content.replace('amh: "አማ",', amNewStr2);
content = content.replace('amh: "AMH",', enNewStr2);

// Replace the ternary operators with the translations
content = content.replace(
    "{language === 'am' ? 'በስምዎ፣ ስልክ ቁጥርዎ እና የይለፍ ቃል ይመዝገቡ። ስልክ ቁጥርዎ እንደ መግቢያ ስም (username) ያገለግላል።' : 'Register with full name, phone number, and password. Your phone number is your username.'}",
    "{t('howToPlayDesc1')}"
);
content = content.replace(
    "{language === 'am' ? 'ወደ ዋሌት ይሂዱ። ለቀረበው የስልክ ቁጥር በቴሌብር ገንዘብ ይላኩ፣ ከዚያ የትራንዛክሽን ቁጥሩን ያስገቡ።' : 'Go to Wallet. Send Telebirr to the merchant phone, then enter the transaction number. Balance updates after verification.'}",
    "{t('howToPlayDesc2')}"
);
content = content.replace(
    "{language === 'am' ? 'አካውንት ይፍጠሩ' : 'Create an account'}",
    "{t('createAccount')}"
);

// Add createAccount
const amNewStr3 = `amh: "አማ",
        createAccount: "አካውንት ይፍጠሩ",`;
const enNewStr3 = `amh: "AMH",
        createAccount: "Create an account",`;
content = content.replace('amh: "አማ",', amNewStr3);
content = content.replace('amh: "AMH",', enNewStr3);

// Fix t('amh') capitalization on the toggle
content = content.replace(
    "{t('amh')}</button>",
    "{language === 'am' ? 'አማ' : 'AMH'}</button>"
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Translation strings replaced successfully.');
