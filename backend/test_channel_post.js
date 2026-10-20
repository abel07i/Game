require('dotenv').config();
const https = require('https');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHANNEL = process.env.VERIFICATION_CHANNEL || '@VerificationCodes';

if (!BOT_TOKEN || BOT_TOKEN === 'YOUR_BOT_TOKEN_HERE') {
  console.error('❌ TELEGRAM_BOT_TOKEN not configured in .env file');
  process.exit(1);
}

console.log('\n📢 Testing Channel Post...\n');
console.log('Bot Token:', BOT_TOKEN.substring(0, 20) + '...');
console.log('Channel:', CHANNEL);
console.log('');

const testMessage = `🧪 Test Message from Fast Equb\n\n` +
                   `This is a test to verify the bot can post to the verification channel.\n\n` +
                   `Time: ${new Date().toLocaleString()}\n` +
                   `Status: ✅ Working\n\n` +
                   `#Test #FastEqub`;

const data = JSON.stringify({
  chat_id: CHANNEL,
  text: testMessage,
  disable_notification: false
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

console.log('⏳ Sending test message to channel...\n');

const req = https.request(options, (res) => {
  let responseData = '';
  
  res.on('data', (chunk) => {
    responseData += chunk;
  });
  
  res.on('end', () => {
    console.log('Status Code:', res.statusCode);
    
    if (res.statusCode === 200) {
      console.log('\n✅ SUCCESS! Test message posted to channel!');
      console.log('\n📱 Check your Telegram channel:', CHANNEL);
      console.log('   You should see the test message.\n');
    } else {
      console.log('\n❌ FAILED to post message\n');
      const parsed = JSON.parse(responseData);
      console.log('Error:', parsed.description);
      
      if (parsed.description) {
        if (parsed.description.includes('chat not found')) {
          console.log('\n🔧 FIX: Channel not found or bot has no access');
          console.log('   Solutions:');
          console.log('   1. Check channel name/ID is correct in .env');
          console.log('   2. Add bot as admin: Channel → Administrators → Add @fasterekub_bot');
          console.log('   3. Give "Post Messages" permission');
          console.log('   4. If private channel, use channel ID instead of @username\n');
        } else if (parsed.description.includes('have no rights')) {
          console.log('\n🔧 FIX: Bot has no permission to post');
          console.log('   1. Go to channel → Administrators');
          console.log('   2. Find @fasterekub_bot');
          console.log('   3. Enable "Post Messages" permission');
          console.log('   4. Save and try again\n');
        } else if (parsed.description.includes('bot was blocked')) {
          console.log('\n🔧 FIX: Bot is blocked or removed from channel');
          console.log('   1. Go to channel → Administrators');
          console.log('   2. Add @fasterekub_bot back');
          console.log('   3. Enable "Post Messages" permission\n');
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
