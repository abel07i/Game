# @VerificationCodes Channel Setup

This guide explains how to set up verification codes to be posted to a Telegram channel like @VerificationCodes.

## How It Works

When a user requests a password reset:
1. User enters their phone number
2. System generates a 6-digit code
3. Code is posted to a Telegram channel (@VerificationCodes or your own)
4. User checks the channel for their code
5. User enters the code to reset password

## Benefits

✅ **No Telegram ID Required** - Users don't need to link accounts
✅ **Simple for Users** - Just enter phone number
✅ **Public Channel** - Users can subscribe once and see all codes
✅ **No Bot Chat Needed** - No need to start individual chats

## Setup Options

### Option 1: Use Existing @VerificationCodes Channel

**Limitation**: You cannot post to the official @VerificationCodes channel as it's owned by someone else.

### Option 2: Create Your Own Verification Channel (Recommended)

This is the best approach for your platform.

#### Step 1: Create a Telegram Channel

1. Open Telegram
2. Click menu → New Channel
3. Name it (e.g., "Fast Equb Codes")
4. Choose "Public Channel"
5. Set username (e.g., @FastEqubCodes)
6. Create the channel

#### Step 2: Add Your Bot as Admin

1. Go to your channel
2. Click channel name → Administrators
3. Click "Add Administrator"
4. Search for: @fasterekub_bot
5. Give it "Post Messages" permission
6. Save

#### Step 3: Update Configuration

Edit `backend/.env`:

```env
VERIFICATION_CHANNEL=@FastEqubCodes
```

Or use the channel ID (recommended for private channels):
```env
VERIFICATION_CHANNEL=-1001234567890
```

To get channel ID:
1. Forward any message from channel to @userinfobot
2. It will show the channel ID

### Option 3: Use a Private Channel

For more security, use a private channel:

1. Create a channel (keep it private)
2. Add @fasterekub_bot as admin
3. Get the channel ID (forward message to @userinfobot)
4. Set in `.env`: `VERIFICATION_CHANNEL=-1001234567890`
5. Share invite link with users

## Testing the Setup

### Test 1: Check Bot Can Post

```bash
node backend/test_channel_post.js
```

This will post a test message to verify permissions.

### Test 2: Request Password Reset

1. Go to login page
2. Click "Forgot Password?"
3. Enter a registered phone number
4. Check your verification channel
5. You should see the code appear

## Message Format

Codes appear in the channel like this:

```
🔐 Fast Equb Password Reset

Phone: +251****567
Code: 123456

Valid for: 10 minutes
Time: 2024-01-15 14:30:45

#FastEqub #Verification
```

## User Instructions

Tell your users to:

1. **Subscribe to Channel**
   - Open Telegram
   - Search: @YourChannelName
   - Click "Join"

2. **Request Password Reset**
   - Go to login page
   - Click "Forgot Password?"
   - Enter phone number

3. **Check Channel**
   - Open the verification channel
   - Look for the latest message with your phone
   - Copy the 6-digit code

4. **Reset Password**
   - Enter the code
   - Set new password
   - Login with new password

## Security Considerations

⚠️ **Important Security Notes:**

1. **Phone Number Privacy**
   - Codes show partial phone: `+251****567`
   - Last 3 digits visible for identification
   - First digits hidden for privacy

2. **Code Expiry**
   - Codes expire after 10 minutes
   - Old codes cannot be reused
   - Marked as used after successful reset

3. **Channel Visibility**
   - Public channel = anyone can see codes
   - Consider using private channel for production
   - Users need invite link to join private channel

4. **Bot Permissions**
   - Bot only needs "Post Messages" permission
   - Don't give admin rights for other functions
   - Review permissions regularly

## Production Recommendations

For production deployment:

✅ **Use a Private Channel**
```env
VERIFICATION_CHANNEL=-1001234567890
```

✅ **Hide Full Phone Number**
```javascript
// Show even less: +25*******67
`Phone: +${phoneNumber.substring(0, 3)}*******${phoneNumber.substring(phoneNumber.length - 2)}`
```

✅ **Add Rate Limiting**
- Limit code requests per phone (e.g., max 3 per hour)
- Prevent spam/abuse

✅ **Monitor Channel**
- Set up alerts for unusual activity
- Review logs regularly

✅ **User Communication**
- Add channel link in app
- Show in-app instructions
- Email users the channel link

## Troubleshooting

### Bot Can't Post to Channel

**Error**: `Chat not found` or `Forbidden`

**Fix**:
1. Check bot is admin of channel
2. Verify "Post Messages" permission enabled
3. Try using channel ID instead of @username
4. Ensure channel is public or bot has access

### Codes Not Appearing

**Checklist**:
- ✅ Bot token correct in `.env`?
- ✅ Channel name/ID correct in `.env`?
- ✅ Bot is admin of channel?
- ✅ Server restarted after `.env` changes?
- ✅ Check server logs for errors?

### Wrong Channel ID

Get the correct ID:
```bash
node backend/get_channel_id.js @YourChannelName
```

## Alternative: Multiple Channels

For high volume, create multiple channels by category:

```env
# Password resets
VERIFICATION_CHANNEL_PASSWORD=@FastEqubPasswordReset

# Login codes  
VERIFICATION_CHANNEL_LOGIN=@FastEqubLoginCodes

# Transaction verifications
VERIFICATION_CHANNEL_TRANSACTION=@FastEqubTransactionCodes
```

Update code to use appropriate channel based on action type.

## Support

Common user questions:

**Q: I don't see my code**
A: Check you joined the channel (@YourChannelName). Scroll to newest message.

**Q: Code expired**
A: Codes last 10 minutes. Request a new one.

**Q: Wrong code**
A: Make sure you're using the latest code for YOUR phone number.

**Q: Can't join channel**
A: If private, get invite link from support. If public, search channel name in Telegram.

---

**Bot**: @fasterekub_bot
**Channel**: @YourChannelName (update after setup)
