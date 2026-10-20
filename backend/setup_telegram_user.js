require('dotenv').config();
const db = require('./src/db');

async function setupTelegramUser() {
  console.log('\n🚀 Fast Equb - Telegram Verification Setup\n');
  console.log('This wizard will help you link your Telegram account for password recovery.\n');

  // Get command line arguments
  const phoneNumber = process.argv[2];
  const telegramId = process.argv[3];

  if (!phoneNumber || !telegramId) {
    console.log('❌ Usage: node setup_telegram_user.js <phone_number> <telegram_id>\n');
    console.log('Example: node setup_telegram_user.js +251911234567 123456789\n');
    console.log('📱 Steps to get your Telegram ID:');
    console.log('1. Open Telegram');
    console.log('2. Search for @userinfobot');
    console.log('3. Start a chat - the bot will reply with your ID');
    console.log('4. Copy the number\n');
    console.log('⚠️  Important: Start a chat with @fasterekub_bot first!');
    console.log('   Link: https://t.me/fasterekub_bot\n');
    process.exit(1);
  }

  try {
    console.log('📞 Phone Number:', phoneNumber);
    console.log('🆔 Telegram ID:', telegramId);
    console.log('');

    // Check if user exists
    const userCheck = await db.query(
      'SELECT id, display_name, telegram_id FROM users WHERE phone_number = $1',
      [phoneNumber]
    );

    if (userCheck.rowCount === 0) {
      console.log('❌ Error: No user found with phone number:', phoneNumber);
      console.log('   Please check the phone number and try again.\n');
      process.exit(1);
    }

    const user = userCheck.rows[0];
    console.log('✅ User found:', user.display_name);

    // Check if Telegram ID is already in use
    const telegramCheck = await db.query(
      'SELECT id, display_name, phone_number FROM users WHERE telegram_id = $1 AND id != $2',
      [telegramId, user.id]
    );

    if (telegramCheck.rowCount > 0) {
      const existingUser = telegramCheck.rows[0];
      console.log('❌ Error: This Telegram ID is already linked to another account');
      console.log('   Linked to:', existingUser.display_name);
      console.log('   Phone:', existingUser.phone_number);
      console.log('   Each Telegram ID can only be linked to one account.\n');
      process.exit(1);
    }

    // Update the user's Telegram ID
    await db.query(
      'UPDATE users SET telegram_id = $1, updated_at = NOW() WHERE id = $2',
      [telegramId, user.id]
    );

    console.log('✅ Telegram ID linked successfully!\n');
    
    if (user.telegram_id && user.telegram_id !== telegramId) {
      console.log('ℹ️  Previous Telegram ID:', user.telegram_id);
      console.log('   Updated to:', telegramId, '\n');
    }

    console.log('🎉 Setup complete! You can now:');
    console.log('   ✅ Reset your password via Telegram');
    console.log('   ✅ Receive verification codes at @fasterekub_bot\n');

    console.log('🧪 Test it now:');
    console.log(`   node backend/test_telegram_bot.js ${telegramId}\n`);

    process.exit(0);
  } catch (err) {
    console.error('❌ Database error:', err.message);
    process.exit(1);
  }
}

setupTelegramUser();
