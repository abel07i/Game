const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const path   = require('path');
const cors   = require('cors');

const db           = require('./src/db');
const walletLedger = require('./src/walletLedger');
const roomManager  = require('./src/roomManager');
const adminRoutes  = require('./src/adminRoutes');
const { generateToken, verifyToken, hashPassword, verifyPassword } = require('./src/adminAuth');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());

// ── Admin API Routes ──────────────────────────────────────────────────────────
app.use('/api/v1/admin', adminRoutes);

// Serve built frontend (production)
app.use(express.static(path.join(__dirname, '../frontend')));

// Give roomManager access to the socket server
roomManager.setIo(io);

// ── Player JWT helpers ────────────────────────────────────────────────────────

function generatePlayerToken(userId) {
  return generateToken({ id: userId, role: 'player', email: '' });
}

// Middleware: verifies player Bearer token and sets req.playerId
function playerMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. Please login.' });
  }
  try {
    const decoded = verifyToken(auth.split(' ')[1]);
    if (!decoded.id) return res.status(401).json({ error: 'Invalid token' });
    req.playerId = decoded.id; // safe, verified userId
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Session expired. Please login again.' });
  }
}

// fetch() wrapper that aborts after `ms` milliseconds and throws a friendly error
async function fetchWithTimeout(url, options = {}, ms = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Network request timed out. Please check your connection and try again.');
    }
    // Surface a cleaner message for generic socket/connection errors
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.message?.includes('wsarecv') || err.message?.includes('ETIMEDOUT')) {
      throw new Error('Could not reach the payment gateway. Please check your internet connection and try again.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ── Auth Routes ───────────────────────────────────────────────────────────────

app.post('/api/v1/auth/register', async (req, res) => {
  try {
    const { phoneNumber, displayName, password, telegramId } = req.body;
    if (!phoneNumber || !displayName || !password)
      return res.status(400).json({ error: 'All fields are required' });

    const passwordHash = await hashPassword(password);

    // Duplicate check
    const existing = await db.query('SELECT id FROM users WHERE phone_number = $1', [phoneNumber]);
    if (existing.rows.length > 0)
      return res.status(400).json({ error: 'Phone number already registered' });

    // Check if telegram_id is already in use (if provided)
    if (telegramId) {
      const telegramCheck = await db.query('SELECT id FROM users WHERE telegram_id = $1', [telegramId]);
      if (telegramCheck.rows.length > 0)
        return res.status(400).json({ error: 'Telegram ID already linked to another account' });
    }

    // Create user with optional telegram_id
    const userRes = await db.query(
      `INSERT INTO users (phone_number, display_name, password_hash, role, telegram_id)
       VALUES ($1, $2, $3, 'player', $4) RETURNING id`,
      [phoneNumber, displayName, passwordHash, telegramId || null]
    );
    const userId = userRes.rows[0].id;

    // Auto-create wallet with 0 balance
    const balance = await walletLedger.getBalance(userId, 'real');
    const token = generatePlayerToken(userId);

    res.json({ userId, username: displayName, balance, mode: 'real', token });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/v1/auth/login', async (req, res) => {
  try {
    const { phoneNumber, password } = req.body;
    if (!phoneNumber || !password)
      return res.status(400).json({ error: 'All fields are required' });

    const userRes = await db.query(
      `SELECT id, display_name, password_hash FROM users WHERE phone_number = $1`,
      [phoneNumber]
    );

    if (userRes.rows.length === 0)
      return res.status(401).json({ error: 'Invalid phone number or password' });

    const user = userRes.rows[0];
    const isMatch = await verifyPassword(password, user.password_hash);
    if (!isMatch)
      return res.status(401).json({ error: 'Invalid phone number or password' });

    // Transparently upgrade legacy SHA-256 hash to bcrypt
    if (!user.password_hash.startsWith('$2')) {
      const upgraded = await hashPassword(password);
      await db.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [upgraded, user.id]).catch(() => {});
    }
    const balance = await walletLedger.getBalance(user.id, 'real');
    const token = generatePlayerToken(user.id);

    // Update last login
    await db.query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [user.id]);

    res.json({ userId: user.id, username: user.display_name, balance, mode: 'real', token });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.put('/api/v1/auth/profile', playerMiddleware, async (req, res) => {
  try {
    const userId = req.playerId; // from verified token
    const { displayName, password } = req.body;
    let query, values;
    if (password) {
      const hash = await hashPassword(password);
      query  = 'UPDATE users SET display_name=$1, password_hash=$2, updated_at=NOW() WHERE id=$3 RETURNING display_name';
      values = [displayName, hash, userId];
    } else {
      query  = 'UPDATE users SET display_name=$1, updated_at=NOW() WHERE id=$2 RETURNING display_name';
      values = [displayName, userId];
    }
    const result = await db.query(query, values);
    if (result.rowCount === 0) throw new Error('User not found');
    res.json({ success: true, username: result.rows[0].display_name });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/v1/auth/profile', playerMiddleware, async (req, res) => {
  try {
    const userId = req.playerId; // from verified token
    await db.query('DELETE FROM users WHERE id = $1', [userId]);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: 'Failed to delete account' });
  }
});

// ── Forgot Password Routes ────────────────────────────────────────────────────

// Request password reset - sends verification code via Telegram DM
app.post('/api/v1/auth/forgot-password', async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    
    // Find user by phone number
    const userResult = await db.query('SELECT id, telegram_id FROM users WHERE phone_number = $1', [phoneNumber]);
    if (userResult.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = userResult.rows[0];
    
    // Check if user has Telegram ID linked
    if (!user.telegram_id) {
      return res.status(400).json({ 
        error: 'No Telegram account linked. Please register again with your Telegram ID or contact support.',
        needsSetup: true
      });
    }
    
    // Generate 6-digit verification code
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    
    // Store code in database
    await db.query(
      'INSERT INTO password_reset_codes (user_id, code, expires_at) VALUES ($1, $2, $3)',
      [user.id, code, expiresAt]
    );
    
    // Send code directly to user via Telegram DM (private message)
    const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;
    
    if (telegramBotToken && telegramBotToken !== 'YOUR_BOT_TOKEN_HERE') {
      const https = require('https');
      
      // Format message for direct message to user
      const message = `🔐 *Fast Equb Password Reset*\n\n` +
                     `Your verification code is: \`${code}\`\n\n` +
                     `This code will expire in 10 minutes.\n\n` +
                     `⚠️ Never share this code with anyone.\n` +
                     `If you didn't request this, please ignore.`;
      
      const payload = JSON.stringify({
        chat_id: user.telegram_id,
        text: message,
        parse_mode: 'Markdown'
      });
      
      const options = {
        hostname: 'api.telegram.org',
        port: 443,
        path: `/bot${telegramBotToken}/sendMessage`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      };
      
      const telegramSuccess = await new Promise((resolve) => {
        const telegramReq = https.request(options, (telegramRes) => {
          let responseData = '';
          telegramRes.on('data', (chunk) => { responseData += chunk; });
          telegramRes.on('end', () => {
            if (telegramRes.statusCode !== 200) {
              console.error('Telegram API error:', telegramRes.statusCode, responseData);
              try {
                const parsed = JSON.parse(responseData);
                if (parsed.description && parsed.description.includes('bot was blocked')) {
                  resolve({ success: false, error: 'You have blocked @fasterekub_bot. Please unblock it and try again.' });
                } else if (parsed.description && (parsed.description.includes('chat not found') || parsed.description.includes('user not found'))) {
                  resolve({ success: false, error: 'Please open Telegram and start a chat with @fasterekub_bot first, then try again.', needsStart: true });
                } else {
                  resolve({ success: false, error: parsed.description || 'Failed to send Telegram message' });
                }
              } catch (e) {
                resolve({ success: false, error: 'Failed to send Telegram message' });
              }
            } else {
              console.log('Verification code sent to Telegram user:', user.telegram_id);
              resolve({ success: true });
            }
          });
        });
        
        telegramReq.on('error', (e) => {
          console.error('Failed to send Telegram message:', e);
          resolve({ success: false, error: e.message });
        });
        
        telegramReq.write(payload);
        telegramReq.end();
      });
      
      if (!telegramSuccess.success) {
        console.log('Telegram send failed:', telegramSuccess.error);
        return res.status(400).json({ 
          error: telegramSuccess.error,
          needsStart: telegramSuccess.needsStart,
          botLink: 'https://t.me/fasterekub_bot'
        });
      }
    }
    
    res.json({ 
      success: true, 
      message: 'Verification code sent to your Telegram account'
    });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Failed to process password reset request' });
  }
});

// Reset password with verification code
app.post('/api/v1/auth/reset-password', async (req, res) => {
  try {
    const { phoneNumber, code, newPassword } = req.body;
    
    // Find user
    const userResult = await db.query('SELECT id FROM users WHERE phone_number = $1', [phoneNumber]);
    if (userResult.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userId = userResult.rows[0].id;
    
    // Verify code
    const codeResult = await db.query(
      'SELECT id FROM password_reset_codes WHERE user_id = $1 AND code = $2 AND used = FALSE AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1',
      [userId, code]
    );
    
    if (codeResult.rowCount === 0) {
      return res.status(400).json({ error: 'Invalid or expired verification code' });
    }
    
    const codeId = codeResult.rows[0].id;
    
    // Update password
    const passwordHash = await hashPassword(newPassword);
    await db.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [passwordHash, userId]);
    
    // Mark code as used
    await db.query('UPDATE password_reset_codes SET used = TRUE WHERE id = $1', [codeId]);
    
    res.json({ success: true, message: 'Password reset successfully' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});


// ── Invite Code Routes ────────────────────────────────────────────────────────

app.get('/api/v1/user/invite', playerMiddleware, async (req, res) => {
  try {
    const userId = req.playerId;

    const existing = await db.query('SELECT * FROM user_invites WHERE user_id = $1', [userId]);
    if (existing.rows.length > 0) {
      return res.json({ hasRedeemed: true, inviteCode: existing.rows[0].invite_code, bonus: existing.rows[0].bonus_amount });
    }
    res.json({ hasRedeemed: false });
  } catch (err) {
    res.json({ hasRedeemed: false });
  }
});

app.post('/api/v1/user/invite', playerMiddleware, async (req, res) => {
  try {
    const userId = req.playerId;
    const { inviteCode } = req.body;
    if (!inviteCode || !inviteCode.trim()) return res.status(400).json({ error: 'Invite code is required' });
    
    const code = inviteCode.trim().toUpperCase();

    // Prevent user from redeeming their own invite code
    const ownPrefix = `EQUB-${userId.slice(0, 4).toUpperCase()}`;
    if (code === ownPrefix) {
      return res.status(400).json({ error: 'You cannot use your own invite code.' });
    }

    // Validate invite code format & verify issuing referrer or platform promo
    const validPromoCodes = ['WELCOME25', 'FASTDERASH'];
    let isValidCode = validPromoCodes.includes(code);

    if (!isValidCode) {
      const match = code.match(/^EQUB-([A-F0-9]{4})$/i);
      if (match) {
        const prefix = match[1].toLowerCase();
        const referrerRes = await db.query(
          `SELECT id FROM users WHERE id::text LIKE $1 AND id != $2 LIMIT 1`,
          [`${prefix}%`, userId]
        );
        if (referrerRes.rows.length > 0) {
          isValidCode = true;
        }
      }
    }

    if (!isValidCode) {
      return res.status(400).json({ error: 'Invalid invite code. Please enter a valid referral code (e.g. EQUB-A1B2).' });
    }

    // Check if user has already redeemed an invite code
    const alreadyRedeemed = await db.query('SELECT 1 FROM user_invites WHERE user_id = $1', [userId]);
    if (alreadyRedeemed.rows.length > 0) {
      return res.status(400).json({ error: 'You have already redeemed an invite code.' });
    }

    const bonus = 25.00;

    // Insert FIRST: unique constraint on user_id ensures strict atomicity
    try {
      await db.query('INSERT INTO user_invites (user_id, invite_code, bonus_amount) VALUES ($1, $2, $3)', [userId, code, bonus]);
    } catch (err) {
      if (err.code === '23505') {
        return res.status(400).json({ error: 'You have already redeemed an invite code.' });
      }
      throw err;
    }

    // Credit bonus to wallet
    const newBalance = await walletLedger.deposit(userId, bonus, 'real');

    res.json({
      success: true,
      message: `Invite code applied! ${bonus} ETB welcome bonus has been credited to your wallet.`,
      bonus,
      newBalance
    });
  } catch (err) {
    res.status(400).json({ error: err.message || 'Failed to apply invite code' });
  }
});

// ── Public Config Routes ──────────────────────────────────────────────────────

app.get('/api/v1/config', async (req, res) => {
  try {
    const sysConfig = await db.query(`SELECT * FROM system_config WHERE config_key IN ('TELEBIRR_PHONE', 'TELEBIRR_NAME')`);
    const configMap = sysConfig.rows.reduce((acc, row) => ({ ...acc, [row.config_key]: row.config_value }), {});
    res.json({
      telebirrPhone: configMap.TELEBIRR_PHONE || '',
      telebirrName: configMap.TELEBIRR_NAME || ''
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load config' });
  }
});

// ── Wallet Routes ─────────────────────────────────────────────────────────────

app.get('/api/v1/wallet/balance', playerMiddleware, async (req, res) => {
  try {
    const userId = req.playerId;
    const { mode = 'real' } = req.query;
    const balance = await walletLedger.getBalance(userId, mode);
    res.json({ balance });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch balance' });
  }
});

// Direct deposit endpoint removed for security. All deposits must go through telebirr verification.

app.post('/api/v1/wallet/deposit/telebirr', playerMiddleware, async (req, res) => {
  try {
    const userId = req.playerId;
    const { transactionId, mode = 'real' } = req.body;
    
    if (!transactionId) throw new Error('Transaction ID is required');

    const apiKeyResult = await db.query("SELECT config_value FROM system_config WHERE config_key = 'VERIFY_ET_API_KEY'");
    const apiKey = apiKeyResult.rows.length > 0 && apiKeyResult.rows[0].config_value ? apiKeyResult.rows[0].config_value : process.env.VERIFY_ET_API_KEY;

    if (!apiKey) {
      throw new Error('Payment gateway configuration error. Please contact support.');
    }

    // 15-second timeout for initial verify request
    const response = await fetchWithTimeout('https://verify.et/api/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey
      },
      body: JSON.stringify({ reference: transactionId, bank: 'telebirr' })
    }, 15000);

    let verifyData = await response.json();
    
    if (!response.ok || verifyData.success === false) {
       throw new Error(verifyData.message || 'Failed to start transaction verification');
    }

    // If API queues the request, we must poll the statusUrl
    if (verifyData.verification && verifyData.verification.processingStatus === 'queued' && verifyData.statusUrl) {
      let retries = 10;
      let completed = false;
      const statusUrl = verifyData.statusUrl.startsWith('http') ? verifyData.statusUrl : `https://verify.et${verifyData.statusUrl}`;
      
      while (retries > 0 && !completed) {
        await new Promise(r => setTimeout(r, 2000)); // wait 2 seconds between polls
        // 8-second timeout per poll attempt
        const pollRes = await fetchWithTimeout(statusUrl, { headers: { 'x-api-key': apiKey } }, 8000);
        const pollData = await pollRes.json();
        
        if (pollData.data && pollData.data.processingStatus === 'completed') {
          verifyData = pollData;
          completed = true;
        } else if (pollData.data && pollData.data.processingStatus === 'failed') {
          throw new Error('Verification failed internally');
        }
        retries--;
      }
      
      if (!completed) {
         throw new Error('Verification timed out after multiple attempts. Please try again later.');
      }
    }

    const finalResult = verifyData.data && verifyData.data.result ? verifyData.data.result : {};
    
    if (verifyData.data && verifyData.data.status !== 'success' && finalResult.status !== 'success' && finalResult.verified !== true) {
       throw new Error(finalResult.errorMessage || 'Invalid or unverified transaction');
    }

    let depositedAmount = finalResult.amount || (finalResult.transaction && finalResult.transaction.amount) || verifyData.data.amount;
    
    if (!depositedAmount || parseFloat(depositedAmount) <= 0) {
       throw new Error('Transaction verified but could not parse amount securely');
    }

    const balance = await walletLedger.depositTelebirr(userId, transactionId, parseFloat(depositedAmount), mode);
    
    res.json({ success: true, balance, depositedAmount });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/v1/wallet/order', playerMiddleware, async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || parseFloat(amount) <= 0) {
      return res.status(400).json({ error: 'Valid amount is required' });
    }
    const orderRef = 'ORD-' + Date.now().toString(36).toUpperCase() + '-' + Math.floor(100 + Math.random() * 900);
    const configRes = await db.query("SELECT config_key, config_value FROM system_config WHERE config_key IN ('TELEBIRR_PHONE', 'TELEBIRR_NAME')");
    let telebirrPhone = '0949626463';
    let telebirrName = 'Abel Wondmeneh';
    for (const r of configRes.rows) {
      if (r.config_key === 'TELEBIRR_PHONE' && r.config_value) telebirrPhone = r.config_value;
      if (r.config_key === 'TELEBIRR_NAME' && r.config_value) telebirrName = r.config_value;
    }
    res.json({
      success: true,
      orderRef,
      amount: parseFloat(amount),
      telebirrPhone,
      telebirrName,
      message: `Order ${orderRef} created for ${amount} ETB`
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post('/api/v1/wallet/withdraw', playerMiddleware, async (req, res) => {
  const client = await db.getClient();
  try {
    const userId = req.playerId;
    const { amount, mode = 'real', phoneNumber, paymentMethod = 'telebirr', accountHolderName } = req.body;
    
    if (mode !== 'real') {
      return res.status(400).json({ error: 'Withdrawals are only permitted in Real Money mode.' });
    }

    const withdrawAmount = Math.round(parseFloat(amount) * 100) / 100;
    if (isNaN(withdrawAmount) || !isFinite(withdrawAmount) || withdrawAmount <= 0) {
      return res.status(400).json({ error: 'Please enter a valid withdrawal amount.' });
    }

    // 1. Fetch system limits
    const configRes = await client.query(
      `SELECT config_key, config_value FROM system_config 
       WHERE config_key IN ('MIN_WITHDRAWAL_AMOUNT', 'MAX_WITHDRAWAL_AMOUNT', 'MAX_PENDING_WITHDRAWALS')`
    );
    const configMap = {};
    configRes.rows.forEach(r => configMap[r.config_key] = parseFloat(r.config_value));
    
    const minAmount = configMap['MIN_WITHDRAWAL_AMOUNT'] || 10;
    const maxAmount = configMap['MAX_WITHDRAWAL_AMOUNT'] || 50000;
    const maxPending = configMap['MAX_PENDING_WITHDRAWALS'] || 1;

    if (withdrawAmount < minAmount) {
      return res.status(400).json({ error: `Minimum withdrawal amount is ${minAmount} ETB.` });
    }
    if (withdrawAmount > maxAmount) {
      return res.status(400).json({ error: `Maximum withdrawal per request is ${maxAmount.toLocaleString()} ETB.` });
    }

    // 2. Lookup user & validate phone
    const userRes = await client.query(`SELECT phone_number, display_name FROM users WHERE id = $1`, [userId]);
    if (userRes.rows.length === 0) return res.status(404).json({ error: 'User not found.' });
    
    const phone = (phoneNumber || userRes.rows[0].phone_number || '').trim();
    if (!phone || phone.length < 9) {
      return res.status(400).json({ error: 'A valid Telebirr phone number is required for payout.' });
    }

    // 3. Enforce maximum pending withdrawals limit
    const pendingRes = await client.query(
      `SELECT COUNT(*) FROM withdrawal_requests WHERE user_id = $1 AND status = 'pending'`,
      [userId]
    );
    const pendingCount = parseInt(pendingRes.rows[0].count, 10);
    if (pendingCount >= maxPending) {
      return res.status(400).json({ 
        error: `You already have ${pendingCount} pending withdrawal request. Please wait for it to be processed or cancel it before submitting a new one.` 
      });
    }

    // 4. ATOMIC DATABASE TRANSACTION
    await client.query('BEGIN');

    // Lock wallet FOR UPDATE to strictly prevent concurrent double-spending
    const walletRes = await client.query(
      `SELECT id, balance, total_withdrawn FROM wallets WHERE user_id = $1 AND mode = 'real' FOR UPDATE`,
      [userId]
    );
    if (walletRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Real money wallet not found.' });
    }

    const currentBalance = parseFloat(walletRes.rows[0].balance);
    if (currentBalance < withdrawAmount) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        error: `Insufficient balance. Your current balance is ${currentBalance.toFixed(2)} ETB.` 
      });
    }

    const newBalance = Math.round((currentBalance - withdrawAmount) * 100) / 100;
    const walletId = walletRes.rows[0].id;

    // Deduct balance and increment total_withdrawn
    await client.query(
      `UPDATE wallets 
       SET balance = $1, total_withdrawn = total_withdrawn + $2, updated_at = NOW() 
       WHERE id = $3`,
      [newBalance, withdrawAmount, walletId]
    );

    // Insert transaction into ledger
    const note = `Withdrawal to ${phone} via ${paymentMethod || 'Telebirr'} (Pending Admin Review)`;
    const txRes = await client.query(
      `INSERT INTO transactions (wallet_id, tx_type, amount, direction, running_balance, reference_note)
       VALUES ($1, 'withdrawal', $2, -1, $3, $4)
       RETURNING id`,
      [walletId, withdrawAmount, newBalance, note]
    );
    const txId = txRes.rows[0]?.id;

    // Insert withdrawal request linked directly to transaction
    const reqRes = await client.query(
      `INSERT INTO withdrawal_requests (user_id, amount, phone_number, status, transaction_id, payment_method, account_holder_name)
       VALUES ($1, $2, $3, 'pending', $4, $5, $6)
       RETURNING id, amount, phone_number, status, payment_method, account_holder_name, created_at`,
      [userId, withdrawAmount, phone, txId, paymentMethod || 'telebirr', accountHolderName ? accountHolderName.trim() : null]
    );
    const newRequest = reqRes.rows[0];

    await client.query('COMMIT');

    res.json({
      success: true,
      balance: newBalance,
      requestId: newRequest.id,
      request: newRequest,
      message: `Withdrawal request for ${withdrawAmount} ETB submitted successfully.`
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('User withdrawal error:', err);
    res.status(400).json({ error: err.message || 'Withdrawal request failed.' });
  } finally {
    client.release();
  }
});

// User Withdrawal History & Status
app.get('/api/v1/wallet/withdrawals', playerMiddleware, async (req, res) => {
  try {
    const userId = req.playerId;
    const result = await db.query(
      `SELECT 
         id, amount, phone_number, status, payment_method, account_holder_name, notes, created_at, updated_at
       FROM withdrawal_requests 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT 50`,
      [userId]
    );

    const statsRes = await db.query(
      `SELECT 
         COUNT(*) FILTER (WHERE status = 'pending') AS pending_count,
         COALESCE(SUM(amount) FILTER (WHERE status = 'pending'), 0) AS pending_amount,
         COALESCE(SUM(amount) FILTER (WHERE status = 'approved'), 0) AS total_withdrawn
       FROM withdrawal_requests 
       WHERE user_id = $1`,
      [userId]
    );

    res.json({
      requests: result.rows,
      stats: {
        pendingCount: parseInt(statsRes.rows[0]?.pending_count || 0, 10),
        pendingAmount: parseFloat(statsRes.rows[0]?.pending_amount || 0),
        totalWithdrawn: parseFloat(statsRes.rows[0]?.total_withdrawn || 0)
      }
    });
  } catch (err) {
    console.error('Fetch player withdrawals error:', err);
    res.status(500).json({ error: 'Failed to fetch withdrawal history' });
  }
});

// User Cancel Pending Withdrawal (Instantly refunds funds to player wallet)
app.post('/api/v1/wallet/withdraw/:id/cancel', playerMiddleware, async (req, res) => {
  const client = await db.getClient();
  try {
    const userId = req.playerId;
    const { id } = req.params;

    await client.query('BEGIN');

    // Lock withdrawal request for update
    const reqRes = await client.query(
      `SELECT * FROM withdrawal_requests WHERE id = $1 AND user_id = $2 FOR UPDATE`,
      [id, userId]
    );

    if (reqRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Withdrawal request not found.' });
    }

    const request = reqRes.rows[0];
    if (request.status !== 'pending') {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        error: `Cannot cancel request. It has already been ${request.status}.` 
      });
    }

    const refundAmount = parseFloat(request.amount);

    // Atomically refund wallet balance via stored procedure
    const refundRes = await client.query(
      `SELECT * FROM fn_wallet_refund($1, $2, 'real', $3)`,
      [userId, refundAmount, `Withdrawal #${id.slice(0, 8)} cancelled by player`]
    );

    if (!refundRes.rows[0]?.success) {
      await client.query('ROLLBACK');
      return res.status(500).json({ error: 'Failed to refund wallet balance.' });
    }

    const newBalance = parseFloat(refundRes.rows[0].new_balance);

    // Mark withdrawal request as cancelled
    await client.query(
      `UPDATE withdrawal_requests 
       SET status = 'cancelled', notes = 'Cancelled by player', updated_at = NOW() 
       WHERE id = $1`,
      [id]
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: `Withdrawal request for ${refundAmount.toFixed(2)} ETB cancelled and refunded to your wallet.`,
      newBalance,
      requestId: id
    });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('Cancel withdrawal error:', err);
    res.status(400).json({ error: err.message || 'Failed to cancel withdrawal request.' });
  } finally {
    client.release();
  }
});

// Withdrawal Configuration / Policy for players
app.get('/api/v1/wallet/withdraw/config', async (req, res) => {
  try {
    const cfgRes = await db.query(
      `SELECT config_key, config_value FROM system_config 
       WHERE config_key IN ('MIN_WITHDRAWAL_AMOUNT', 'MAX_WITHDRAWAL_AMOUNT', 'MAX_PENDING_WITHDRAWALS', 'TELEBIRR_PHONE', 'TELEBIRR_NAME')`
    );
    const map = {};
    cfgRes.rows.forEach(r => map[r.config_key] = r.config_value);

    res.json({
      minAmount: parseFloat(map['MIN_WITHDRAWAL_AMOUNT'] || '10'),
      maxAmount: parseFloat(map['MAX_WITHDRAWAL_AMOUNT'] || '50000'),
      maxPending: parseInt(map['MAX_PENDING_WITHDRAWALS'] || '1', 10),
      telebirrSupportPhone: map['TELEBIRR_PHONE'] || '0949626463',
      telebirrSupportName: map['TELEBIRR_NAME'] || 'Support',
      fee: 0,
      paymentMethods: [
        { id: 'telebirr', name: 'Telebirr', active: true }
      ]
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch withdrawal configuration' });
  }
});

app.get('/api/v1/wallet/transactions', playerMiddleware, async (req, res) => {
  try {
    const userId = req.playerId;
    const { mode = 'real' } = req.query;
    
    // Fetch transactions from the ledger view
    const result = await db.query(`
      SELECT t.id, t.tx_type, t.amount, t.direction, t.running_balance, t.created_at, t.reference_note 
      FROM transactions t
      JOIN wallets w ON t.wallet_id = w.id
      WHERE w.user_id = $1 AND w.mode = $2
      ORDER BY t.created_at DESC
      LIMIT 50
    `, [userId, mode]);
    
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch transaction history' });
  }
});

// ── Room Routes ───────────────────────────────────────────────────────────────

// Live room list — used on page load and for polling fallback
app.get('/api/v1/rooms', (req, res) => {
  res.json(roomManager.getRoomSummaries());
});

// Single room details endpoint (useful for joining newly opened cycle)
app.get('/api/v1/rooms/:id', (req, res) => {
  const room = roomManager.rooms.get(req.params.id);
  if (!room) return res.status(404).json({ error: 'Game room not found' });
  res.json({
    id: room.id,
    roomNumber: room.roomNumber,
    gameId: `Game #${room.roomNumber}`,
    tierCategory: room.tierCategory,
    targetJackpot: room.targetJackpot,
    groupSize: room.groupSize,
    ticketPrice: room.ticketPrice,
    filledSeats: room.filledSeats,
    playerCount: new Set((room.seats || []).map(s => s.userId)).size,
    seats: room.seats || [],
    timeRemaining: Math.max(0, room.timeRemaining),
    maxSeatsPerUser: room.maxSeatsPerUser,
    status: room.status
  });
});

// Ensure an open room exists for the selected targetJackpot and groupSize
app.post('/api/v1/rooms/ensure', async (req, res) => {
  try {
    const { targetJackpot, groupSize } = req.body;
    if (!targetJackpot) {
      return res.status(400).json({ error: 'Missing targetJackpot' });
    }
    const jackpotNum = parseFloat(targetJackpot);
    let tierCategory = 'starter';
    if (jackpotNum >= 100000) tierCategory = 'gold';
    else if (jackpotNum >= 10000) tierCategory = 'silver';
    else if (jackpotNum >= 1000)  tierCategory = 'bronze';

    if (groupSize && groupSize !== 'all') {
      const sizeNum = parseInt(groupSize);
      let existing = Array.from(roomManager.rooms.values()).find(
        r => (r.status === 'open' || r.status === 'drawing') &&
             r.groupSize === sizeNum &&
             Math.round(r.targetJackpot) === Math.round(jackpotNum)
      );

      if (!existing) {
        existing = await roomManager.createRoom(tierCategory, jackpotNum, sizeNum);
        console.log(`✨ Auto-ensured open room: Game #${existing.roomNumber} (${sizeNum} players, ${jackpotNum} Birr)`);
      }
      return res.json({ success: true, room: existing, rooms: roomManager.getRoomSummaries() });
    } else {
      const standardSizes = [5, 10, 20, 40, 50, 80];
      for (const sz of standardSizes) {
        const exists = Array.from(roomManager.rooms.values()).some(
          r => (r.status === 'open' || r.status === 'drawing') &&
               r.groupSize === sz &&
               Math.round(r.targetJackpot) === Math.round(jackpotNum)
        );
        if (!exists) {
          await roomManager.createRoom(tierCategory, jackpotNum, sz);
        }
      }
      return res.json({ success: true, rooms: roomManager.getRoomSummaries() });
    }
  } catch (err) {
    console.error('ensure room error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Create a brand-new room and immediately join it
app.post('/api/v1/rooms/create_and_join', playerMiddleware, async (req, res) => {
  try {
    const userId = req.playerId;
    const { mode = 'real', username, groupSize, seatNumbers, targetJackpot } = req.body;

    let tierCategory = 'starter';
    if (targetJackpot >= 100000) tierCategory = 'gold';
    else if (targetJackpot >= 10000) tierCategory = 'silver';
    else if (targetJackpot >= 1000)  tierCategory = 'bronze';

    const room = await roomManager.createRoom(tierCategory, targetJackpot, groupSize);
    const seatCount = seatNumbers && seatNumbers.length > 0 ? seatNumbers.length : 1;
    const { newBalance } = await roomManager.joinRoom(room.id, userId, seatCount, mode, username, seatNumbers);

    res.json({ success: true, balance: newBalance, room: roomManager.rooms.get(room.id) || room });
  } catch (err) {
    console.error('create_and_join error:', err);
    res.status(400).json({ error: err.message });
  }
});

// Join an existing open room
app.post('/api/v1/rooms/join', playerMiddleware, async (req, res) => {
  try {
    const userId = req.playerId;
    const { roomId, seatCount = 1, mode = 'real', username, seatNumbers } = req.body;
    const { newBalance, assignedSeats } = await roomManager.joinRoom(roomId, userId, seatCount, mode, username, seatNumbers);
    const balance = newBalance ?? await walletLedger.getBalance(userId, mode);
    res.json({ success: true, balance, assignedSeats });
  } catch (err) {
    console.error('join error:', err);
    res.status(400).json({ error: err.message });
  }
});

// ── History Route ─────────────────────────────────────────────────────────────

app.get('/api/v1/history/my-tickets', playerMiddleware, async (req, res) => {
  try {
    const userId = req.playerId;
    const { mode = 'real' } = req.query;
    const result = await db.query(`
      SELECT
        t.id, r.room_number, r.tier, r.target_jackpot,
        t.seat_number, t.is_winner, t.is_refunded, t.purchased_at,
        CASE WHEN t.is_winner THEN r.net_winner_payout WHEN t.is_refunded THEN t.purchase_price ELSE 0 END AS amount_received
      FROM tickets t
      JOIN rooms r ON r.id = t.room_id
      WHERE t.user_id = $1 AND t.mode = $2
      ORDER BY t.purchased_at DESC
      LIMIT 50
    `, [userId, mode]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// ── Results Route ─────────────────────────────────────────────────────────────

app.get('/api/v1/results', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT r.id, r.room_number, r.tier, r.target_jackpot, u.display_name as winner_username, r.net_winner_payout as amount, r.settled_at, t.seat_number
      FROM rooms r 
      JOIN users u ON u.id = r.winner_user_id 
      JOIN tickets t ON t.id = r.winner_ticket_id
      WHERE r.status = 'settled' 
      ORDER BY r.settled_at DESC LIMIT 20
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch results' });
  }
});

// ── Socket.io ─────────────────────────────────────────────────────────────────

io.on('connection', (socket) => {
  // Immediately push live room list to new connection
  socket.emit('room:state_update', roomManager.getRoomSummaries());

  // Allow clients to subscribe to a specific room channel
  socket.on('room:subscribe', ({ roomId }) => {
    socket.join(`room_${roomId}`);
  });

  socket.on('room:unsubscribe', ({ roomId }) => {
    socket.leave(`room_${roomId}`);
  });
});

// ── Boot Sequence ─────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use by another process. Retrying or waiting...`);
    process.exit(1);
  } else {
    console.error('❌ Server error:', err);
    process.exit(1);
  }
});

server.listen(PORT, async () => {
  console.log(`🚀 Fast Derash server starting on port ${PORT}...`);
  try {
    await roomManager.loadActiveRooms();
    await roomManager.ensureStarterRooms();
    console.log('✅ System fully operational and synced with PostgreSQL.');
  } catch (err) {
    console.error('❌ Failed to initialize system:', err);
    process.exit(1);
  }
});

const cleanup = () => {
  server.close(() => {
    process.exit(0);
  });
};

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
