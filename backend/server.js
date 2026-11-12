const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const crypto = require('crypto');

const db = require('./src/db');
const walletLedger = require('./src/walletLedger');
const roomManager = require('./src/roomManager');
const adminRoutes = require('./src/adminRoutes');
const { generateToken, verifyToken, hashPassword, verifyPassword } = require('./src/adminAuth');
const { isValidUuid, createRateLimiter, securityHeaders, verifyTelebirrReceiver } = require('./src/security');

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
  : (process.env.NODE_ENV === 'production'
    ? []
    : ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:5174', 'http://127.0.0.1:3000', 'http://127.0.0.1:5173', 'http://127.0.0.1:5174']);

const corsOrigin = (origin, callback) => {
  if (!origin) return callback(null, true);
  if (allowedOrigins.includes(origin)) return callback(null, true);
  return callback(null, false);
};

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: corsOrigin } });

app.use(securityHeaders);
app.use(cors({ origin: corsOrigin }));
app.use(express.json({ limit: '100kb' }));

// Rate limiters for auth & financial routes
const loginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 15,
  keyGenerator: (req) => `${req.ip}:login:${String(req.body?.phoneNumber || '').trim()}`,
  message: 'Too many login attempts. Please try again in a few minutes.'
});
const registerLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: 'Too many registration attempts from this IP.'
});
const forgotPwLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many password reset requests. Please try again later.'
});
const resetPwLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many verification code attempts. Please try again later.'
});
const walletLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  max: 25,
  message: 'Too many wallet requests. Please slow down.'
});

// Health check for load balancers, reverse proxies, and uptime monitors
app.get('/api/v1/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected', uptime: Math.floor(process.uptime()) });
  } catch {
    res.status(503).json({ status: 'error', database: 'disconnected' });
  }
});

// ── Admin API Routes ──────────────────────────────────────────────────────────
app.use('/api/v1/admin', adminRoutes);

// Serve built admin panel at /admin (production)
const adminDistPath = path.join(__dirname, '../admin/dist');
if (fs.existsSync(adminDistPath)) {
  app.use('/admin', express.static(adminDistPath));
  app.get(['/admin', '/admin/*'], (req, res) => {
    res.sendFile(path.join(adminDistPath, 'index.html'));
  });
}

// Serve built frontend (production)
const distPath = path.join(__dirname, '../frontend/dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io') || req.path.startsWith('/admin')) return next();
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// Give roomManager access to the socket server
roomManager.setIo(io);

// ── Player JWT helpers ────────────────────────────────────────────────────────

function generatePlayerToken(userId) {
  return generateToken({ id: userId, role: 'player', email: '' });
}

