# Verification Code Setup Guide

## How Password Reset Works

When you request a password reset, the system sends a 6-digit verification code to your Telegram account via **@fasterekub_bot**.

## Initial Setup (One-Time Only)

### Step 1: Start Chat with the Bot
1. Open Telegram
2. Search for: **@fasterekub_bot**
3. Click **"START"** button
4. The bot is now ready to send you verification codes

### Step 2: Get Your Telegram ID
1. In Telegram, search for: **@userinfobot**
2. Start a chat
3. The bot will reply with your ID (example: `123456789`)
4. Copy this number

### Step 3: Link Your Telegram Account

**Option A: During Registration (New Users)**
- When creating an account, enter your Telegram ID in the optional field
- This enables password recovery via Telegram

**Option B: For Existing Users**
Update your account in the database:
```bash
$env:PGPASSWORD="123!@#Fast"; psql -U postgres -d fastderash -c "UPDATE users SET telegram_id = 'YOUR_ID_HERE' WHERE phone_number = 'YOUR_PHONE'"
```

Replace:
- `YOUR_ID_HERE` with your Telegram ID from @userinfobot
- `YOUR_PHONE` with your registered phone number (e.g., `+251911234567`)

## How to Reset Your Password

1. Click **"Forgot Password?"** on the login page
2. Enter your phone number
3. Click **"Send Code"**
4. Check your Telegram for a message from @fasterekub_bot
5. Copy the 6-digit code
6. Enter the code and your new password
7. Done! You can now login with your new password

## Message Format

You'll receive a message like this:

```
🔐 Password Reset Verification

Code: 123456

Service: Fast Equb
Valid for: 10 minutes

⚠️ Never share this code with anyone.
If you didn't request this, ignore this message.
```

## Troubleshooting

### "No Telegram account linked" Error
- You haven't added your Telegram ID to your account
- Follow Step 3 above to link your Telegram account

### "Could not send Telegram message" Error
- You haven't started a chat with @fasterekub_bot
- Open Telegram, search for @fasterekub_bot, and click "START"

### Code Not Received
1. Check if you've started a chat with @fasterekub_bot
2. Verify your Telegram ID is correct in the database
3. Check if you've blocked the bot (unblock it if needed)
4. Wait a moment and check again - messages usually arrive within seconds

### Wrong Telegram ID
If you entered the wrong ID, update it:
```bash
$env:PGPASSWORD="123!@#Fast"; psql -U postgres -d fastderash -c "UPDATE users SET telegram_id = 'CORRECT_ID' WHERE phone_number = 'YOUR_PHONE'"
```

## Security Tips

- ✅ **DO**: Keep your Telegram ID private
- ✅ **DO**: Start the chat with @fasterekub_bot before requesting password reset
- ✅ **DO**: Enter codes immediately (they expire in 10 minutes)
- ❌ **DON'T**: Share verification codes with anyone
- ❌ **DON'T**: Use someone else's Telegram ID
- ❌ **DON'T**: Request codes you didn't initiate

## About @VerificationCodes Bot

The @VerificationCodes bot is a third-party Telegram bot that aggregates verification codes. Our system sends codes directly via @fasterekub_bot instead, which is:
- ✅ More secure (codes go only to you)
- ✅ Faster (direct delivery)
- ✅ More reliable (no third-party dependency)
- ✅ Better privacy (codes not stored elsewhere)

## Need Help?

If you're still having issues:
1. Test your setup: `node backend/test_telegram_bot.js YOUR_TELEGRAM_ID`
2. Check bot status: `node backend/get_bot_info.js`
3. Contact support with your phone number (not your password!)
