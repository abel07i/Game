const https = require('https');
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'public', 'sounds', 'voice');
if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
}

const sounds = {
    'warning': "የከፈቱት ክፍል እጣ ሊወጣ አስር ሰከንድ ብቻ ቀርቷል",
    '10': "አስር",
    '9': "ዘጠኝ",
    '8': "ስምንት",
    '7': "ሰባት",
    '6': "ስድስት",
    '5': "አምስት",
    '4': "አራት",
    '3': "ሶስት",
    '2': "ሁለት",
    '1': "አንድ",
    'winner': "ዕጣው የወጣለት አሸናፊ ቁጥር ነው! እንኳን ደስ አሎት!"
};

const downloadAudio = (filename, text) => {
    return new Promise((resolve, reject) => {
        const url = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=am&q=${encodeURIComponent(text)}`;
        const dest = path.join(dir, `${filename}.mp3`);
        const file = fs.createWriteStream(dest);
        
        https.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to get '${url}' (${response.statusCode})`));
                return;
            }
            response.pipe(file);
            file.on('finish', () => {
                file.close(resolve);
            });
        }).on('error', (err) => {
            fs.unlink(dest, () => {});
            reject(err);
        });
    });
};

async function downloadAll() {
    console.log("Downloading audio files...");
    for (const [key, text] of Object.entries(sounds)) {
        try {
            await downloadAudio(key, text);
            console.log(`Downloaded ${key}.mp3`);
        } catch (err) {
            console.error(`Failed ${key}:`, err);
        }
    }
    console.log("All audio files downloaded.");
}

downloadAll();
