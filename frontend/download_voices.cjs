const https = require('https');
const fs = require('fs');
const path = require('path');

const voiceDir = path.join(__dirname, 'public', 'sounds', 'voice');
if (!fs.existsSync(voiceDir)) {
  fs.mkdirSync(voiceDir, { recursive: true });
}

const filesToDownload = [
  // Amharic voices
  {
    name: 'lose_am.mp3',
    tl: 'am',
    text: 'ጨዋታውን ተሸንፈዋል፣ እንደገና ይሞክሩ እና እድልዎን ይውሰዱ'
  },
  {
    name: 'win_am.mp3',
    tl: 'am',
    text: 'እንኳን ደስ አለዎት! የጨዋታው አሸናፊ ሆነዋል እና ገንዘብ አሸንፈዋል!'
  },
  {
    name: 'finish_am.mp3',
    tl: 'am',
    text: 'ጨዋታው ተጠናቋል! አሸናፊ ተመርጧል!'
  },
  // English voices
  {
    name: 'win_en.mp3',
    tl: 'en',
    text: 'Congratulations! You are the winner of the game and won money!'
  },
  {
    name: 'lose_en.mp3',
    tl: 'en',
    text: 'You lost the game, try again and take a chance!'
  },
  {
    name: 'finish_en.mp3',
    tl: 'en',
    text: 'Game finished! Winner has been selected!'
  },
  // English countdown 1-10
  { name: 'en_1.mp3', tl: 'en', text: 'One' },
  { name: 'en_2.mp3', tl: 'en', text: 'Two' },
  { name: 'en_3.mp3', tl: 'en', text: 'Three' },
  { name: 'en_4.mp3', tl: 'en', text: 'Four' },
  { name: 'en_5.mp3', tl: 'en', text: 'Five' },
  { name: 'en_6.mp3', tl: 'en', text: 'Six' },
  { name: 'en_7.mp3', tl: 'en', text: 'Seven' },
  { name: 'en_8.mp3', tl: 'en', text: 'Eight' },
  { name: 'en_9.mp3', tl: 'en', text: 'Nine' },
  { name: 'en_10.mp3', tl: 'en', text: 'Ten' }
];

function downloadFile(item) {
  return new Promise((resolve, reject) => {
    const url = 'https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=' + item.tl + '&q=' + encodeURIComponent(item.text);
    const dest = path.join(voiceDir, item.name);
    const file = fs.createWriteStream(dest);

    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to download ${item.name}: status ${res.statusCode}`));
      }
      res.pipe(file);
      file.on('finish', () => {
        file.close(() => {
          console.log(`✅ Downloaded: ${item.name} (${item.tl}) - "${item.text}"`);
          resolve();
        });
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

async function run() {
  for (const item of filesToDownload) {
    try {
      await downloadFile(item);
      // Brief pause to be gentle
      await new Promise(r => setTimeout(r, 200));
    } catch (e) {
      console.error(`❌ Error downloading ${item.name}:`, e.message);
    }
  }
  console.log('🎉 All voice assets ready!');
}

run();
