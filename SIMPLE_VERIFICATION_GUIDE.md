# Simple Verification Code System - User Guide

## For Users: How to Reset Your Password

### Step 1: Subscribe to Verification Channel
Open Telegram and join our verification channel where codes are posted:
- **Channel**: @VerificationCodes (or your custom channel)
- Search in Telegram and click "Join"

### Step 2: Request Password Reset
1. Go to the login page
2. Click **"Forgot Password?"**
3. Enter your phone number
4. Click **"Send Code"**

### Step 3: Get Your Code
1. Open Telegram
2. Go to the verification channel
3. Look for the newest message with your phone number
4. Copy the 6-digit code

### Step 4: Reset Password
1. Return to the app
2. Enter the verification code
3. Enter your new password
4. Confirm the new password
5. Click **"Reset Password"**

### Done!
You can now login with your new password.

---

## For Developers: Setup Instructions

### Quick Setup (3 Minutes)

**1. Create Your Verification Channel**

```bash
# Option A: Use existing channel
Open Telegram → Search @VerificationCodes → Join

# Option B: Create your own (Recommended)
Open Telegram → New Channel → Name it "Fast Equb Codes"
Make it Public → Set username @FastEqubCodes
```

**2. Add Bot as Admin**

```bash
Open your channel
→ Channel name
→ Administrators
→ Add Administrator
→ Search: @fasterekub_bot
→ Enable "Post Messages" only
→ Save
```

**3. Configure Channel in .env**

```env
# Your custom channel
VERIFICATION_CHANNEL=@FastEqubCodes

# Or use channel ID for private channels
VERIFICATION_CHANNEL=-1001234567890
```

**4. Test the Setup**

```bash
# Test bot can post
node backend/test_channel_post.js

# Should see ✅ SUCCESS and message in channel
```

**5. Restart Server**

```bash
# Stop current server
Ctrl+C

# Start again
node backend/server.js
```

### That's It!

Now when users request password reset:
- ✅ Code is posted to channel
- ✅ Users check channel for their code
- ✅ No Telegram ID linking needed
- ✅ Simple and fast

---

## Benefits of This Approach

### For Users:
✅ **Simple** - Just enter phone number
✅ **No Setup** - Subscribe to channel once
✅ **Fast** - Codes appear instantly
✅ **Reliable** - Public channel always accessible

### For Developers:
✅ **Easy Setup** - 5 minutes configuration
✅ **No Complexity** - No individual user linking
✅ **Scalable** - Handles unlimited users
✅ **Transparent** - Users see it working

---

## Troubleshooting

### Problem: Bot can't post to channel

**Solution**:
```bash
# 1. Check bot is admin
Telegram → Your Channel → Administrators → Should see @fasterekub_bot

# 2. Check permission
Bot should have "Post Messages" enabled

# 3. Test again
node backend/test_channel_post.js
```

### Problem: Users don't see codes

**Solution**:
```bash
# 1. Check they joined the channel
User opens Telegram → Search @YourChannel → Click Join

# 2. Check channel name in .env
VERIFICATION_CHANNEL=@YourChannel  # Must match exactly

# 3. Check server logs
Look for "Verification code posted to channel" message
```

### Problem: Wrong channel name

**Solution**:
```bash
# Get correct channel username
Open channel in Telegram → Channel name → See username

# Update .env
VERIFICATION_CHANNEL=@CorrectName

# Restart server
Ctrl+C then start again
```

---

## Production Tips

### Security (Important!)

**Hide full phone numbers in production:**

Edit `backend/server.js` line ~195:
```javascript
// Current (shows +251****567)
Phone: ${phoneNumber.substring(0, 4)}****${phoneNumber.substring(phoneNumber.length - 3)}

// More secure (shows +25*******7)
Phone: ${phoneNumber.substring(0, 3)}*******${phoneNumber.substring(phoneNumber.length - 1)}
```

### Private Channel (Recommended)

For production, use a private channel:

```bash
# 1. Create private channel
Telegram → New Channel → Keep it Private

# 2. Add bot as admin
Add @fasterekub_bot with "Post Messages" permission

# 3. Get channel ID
Forward any message from channel to @userinfobot
Copy the ID (example: -1001234567890)

# 4. Update .env
VERIFICATION_CHANNEL=-1001234567890

# 5. Share invite link with users
Channel → Invite via Link → Copy link
```

### Rate Limiting

Add rate limiting to prevent spam:

```javascript
// Limit: 3 code requests per phone per hour
const MAX_REQUESTS = 3;
const TIME_WINDOW = 60 * 60 * 1000; // 1 hour
```

---

## File Structure

```
backend/
├── .env                          # Configuration
├── server.js                     # Main server (updated)
├── test_channel_post.js          # Test channel posting
├── get_bot_info.js              # Check bot status
└── db/
    └── add_telegram_reset.sql   # Database migration

docs/
├── SIMPLE_VERIFICATION_GUIDE.md  # This file
└── VERIFICATION_CHANNEL_SETUP.md # Detailed setup
```

---

## Support

**Bot Not Working?**
```bash
# Check bot status
node backend/get_bot_info.js

# Test channel post
node backend/test_channel_post.js
```

**Database Issues?**
```bash
# Check tables exist
psql -U postgres -d fastderash -c "\d password_reset_codes"
```

**Need Help?**
- Check server logs for errors
- Verify bot token in .env
- Ensure channel setup is correct
- Test with provided scripts

---

**Quick Links:**
- Bot: https://t.me/fasterekub_bot
- Get Telegram ID: https://t.me/userinfobot
- Your Channel: @YourChannelName (update after setup)
