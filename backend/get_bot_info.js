require('dotenv').config();
const https = require('https');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!BOT_TOKEN || BOT_TOKEN === 'YOUR_BOT_TOKEN_HERE') {
  console.error('❌ TELEGRAM_BOT_TOKEN not configured in .env file');
  process.exit(1);
}

console.log('🤖 Getting bot information...\n');

const options = {
  hostname: 'api.telegram.org',
  port: 443,
  path: `/bot${BOT_TOKEN}/getMe`,
  method: 'GET'
};

const req = https.request(options, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    const response = JSON.parse(data);
    
    if (response.ok) {
      const bot = response.result;
      console.log('✅ Bot Configuration:');
      console.log('├─ Name:', bot.first_name);
      console.log('├─ Username: @' + bot.username);
      console.log('├─ ID:', bot.id);
      console.log('└─ Can Read Messages:', bot.can_read_all_group_messages || false);
      
      console.log('\n📱 To receive password reset codes:');
      console.log('1. Open Telegram');
      console.log('2. Search for: @' + bot.username);
      console.log('3. Click "START" to begin conversation');
      console.log('4. Get your Telegram ID from @userinfobot');
      console.log('5. Add your Telegram ID during registration\n');
      
      console.log('🧪 Test the bot:');
      console.log(`node backend/test_telegram_bot.js YOUR_TELEGRAM_ID\n`);
    } else {
      console.error('❌ Error:', response.description);
    }
  });
});

req.on('error', (e) => {
  console.error('❌ Request failed:', e.message);
});

req.end();