// Middleware: verifies player Bearer token and sets req.playerId
async function playerMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. Please login.' });
  }
  let decoded;
  try {
    decoded = verifyToken(auth.split(' ')[1]);
    if (!decoded.id) return res.status(401).json({ error: 'Invalid token' });
  } catch (err) {
    return res.status(401).json({ error: 'Session expired. Please login again.' });
  }
  try {
    const userRes = await db.query('SELECT is_active FROM users WHERE id = $1', [decoded.id]);
    if (userRes.rows.length === 0) {
      return res.status(401).json({ error: 'Account not found. Please login again.' });
    }
    if (userRes.rows[0].is_active === false) {
      return res.status(403).json({ error: 'Your account has been suspended. Please contact support.' });
    }
    req.playerId = decoded.id; // safe, verified userId
    next();
  } catch (err) {
    return res.status(500).json({ error: 'Authentication check failed' });
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

const RECEIVER_INVITE_BONUS = 0.00;
const SENDER_REFERRAL_REWARD = 10.00;
const VALID_PROMO_CODES = ['WELCOME25', 'FASTDERASH'];

function formatOwnInviteCode(userId, dbInviteCode) {
  if (dbInviteCode && String(dbInviteCode).trim()) {
    return String(dbInviteCode).trim().toUpperCase();
  }
  return `EQUB-${String(userId).slice(0, 4).toUpperCase()}`;
}

function inviteError(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

async function resolveReferrerForCode(client, userId, rawCode) {
  const code = typeof rawCode === 'string' ? rawCode.trim().toUpperCase() : '';
  if (!code) throw inviteError('Invite code is required');

  const userRow = await client.query('SELECT id, invite_code FROM users WHERE id = $1', [userId]);
  const ownDbCode = userRow.rows[0]?.invite_code ? String(userRow.rows[0].invite_code).trim().toUpperCase() : null;
  const ownPrefix4 = `EQUB-${String(userId).slice(0, 4).toUpperCase()}`;
  const ownPrefix6 = `EQUB-${String(userId).slice(0, 6).toUpperCase()}`;
  if (code === ownDbCode || code === ownPrefix4 || code === ownPrefix6) {
    throw inviteError('You cannot use your own invite code.');
  }

  if (VALID_PROMO_CODES.includes(code)) {
    return { code, referrerId: null };
  }

  let referrerRes = await client.query(
    `SELECT id FROM users WHERE UPPER(invite_code) = $1 AND id != $2 AND is_active = true LIMIT 1`,
    [code, userId]
  );

  if (referrerRes.rows.length === 0) {
    const match = code.match(/^EQUB-([A-F0-9]{4,8})$/i);
    if (match) {
      const prefix = match[1].toLowerCase();
      referrerRes = await client.query(
        `SELECT id FROM users WHERE LOWER(id::text) LIKE $1 AND id != $2 AND is_active = true ORDER BY created_at ASC LIMIT 1`,
        [`${prefix}%`, userId]
      );
    }
  }

  if (referrerRes.rows.length === 0) {
    throw inviteError('Invalid invite code. Please enter a valid referral code (e.g. EQUB-A1B2C3).');
  }

  const referrerId = referrerRes.rows[0].id;
  // Prevent two accounts from mutually referring each other in a loop
  const circular = await client.query(
    `SELECT 1 FROM user_invites WHERE user_id = $1 AND referrer_id = $2`,
    [referrerId, userId]
  );
  if (circular.rows.length > 0) {
    throw inviteError('Mutual referral codes are not allowed.');
  }

  return { code, referrerId };
}

async function creditWalletInTx(client, { userId, amount, referenceNote, idempotencyKey }) {
  if (idempotencyKey) {
    const dup = await client.query('SELECT 1 FROM transactions WHERE idempotency_key = $1', [idempotencyKey]);
    if (dup.rows.length > 0) {
      const existingWal = await client.query(`SELECT balance FROM wallets WHERE user_id = $1 AND mode = 'real'`, [userId]);
      return existingWal.rows[0] ? parseFloat(existingWal.rows[0].balance) : 0;
    }
  }

  let walRes = await client.query(
    `SELECT id, balance FROM wallets WHERE user_id = $1 AND mode = 'real' FOR UPDATE`,
    [userId]
  );

  let walletId;
  let newBalance;
  if (walRes.rowCount === 0) {
    const ins = await client.query(
      `INSERT INTO wallets (user_id, mode, balance, total_deposited) VALUES ($1, 'real', $2, $2) RETURNING id, balance`,
      [userId, amount]
    );
    walletId = ins.rows[0].id;
    newBalance = parseFloat(ins.rows[0].balance);
  } else {
    const upd = await client.query(
      `UPDATE wallets SET balance = balance + $1, total_deposited = total_deposited + $1, updated_at = NOW() WHERE id = $2 RETURNING id, balance`,
      [amount, walRes.rows[0].id]
    );
    walletId = upd.rows[0].id;
    newBalance = parseFloat(upd.rows[0].balance);
  }

  await client.query(
    `INSERT INTO transactions (wallet_id, tx_type, amount, direction, running_balance, reference_note, idempotency_key)
     VALUES ($1, 'deposit', $2, 1, $3, $4, $5)`,
    [walletId, amount, newBalance, referenceNote, idempotencyKey]
  );

  return newBalance;
}

async function applyInviteCodeTx(client, { userId, rawCode }) {
  const { code, referrerId } = await resolveReferrerForCode(client, userId, rawCode);

  const already = await client.query('SELECT 1 FROM user_invites WHERE user_id = $1', [userId]);
  if (already.rows.length > 0) {
    throw inviteError('You have already redeemed an invite code.');
  }

  try {
    await client.query(
      `INSERT INTO user_invites (user_id, invite_code, bonus_amount, referrer_id) VALUES ($1, $2, $3, $4)`,
      [userId, code, RECEIVER_INVITE_BONUS, referrerId]
    );
  } catch (err) {
    if (err.code === '23505') {
      throw inviteError('You have already redeemed an invite code.');
    }
    throw err;
  }

  if (referrerId) {
    await creditWalletInTx(client, {
      userId: referrerId,
      amount: SENDER_REFERRAL_REWARD,
      referenceNote: `Referral reward (10 ETB) from invite ${code}`,
      idempotencyKey: `referral_reward:${userId}`
    });
  }

  const receiverWal = await client.query(
    `SELECT balance FROM wallets WHERE user_id = $1 AND mode = 'real'`,
    [userId]
  );
  const newBalance = receiverWal.rows[0] ? parseFloat(receiverWal.rows[0].balance) : 0;

  return {
    code,
    bonus: 0,
    senderReward: referrerId ? SENDER_REFERRAL_REWARD : 0,
    referrerId,
    newBalance
  };
}

// ── Auth Routes ───────────────────────────────────────────────────────────────

app.post('/api/v1/auth/register', registerLimiter, async (req, res) => {
  const client = await db.getClient();
  let inTx = false;
  try {
    const phoneNumber = typeof req.body?.phoneNumber === 'string' ? req.body.phoneNumber.trim() : '';
    const displayName = typeof req.body?.displayName === 'string' ? req.body.displayName.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const telegramId = typeof req.body?.telegramId === 'string' && req.body.telegramId.trim() ? req.body.telegramId.trim() : null;
    const rawInviteCode = typeof req.body?.inviteCode === 'string' ? req.body.inviteCode.trim() : '';

    if (!phoneNumber || !displayName || !password)
      return res.status(400).json({ error: 'All fields are required' });
    if (phoneNumber.length < 9 || phoneNumber.length > 20)
      return res.status(400).json({ error: 'Please enter a valid phone number' });
    if (displayName.length < 2 || displayName.length > 50)
      return res.status(400).json({ error: 'Display name must be between 2 and 50 characters' });
    if (password.length < 6 || password.length > 128)
      return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const passwordHash = await hashPassword(password);

    await client.query('BEGIN');
    inTx = true;

    // Duplicate check
    const existing = await client.query('SELECT id FROM users WHERE phone_number = $1', [phoneNumber]);
    if (existing.rows.length > 0) {
      await client.query('ROLLBACK');
      inTx = false;
      return res.status(400).json({ error: 'Phone number already registered' });
    }

    // Check if telegram_id is already in use (if provided)
    if (telegramId) {
      const telegramCheck = await client.query('SELECT id FROM users WHERE telegram_id = $1', [telegramId]);
      if (telegramCheck.rows.length > 0) {
        await client.query('ROLLBACK');
        inTx = false;
        return res.status(400).json({ error: 'Telegram ID already linked to another account' });
      }
    }

    // Create user with optional telegram_id
    const userRes = await client.query(
      `INSERT INTO users (phone_number, display_name, password_hash, role, telegram_id)
       VALUES ($1, $2, $3, 'player', $4) RETURNING id`,
      [phoneNumber, displayName, passwordHash, telegramId]
    );
    const userId = userRes.rows[0].id;
    const ownInviteCode = `EQUB-${String(userId).slice(0, 6).toUpperCase()}`;
    await client.query(`UPDATE users SET invite_code = $1 WHERE id = $2`, [ownInviteCode, userId]);

    // Auto-create wallet with 0 balance inside transaction
    await client.query(
      `INSERT INTO wallets (user_id, mode, balance) VALUES ($1, 'real', 0) ON CONFLICT (user_id, mode) DO NOTHING`,
      [userId]
    );
    let balance = 0;
    let inviteApplied = false;
    let inviteBonus = 0;

    if (rawInviteCode) {
      const inviteResult = await applyInviteCodeTx(client, { userId, rawCode: rawInviteCode });
      balance = inviteResult.newBalance;
      inviteApplied = true;
      inviteBonus = inviteResult.bonus;
    }

    await client.query('COMMIT');
    inTx = false;

    const token = generatePlayerToken(userId);
    res.json({
      userId,
      username: displayName,
      balance,
      mode: 'real',
      token,
      inviteCode: ownInviteCode,
      inviteApplied,
      inviteBonus
    });
  } catch (err) {
    if (inTx) await client.query('ROLLBACK').catch(() => {});
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed' });
  } finally {
    client.release();
  }
});

app.post('/api/v1/auth/login', loginLimiter, async (req, res) => {
  try {
    const phoneNumber = typeof req.body?.phoneNumber === 'string' ? req.body.phoneNumber.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!phoneNumber || !password)
      return res.status(400).json({ error: 'All fields are required' });

    const userRes = await db.query(
      `SELECT id, display_name, password_hash, is_active, invite_code FROM users WHERE phone_number = $1`,
      [phoneNumber]
    );

    if (userRes.rows.length === 0)
      return res.status(401).json({ error: 'Invalid phone number or password' });

    const user = userRes.rows[0];
    if (user.is_active === false) {
      return res.status(403).json({ error: 'Your account has been suspended. Please contact support.' });
    }
    const isMatch = await verifyPassword(password, user.password_hash);
    if (!isMatch)
      return res.status(401).json({ error: 'Invalid phone number or password' });

    // Transparently upgrade legacy SHA-256 hash to bcrypt
    if (!user.password_hash.startsWith('$2')) {
      const upgraded = await hashPassword(password);
      await db.query(`UPDATE users SET password_hash = $1 WHERE id = $2`, [upgraded, user.id]).catch(() => { });
    }
    const balance = await walletLedger.getBalance(user.id, 'real');
    const token = generatePlayerToken(user.id);
    const ownInviteCode = formatOwnInviteCode(user.id, user.invite_code);

    // Update last login
    await db.query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [user.id]);

    res.json({ userId: user.id, username: user.display_name, balance, mode: 'real', token, inviteCode: ownInviteCode });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.put('/api/v1/auth/profile', playerMiddleware, async (req, res) => {
  try {
    const userId = req.playerId; // from verified token
    const { displayName, password } = req.body;
    const cleanName = typeof displayName === 'string' ? displayName.trim() : '';
    if (!cleanName && !password) {
      return res.status(400).json({ error: 'Display name or password is required' });
    }
    if (cleanName && (cleanName.length < 2 || cleanName.length > 50)) {
      return res.status(400).json({ error: 'Display name must be between 2 and 50 characters' });
    }
    if (password && (typeof password !== 'string' || password.length < 6 || password.length > 128)) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const fields = [];
    const values = [];
    if (cleanName) {
      fields.push(`display_name=$${fields.length + 1}`);
      values.push(cleanName);
    }
    if (password) {
      const hash = await hashPassword(password);
      fields.push(`password_hash=$${fields.length + 1}`);
      values.push(hash);
    }
    values.push(userId);
    const query = `UPDATE users SET ${fields.join(', ')}, updated_at=NOW() WHERE id=$${values.length} RETURNING display_name`;
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
app.post('/api/v1/auth/forgot-password', forgotPwLimiter, async (req, res) => {
  try {
    const phoneNumber = typeof req.body?.phoneNumber === 'string' ? req.body.phoneNumber.trim() : '';
    if (!phoneNumber) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    // Find user by phone number
    const userResult = await db.query('SELECT id, telegram_id, is_active FROM users WHERE phone_number = $1', [phoneNumber]);
    if (userResult.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];
    if (user.is_active === false) {
      return res.status(403).json({ error: 'Your account has been suspended. Please contact support.' });
    }

    // Check if user has Telegram ID linked
    if (!user.telegram_id) {
      return res.status(400).json({
        error: 'No Telegram account linked. Please open @fasterekub_bot to link your account or register with your Telegram ID.',
        needsSetup: true,
        needsTelegramLink: true,
        botLink: 'https://t.me/fasterekub_bot'
      });
    }

    // Enforce server-side 60-second resend cooldown per account
    const recentCode = await db.query(
      `SELECT created_at FROM password_reset_codes
       WHERE user_id = $1 AND created_at > NOW() - INTERVAL '60 seconds'
       ORDER BY created_at DESC LIMIT 1`,
      [user.id]
    );
    if (recentCode.rowCount > 0) {
      return res.status(429).json({
        error: 'Please wait 60 seconds before requesting another verification code.',
        cooldownSeconds: 60
      });
    }

    // Invalidate any previous unused codes for this user
    await db.query('UPDATE password_reset_codes SET used = TRUE WHERE user_id = $1 AND used = FALSE', [user.id]);

    // Generate cryptographically secure 6-digit verification code
    const code = crypto.randomInt(100000, 1000000).toString();
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
      message: 'Verification code sent to your Telegram account',
      cooldownSeconds: 60,
      expiresIn: 600
    });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Failed to process password reset request' });
  }
});

// Reset password with verification code (with strict brute-force lockout after 5 wrong guesses)
app.post('/api/v1/auth/reset-password', resetPwLimiter, async (req, res) => {
  try {
    const phoneNumber = typeof req.body?.phoneNumber === 'string' ? req.body.phoneNumber.trim() : '';
    const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
    const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';

    if (!phoneNumber || !code || !newPassword) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    if (newPassword.length < 6 || newPassword.length > 128) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    // Find user
    const userResult = await db.query('SELECT id FROM users WHERE phone_number = $1', [phoneNumber]);
    if (userResult.rowCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userId = userResult.rows[0].id;

    // Fetch latest active reset code for this user
    const latestCodeRes = await db.query(
      'SELECT id, code, attempts FROM password_reset_codes WHERE user_id = $1 AND used = FALSE AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1',
      [userId]
    );

    if (latestCodeRes.rowCount === 0) {
      return res.status(400).json({ error: 'Invalid or expired verification code' });
    }

    const activeReset = latestCodeRes.rows[0];
    if (activeReset.attempts >= 5) {
      await db.query('UPDATE password_reset_codes SET used = TRUE WHERE id = $1', [activeReset.id]);
      return res.status(429).json({ error: 'Too many failed verification attempts. Please request a new code.' });
    }

    if (activeReset.code !== code) {
      const nextAttempts = (activeReset.attempts || 0) + 1;
      await db.query(
        'UPDATE password_reset_codes SET attempts = $1, used = $2 WHERE id = $3',
        [nextAttempts, nextAttempts >= 5, activeReset.id]
      );
      return res.status(400).json({ error: 'Invalid or expired verification code' });
    }

    // Update password and invalidate all unused codes for this user
    const passwordHash = await hashPassword(newPassword);
    await db.query('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [passwordHash, userId]);
    await db.query('UPDATE password_reset_codes SET used = TRUE WHERE user_id = $1 AND used = FALSE', [userId]);

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

    const [userRes, existingRes, statsRes] = await Promise.all([
      db.query('SELECT invite_code FROM users WHERE id = $1', [userId]),
      db.query('SELECT invite_code, bonus_amount FROM user_invites WHERE user_id = $1', [userId]),
      db.query('SELECT COUNT(*)::int AS total_invites FROM user_invites WHERE referrer_id = $1', [userId])
    ]);

    const ownInviteCode = formatOwnInviteCode(userId, userRes.rows[0]?.invite_code);
    const totalInvites = statsRes.rows[0]?.total_invites || 0;
    const referralEarnings = totalInvites * SENDER_REFERRAL_REWARD;
    const redeemed = existingRes.rows[0];

    return res.json({
      ownInviteCode,
      hasRedeemed: Boolean(redeemed),
      inviteCode: redeemed ? redeemed.invite_code : undefined,
      bonus: redeemed ? redeemed.bonus_amount : undefined,
      totalInvites,
      referralEarnings,
      senderReward: SENDER_REFERRAL_REWARD,
      welcomeBonus: RECEIVER_INVITE_BONUS
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load invite details' });
  }
});

app.post('/api/v1/user/invite', playerMiddleware, walletLimiter, async (req, res) => {
  const client = await db.getClient();
  let inTx = false;
  try {
    const userId = req.playerId;
    const rawCode = typeof req.body?.inviteCode === 'string' ? req.body.inviteCode.trim() : '';
    if (!rawCode) return res.status(400).json({ error: 'Invite code is required' });

    await client.query('BEGIN');
    inTx = true;

    const result = await applyInviteCodeTx(client, { userId, rawCode });

    await client.query('COMMIT');
    inTx = false;

    res.json({
      success: true,
      message: result.senderReward > 0
        ? `Invite code applied! Your inviter earned ${result.senderReward} ETB.`
        : 'Invite code applied!',
      bonus: 0,
      senderReward: result.senderReward,
      newBalance: result.newBalance
    });
  } catch (err) {
    if (inTx) await client.query('ROLLBACK').catch(() => {});
    res.status(err.status || 400).json({ error: err.message || 'Failed to apply invite code' });
  } finally {
    client.release();
  }
});

// ── Public Config Routes ──────────────────────────────────────────────────────

app.get('/api/v1/config', async (req, res) => {
  try {
    const [sysConfig, quotaRows] = await Promise.all([
      db.query(`SELECT * FROM system_config WHERE config_key IN ('TELEBIRR_PHONE', 'TELEBIRR_NAME')`),
      db.query(`SELECT group_size, max_seats_per_user FROM seat_quotas ORDER BY group_size`)
    ]);
    const configMap = sysConfig.rows.reduce((acc, row) => ({ ...acc, [row.config_key]: row.config_value }), {});
    const seatQuotas = quotaRows.rows.reduce((acc, row) => {
      acc[row.group_size] = Number(row.max_seats_per_user);
      return acc;
    }, {});
    res.json({
      telebirrPhone: configMap.TELEBIRR_PHONE || '',
      telebirrName: configMap.TELEBIRR_NAME || '',
      seatQuotas
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load config' });
  }
});

// ── Wallet Routes ─────────────────────────────────────────────────────────────

app.get('/api/v1/wallet/balance', playerMiddleware, async (req, res) => {
  try {
    const userId = req.playerId;
    const balance = await walletLedger.getBalance(userId, 'real');
    res.json({ balance });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch balance' });
  }
});

// Direct deposit endpoint removed for security. All deposits must go through telebirr verification.

app.post('/api/v1/wallet/deposit/telebirr', playerMiddleware, walletLimiter, async (req, res) => {
  try {
    const userId = req.playerId;
    const rawTxId = typeof req.body?.transactionId === 'string' ? req.body.transactionId.trim().toUpperCase() : '';
    const mode = 'real'; // Strictly enforce real money mode

    if (!rawTxId || !/^[A-Z0-9_-]{4,64}$/.test(rawTxId)) {
      throw new Error('Please enter a valid Telebirr Transaction ID');
    }

    // Fast pre-check before hitting payment verification API
    const dupCheck = await db.query('SELECT 1 FROM external_deposits WHERE UPPER(transaction_id) = $1', [rawTxId]);
    if (dupCheck.rowCount > 0) {
      throw new Error('This Telebirr transaction has already been used.');
    }

    const cfgResult = await db.query(
      "SELECT config_key, config_value FROM system_config WHERE config_key IN ('VERIFY_ET_API_KEY', 'TELEBIRR_PHONE', 'TELEBIRR_NAME')"
    );
    const cfgMap = {};
    for (const r of cfgResult.rows) cfgMap[r.config_key] = r.config_value;

    const apiKey = cfgMap.VERIFY_ET_API_KEY || process.env.VERIFY_ET_API_KEY;
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
      body: JSON.stringify({ reference: rawTxId, bank: 'telebirr' })
    }, 15000);

    let verifyData = await response.json();

    if (!response.ok || verifyData.success === false) {
      throw new Error(verifyData.message || 'Failed to start transaction verification');
    }

    // If API queues the request, we must poll the statusUrl (restricted strictly to https://verify.et)
    if (verifyData.verification && verifyData.verification.processingStatus === 'queued' && verifyData.statusUrl) {
      let retries = 10;
      let completed = false;
      const statusUrl = verifyData.statusUrl.startsWith('http')
        ? verifyData.statusUrl
        : `https://verify.et${verifyData.statusUrl}`;
      if (!statusUrl.startsWith('https://verify.et/')) {
        throw new Error('Invalid payment verification status URL');
      }

      while (retries > 0 && !completed) {
        await new Promise(r => setTimeout(r, 2000)); // wait 2 seconds between polls
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

    const receiverCheck = verifyTelebirrReceiver(verifyData, cfgMap.TELEBIRR_PHONE, cfgMap.TELEBIRR_NAME);
    if (!receiverCheck.valid) {
      throw new Error(receiverCheck.reason);
    }

    let depositedAmount = finalResult.amount || (finalResult.transaction && finalResult.transaction.amount) || verifyData.data.amount;
    const parsedAmount = Number(depositedAmount);

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0 || parsedAmount > 500000) {
      throw new Error('Transaction verified but could not parse amount securely');
    }

    const balance = await walletLedger.depositTelebirr(userId, rawTxId, parsedAmount, mode);

    res.json({ success: true, balance, depositedAmount: parsedAmount });
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

app.post('/api/v1/wallet/withdraw', playerMiddleware, walletLimiter, async (req, res) => {
  const client = await db.getClient();
  try {
    const userId = req.playerId;
    const { amount, phoneNumber, paymentMethod = 'telebirr', accountHolderName } = req.body;
    const mode = 'real'; // Withdrawals strictly in real money mode

    const rawAmount = Number(amount);
    const withdrawAmount = Math.round(rawAmount * 100) / 100;
    if (!Number.isFinite(withdrawAmount) || withdrawAmount <= 0) {
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

    const phone = (typeof phoneNumber === 'string' && phoneNumber.trim()) ? phoneNumber.trim() : (userRes.rows[0].phone_number || '').trim();
    if (!phone || phone.length < 9 || phone.length > 20) {
      return res.status(400).json({ error: 'A valid Telebirr phone number is required for payout.' });
    }

    // 3. ATOMIC DATABASE TRANSACTION (Lock wallet FIRST to serialize concurrent withdrawal attempts)
    await client.query('BEGIN');

    const walletRes = await client.query(
      `SELECT id, balance, total_withdrawn FROM wallets WHERE user_id = $1 AND mode = 'real' FOR UPDATE`,
      [userId]
    );
    if (walletRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Real money wallet not found.' });
    }

    // 4. Enforce maximum pending withdrawals limit INSIDE the wallet lock to prevent concurrent bypass
    const pendingRes = await client.query(
      `SELECT COUNT(*) FROM withdrawal_requests WHERE user_id = $1 AND status = 'pending'`,
      [userId]
    );
    const pendingCount = parseInt(pendingRes.rows[0].count, 10);
    if (pendingCount >= maxPending) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `You already have ${pendingCount} pending withdrawal request. Please wait for it to be processed or cancel it before submitting a new one.`
      });
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
    await client.query('ROLLBACK').catch(() => { });
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
app.post('/api/v1/wallet/withdraw/:id/cancel', playerMiddleware, walletLimiter, async (req, res) => {
  const client = await db.getClient();
  try {
    const userId = req.playerId;
    const { id } = req.params;
    if (!isValidUuid(id)) {
      return res.status(400).json({ error: 'Invalid withdrawal request ID.' });
    }

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
    await client.query('ROLLBACK').catch(() => { });
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
    // Rooms are now created on-demand when users place bets to prevent database overhead.
    return res.json({ success: true, rooms: roomManager.getRoomSummaries() });
  } catch (err) {
    console.error('ensure room error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Create a brand-new room (or reuse an existing open one) and immediately join it
app.post('/api/v1/rooms/create_and_join', playerMiddleware, async (req, res) => {
  let createdNow = false;
  let room = null;
  try {
    const userId = req.playerId;
    const { username, groupSize, seatNumbers, targetJackpot } = req.body;
    const mode = 'real'; // Strictly enforce real money mode

    const sizeNum = Number(groupSize);
    const jackpotNum = Number(targetJackpot);
    if (!Number.isInteger(sizeNum) || sizeNum < 2 || sizeNum > 100 || !Number.isFinite(jackpotNum) || jackpotNum <= 0 || jackpotNum > 10000000) {
      return res.status(400).json({ error: 'Valid group size and target jackpot are required' });
    }

    let cleanSeats = null;
    if (seatNumbers !== undefined && seatNumbers !== null) {
      if (!Array.isArray(seatNumbers) || seatNumbers.length === 0) {
        return res.status(400).json({ error: 'Invalid seat numbers selection' });
      }
      cleanSeats = seatNumbers.map(Number);
      if (cleanSeats.some(s => !Number.isInteger(s) || s < 1 || s > sizeNum) || new Set(cleanSeats).size !== cleanSeats.length) {
        return res.status(400).json({ error: 'Seat numbers must be distinct integers within room capacity' });
      }
    }
    const seatCount = cleanSeats ? cleanSeats.length : 1;

    let tierCategory = 'starter';
    if (jackpotNum >= 100000) tierCategory = 'gold';
    else if (jackpotNum >= 10000) tierCategory = 'silver';
    else if (jackpotNum >= 1000) tierCategory = 'bronze';

    // Check if an open room matching this prize and player count already exists
    room = Array.from(roomManager.rooms.values()).find(
      r => r.status === 'open' &&
        r.groupSize === sizeNum &&
        Math.round(r.targetJackpot) === Math.round(jackpotNum) &&
        (r.filledSeats + seatCount <= r.groupSize)
    );

    if (!room) {
      room = await roomManager.createRoom(tierCategory, jackpotNum, sizeNum);
      createdNow = true;
    }

    const { newBalance, assignedSeats } = await roomManager.joinRoom(room.id, userId, seatCount, mode, username, cleanSeats);

    res.json({ success: true, balance: newBalance, assignedSeats, room: roomManager.rooms.get(room.id) || room });
  } catch (err) {
    // Roll back orphan empty room if creation succeeded but joining failed (e.g. insufficient balance)
    if (createdNow && room && room.filledSeats === 0) {
      await roomManager.deleteRoom(room.id).catch(() => { });
    }
    console.error('create_and_join error:', err);
    res.status(400).json({ error: err.message });
  }
});

// Join an existing open room
app.post('/api/v1/rooms/join', playerMiddleware, async (req, res) => {
  try {
    const userId = req.playerId;
    const { roomId, seatCount = 1, username, seatNumbers } = req.body;
    const mode = 'real'; // Strictly enforce real money mode

    if (!isValidUuid(roomId)) {
      return res.status(400).json({ error: 'Invalid room ID' });
    }

    let cleanSeats = null;
    let countNum = Number(seatCount);
    if (seatNumbers !== undefined && seatNumbers !== null) {
      if (!Array.isArray(seatNumbers) || seatNumbers.length === 0) {
        return res.status(400).json({ error: 'Invalid seat numbers selection' });
      }
      cleanSeats = seatNumbers.map(Number);
      if (cleanSeats.some(s => !Number.isInteger(s) || s < 1) || new Set(cleanSeats).size !== cleanSeats.length) {
        return res.status(400).json({ error: 'Seat numbers must be distinct positive integers' });
      }
      countNum = cleanSeats.length;
    } else if (!Number.isInteger(countNum) || countNum < 1 || countNum > 20) {
      return res.status(400).json({ error: 'Seat count must be a positive integer' });
    }

    const { newBalance, assignedSeats } = await roomManager.joinRoom(roomId, userId, countNum, mode, username, cleanSeats);
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

  // Allow clients to subscribe to a specific room channel (guarded against malformed payloads)
  socket.on('room:subscribe', (payload) => {
    if (payload && isValidUuid(payload.roomId)) {
      socket.join(`room_${payload.roomId}`);
    }
  });

  socket.on('room:unsubscribe', (payload) => {
    if (payload && isValidUuid(payload.roomId)) {
      socket.leave(`room_${payload.roomId}`);
    }
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
