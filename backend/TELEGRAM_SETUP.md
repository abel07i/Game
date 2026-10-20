# Telegram Bot Setup for Password Reset

This guide explains how to set up the Telegram bot for password reset verification codes.

## 1. Create a Telegram Bot

1. Open Telegram and search for `@BotFather`
2. Send `/newbot` command
3. Follow the instructions to name your bot
4. Copy the **Bot Token** provided by BotFather

## 2. Configure the Bot Token

1. Open `backend/.env` file
2. Replace `YOUR_BOT_TOKEN_HERE` with your actual bot token:
   ```
   TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
   ```

## 3. Run Database Migration

Run the SQL migration to add telegram support:

```bash
psql -U postgres -d fastderash -f backend/db/add_telegram_reset.sql
```

Or using the node.js scripts:
```bash
node backend/check.js
```

## 4. Link User Telegram Accounts

Users need to link their Telegram account to their phone number. There are two ways:

### Option A: Admin Update (Manual)
Update the `telegram_id` for users directly in the database:

```sql
UPDATE users 
SET telegram_id = '123456789' 
WHERE phone_number = '+251911234567';
```

To get a user's Telegram ID, they can:
1. Message `@userinfobot` on Telegram
2. The bot will reply with their User ID

### Option B: Automatic Linking (Recommended)
Create a registration flow where users:
1. Register on the website with their phone number
2. Click "Link Telegram Account"
3. Start a conversation with your bot
4. Bot sends a verification code
5. User enters code on website
6. System links telegram_id to their account

## 5. Test the Password Reset Flow

1. User clicks "Forgot Password?"
2. Enters their phone number
3. Receives verification code on Telegram via `@YourBotName`
4. Enters code and new password
5. Password is reset successfully

## 6. Verification Code Bot (@verificationcodes)

If you want to use the `@verificationcodes` bot mention in your messages:
- The codes will be sent to your custom bot
- Users can also see them in the `@verificationcodes` channel
- This provides a centralized place for all verification codes

## Security Notes

- Verification codes expire after 10 minutes
- Codes can only be used once
- Telegram IDs are stored securely in the database
- Bot token should be kept secret (never commit to git)

## Troubleshooting

**Issue:** User says they didn't receive the code
- Verify their `telegram_id` is correctly set in the database
- Check if they've started a conversation with your bot
- Check server logs for Telegram API errors

**Issue:** "No Telegram account linked" error
- User needs to have their `telegram_id` set in the database
- Follow Option A or B above to link their account
