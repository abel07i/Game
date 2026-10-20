const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const bcrypt = require('bcrypt');

const JWT_SECRET = process.env.JWT_SECRET || 'fastderash_admin_secret_2024_change_in_production';
const JWT_EXPIRES_IN = '24h';

async function hashPassword(pw) {
  return await bcrypt.hash(pw, 10);
}

async function verifyPassword(pw, hash) {
  if (!hash) return false;
  if (hash.startsWith('$2a$') || hash.startsWith('$2b$')) {
    return await bcrypt.compare(pw, hash);
  }
  const sha = crypto.createHash('sha256').update(pw).digest('hex');
  return sha === hash;
}

function generateToken(admin) {
  return jwt.sign(
    { id: admin.id, role: admin.role, email: admin.email },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

function adminMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = verifyToken(token);
    if (decoded.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { hashPassword, verifyPassword, generateToken, verifyToken, adminMiddleware };
