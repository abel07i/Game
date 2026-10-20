require('dotenv').config();
const https = require('https');

// Get bot token from .env
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!BOT_TOKEN || BOT_TOKEN === 'YOUR_BOT_TOKEN_HERE') {
  console.error('❌ TELEGRAM_BOT_TOKEN not configured in .env file');
  process.exit(1);
}

console.log('✅ Bot Token found:', BOT_TOKEN.substring(0, 20) + '...');

// Get chat ID from command line argument
const CHAT_ID = process.argv[2];

if (!CHAT_ID) {
  console.error('\n❌ Usage: node test_telegram_bot.js <YOUR_TELEGRAM_ID>');
  console.error('\nTo get your Telegram ID:');
  console.error('1. Open Telegram');
  console.error('2. Search for @userinfobot');
  console.error('3. Start a chat with the bot');
  console.error('4. Copy your ID number');
  console.error('\nExample: node test_telegram_bot.js 123456789\n');
  process.exit(1);
}

console.log('📱 Testing message to Telegram ID:', CHAT_ID);
console.log('⏳ Sending test message...\n');

// Test message
const message = `🎉 Test Message\n\nIf you received this, your Telegram bot is working correctly!\n\nBot Token: ${BOT_TOKEN.substring(0, 20)}...\nYour ID: ${CHAT_ID}`;

const data = JSON.stringify({
  chat_id: CHAT_ID,
  text: message,
  parse_mode: 'Markdown'
});

const options = {
  hostname: 'api.telegram.org',
  port: 443,
  path: `/bot${BOT_TOKEN}/sendMessage`,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = https.request(options, (res) => {
  let responseData = '';
  
  res.on('data', (chunk) => {
    responseData += chunk;
  });
  
  res.on('end', () => {
    console.log('Status Code:', res.statusCode);
    console.log('Response:', responseData);
    
    if (res.statusCode === 200) {
      console.log('\n✅ SUCCESS! Message sent to Telegram!');
      console.log('Check your Telegram app for the test message.');
    } else {
      console.log('\n❌ FAILED to send message');
      const parsed = JSON.parse(responseData);
      
      if (parsed.description) {
        console.log('\nError:', parsed.description);
        
        if (parsed.description.includes('chat not found')) {
          console.log('\n🔧 FIX: You need to start a conversation with your bot first!');
          console.log('1. Open Telegram');
          console.log('2. Search for your bot username');
          console.log('3. Click "START" to begin the conversation');
          console.log('4. Run this test again\n');
        } else if (parsed.description.includes('bot was blocked')) {
          console.log('\n🔧 FIX: You blocked the bot. Unblock it in Telegram and try again.\n');
        }
      }
    }
  });
});

req.on('error', (e) => {
  console.error('❌ Request failed:', e.message);
});

req.write(data);
req.end();
