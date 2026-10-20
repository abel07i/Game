# Shamo.bet-Style Verification System

This document explains how our verification system works, inspired by shamo.bet's approach.

## How It Works

Like shamo.bet, our system sends verification codes via Telegram for password recovery. The codes are sent through **@fasterekub_bot** directly to your personal Telegram account.

## Quick Setup (3 Steps)

### 1️⃣ Start Chat with Bot
Open this link in Telegram or your browser:
**https://t.me/fasterekub_bot**

Click **"START"** to begin the conversation.

### 2️⃣ Get Your Telegram ID
1. Open: **https://t.me/userinfobot**
2. Click "START"
3. Copy your ID (example: `123456789`)

### 3️⃣ Link Your Account
- **New users**: Enter your Telegram ID during registration
- **Existing users**: Update via database (see below)

## For Existing Users

Update your Telegram ID in the database:

```powershell
$env:PGPASSWORD="123!@#Fast"; psql -U postgres -d fastderash -c "UPDATE users SET telegram_id = 'YOUR_TELEGRAM_ID' WHERE phone_number = 'YOUR_PHONE_NUMBER'"
```

Example:
```powershell
$env:PGPASSWORD="123!@#Fast"; psql -U postgres -d fastderash -c "UPDATE users SET telegram_id = '123456789' WHERE phone_number = '+251911234567'"
```

## Password Reset Flow

1. **Forgot Password?** → Click the link on login page
2. **Enter Phone** → Submit your registered phone number
3. **Check Telegram** → Code sent to @fasterekub_bot chat
4. **Enter Code** → Copy & paste the 6-digit code
5. **New Password** → Set and confirm new password
6. **Done!** → Login with new password

## Verification Message Format

You'll receive a message like:

```
✅ Fast Equb Verification Code

Your code: 123456

Valid for 10 minutes
#verification #code
```

## Comparison with Shamo.bet

| Feature | Shamo.bet | Our System |
|---------|-----------|------------|
| Telegram codes | ✅ Yes | ✅ Yes |
| Direct delivery | ✅ Yes | ✅ Yes |
| Bot required | ✅ Yes | ✅ Yes |
| Start chat first | ✅ Yes | ✅ Yes |
| Code expiry | ⏱️ 10 min | ⏱️ 10 min |
| Registration link | ✅ Optional | ✅ Optional |

## Why Not @VerificationCodes?

While @VerificationCodes is a popular bot, using our own bot (@fasterekub_bot) provides:

✅ **Better Security**: Codes go only to you, not through third-party
✅ **Faster Delivery**: Direct from our server to you
✅ **More Reliable**: No dependency on external services
✅ **Better Privacy**: Your codes aren't stored elsewhere
✅ **Custom Format**: Tailored for our platform

## Common Issues & Solutions

### ❌ "Could not send verification code"
**Problem**: You haven't started a chat with the bot

**Solution**: 
1. Open https://t.me/fasterekub_bot
2. Click "START"
3. Try password reset again

### ❌ "No Telegram account linked"
**Problem**: Your account doesn't have a Telegram ID

**Solution**:
- New users: Enter ID during registration
- Existing users: Run the UPDATE command above

### ❌ "User not found"
**Problem**: Phone number not registered

**Solution**: Check your phone number format (e.g., +251911234567)

### ❌ Code not received
**Checklist**:
- ✅ Started chat with @fasterekub_bot?
- ✅ Correct Telegram ID in database?
- ✅ Bot not blocked?
- ✅ Internet connection stable?

## Testing Your Setup

### Test 1: Check Bot Status
```bash
node backend/get_bot_info.js
```

### Test 2: Send Test Message
```bash
node backend/test_telegram_bot.js YOUR_TELEGRAM_ID
```

Replace `YOUR_TELEGRAM_ID` with your actual ID from @userinfobot.

### Test 3: Verify Database
```powershell
$env:PGPASSWORD="123!@#Fast"; psql -U postgres -d fastderash -c "SELECT phone_number, telegram_id FROM users WHERE phone_number = 'YOUR_PHONE'"
```

## Security Best Practices

🔒 **DO:**
- Keep your Telegram ID private
- Start chat with bot before requesting codes
- Use codes immediately (10-minute expiry)
- Verify the code sender is @fasterekub_bot

🚫 **DON'T:**
- Share verification codes with anyone
- Give your Telegram ID to untrusted sources
- Reuse old/expired codes
- Request codes you didn't initiate

## Production Deployment

For production, ensure:

1. ✅ `TELEGRAM_BOT_TOKEN` is set in `.env`
2. ✅ Database migration completed
3. ✅ Bot username updated in messages
4. ✅ SSL/TLS enabled for API
5. ✅ Rate limiting enabled (prevent spam)
6. ✅ Logging configured for debugging

## Support

If you're still having issues after following this guide:

1. Check server logs for errors
2. Verify bot token is correct
3. Test with the provided scripts
4. Ensure PostgreSQL is running
5. Contact technical support with:
   - Phone number (NOT password!)
   - Error message received
   - Steps already tried

---

**Bot Username**: @fasterekub_bot  
**Bot Link**: https://t.me/fasterekub_bot  
**Get Your ID**: https://t.me/userinfobot
