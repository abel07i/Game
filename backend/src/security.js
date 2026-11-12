const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUuid(val) {
  return typeof val === 'string' && UUID_REGEX.test(val.trim());
}

/**
 * Lightweight in-memory rate limiter suitable for single-instance 1GB VPS deployments.
 * Automatically prunes expired buckets to keep memory footprint bounded.
 */
function createRateLimiter({ windowMs = 15 * 60 * 1000, max = 20, keyGenerator, message } = {}) {
  const buckets = new Map();
  const maxEntries = 10000;

  // Periodic cleanup every 5 minutes (unref so it doesn't keep Node alive on shutdown)
  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [k, entry] of buckets.entries()) {
      if (now >= entry.resetAt) buckets.delete(k);
    }
  }, 5 * 60 * 1000);
  if (cleanupTimer.unref) cleanupTimer.unref();

  return (req, res, next) => {
    const now = Date.now();
    const key = keyGenerator
      ? keyGenerator(req)
      : (req.ip || req.socket?.remoteAddress || 'unknown');

    let entry = buckets.get(key);
    if (!entry || now >= entry.resetAt) {
      if (buckets.size >= maxEntries) {
        // Evict oldest entry to prevent unbounded memory growth under DoS
        const firstKey = buckets.keys().next().value;
        if (firstKey !== undefined) buckets.delete(firstKey);
      }
      entry = { count: 0, resetAt: now + windowMs };
      buckets.set(key, entry);
    }

    entry.count += 1;
    if (entry.count > max) {
      const retryAfterSec = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      res.set('Retry-After', String(retryAfterSec));
      return res.status(429).json({
        error: message || `Too many attempts. Please wait ${retryAfterSec} seconds and try again.`
      });
    }

    next();
  };
}

/**
 * Express security headers middleware (zero external dependencies).
 */
function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('X-XSS-Protection', '0');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; connect-src 'self' ws: wss:; frame-ancestors 'none'; object-src 'none'; base-uri 'self'"
  );
  next();
}

const FORBIDDEN_REWRITE_HEADERS = [
  'x-original-url',
  'x-rewrite-url',
  'x-http-method-override',
  'x-method-override',
  'x-http-method'
];

const HOST_HEADER_RE = /^(?:\[[a-fA-F0-9:]+\]|[a-zA-Z0-9.-]+)(?::\d{1,5})?$/;
const MAX_URL_LENGTH = 2048;

function isValidHostValue(hostValue) {
  if (typeof hostValue !== 'string') return false;
  const trimmed = hostValue.trim();
  if (!trimmed || trimmed.length > 255) return false;
  if (!HOST_HEADER_RE.test(trimmed)) return false;

  if (process.env.ALLOWED_HOSTS) {
    const allowed = new Set(
      process.env.ALLOWED_HOSTS.split(',').map(h => h.trim().toLowerCase()).filter(Boolean)
    );
    const hostOnly = trimmed.toLowerCase().replace(/:\d+$/, '');
    if (!allowed.has(trimmed.toLowerCase()) && !allowed.has(hostOnly)) {
      return false;
    }
  }
  return true;
}

function hasPollutedQueryParams(query) {
  if (!query || typeof query !== 'object') return false;
  for (const val of Object.values(query)) {
    if (Array.isArray(val) || (val !== null && typeof val === 'object')) {
      return true;
    }
  }
  return false;
}

/**
 * Protects routes against URL manipulation, proxy URL rewriting,
 * method override smuggling, host header injection, path traversal, and HPP.
 */
function urlIntegrityGuard(req, res, next) {
  for (const headerName of FORBIDDEN_REWRITE_HEADERS) {
    if (req.headers[headerName] !== undefined) {
      return res.status(403).json({ error: 'Forbidden request override header' });
    }
  }

  if (req.headers.host !== undefined && !isValidHostValue(req.headers.host)) {
    return res.status(400).json({ error: 'Invalid Host header' });
  }
  if (req.headers['x-forwarded-host'] !== undefined && !isValidHostValue(req.headers['x-forwarded-host'])) {
    return res.status(400).json({ error: 'Invalid X-Forwarded-Host header' });
  }

  const rawUrl = req.originalUrl || req.url || '';
  if (rawUrl.length > MAX_URL_LENGTH) {
    return res.status(400).json({ error: 'URL exceeds maximum allowed length' });
  }
  if (/[\x00-\x1f\x7f\\]/.test(rawUrl)) {
    return res.status(400).json({ error: 'Malformed characters in URL' });
  }

  const qIndex = rawUrl.indexOf('?');
  const rawPath = qIndex === -1 ? rawUrl : rawUrl.slice(0, qIndex);
  const rawQuery = qIndex === -1 ? '' : rawUrl.slice(qIndex + 1);

  if (/%00|%5c/i.test(rawUrl)) {
    return res.status(400).json({ error: 'Forbidden encoded sequence in URL' });
  }
  if (/%25[0-9a-f]{2}/i.test(rawPath)) {
    return res.status(400).json({ error: 'Double-encoded URL path is not allowed' });
  }
  if (/(?:^|\/)(?:\.{1,2}|%2e%2e|%2e)(?:\/|$)/i.test(rawPath) || /(?:^|\/)(?:\.|%2e)[^/]+/i.test(rawPath)) {
    return res.status(400).json({ error: 'Invalid or hidden URL path segment' });
  }
  if (rawQuery && /\.\.|%2e%2e/i.test(rawQuery)) {
    return res.status(400).json({ error: 'Invalid path traversal sequence in query' });
  }

  try {
    const decodedPath = decodeURIComponent(rawPath);
    if (/[\x00-\x1f\x7f\\]/.test(decodedPath) || /(?:^|\/)\.{1,2}(?:\/|$)|(?:^|\/)\.[^/]/.test(decodedPath)) {
      return res.status(400).json({ error: 'Invalid decoded URL path' });
    }
  } catch {
    return res.status(400).json({ error: 'Malformed percent-encoding in URL' });
  }

  if (hasPollutedQueryParams(req.query)) {
    return res.status(400).json({ error: 'Duplicate or nested query parameters are not allowed' });
  }

  next();
}

/**
 * Validates that a Telebirr receipt from verify.et actually credits the platform's account.
 * Handles Ethio telecom masked phone numbers (e.g. 2519****6463 -> trailing 4 digits 6463).
 */
function verifyTelebirrReceiver(verifyData, configPhone = '', configName = '') {
  const data = verifyData?.data || {};
  const finalResult = data.result || {};
  const receipt = finalResult.receipt || finalResult.transaction || data.receipt || {};

  // Reject explicitly non-completed / reversed / failed receipt statuses
  const receiptStatus = String(
    finalResult.status || receipt.status || data.status || ''
  ).toLowerCase();
  if (['reversed', 'failed', 'cancelled', 'canceled', 'pending', 'rejected'].includes(receiptStatus)) {
    return { valid: false, reason: `Transaction status is "${receiptStatus}", not completed.` };
  }

  const receiverAccountRaw =
    finalResult.creditedPartyAccountNo ||
    finalResult.receiverPhone ||
    finalResult.receiverAccount ||
    finalResult.receiver?.account ||
    finalResult.creditedParty?.account ||
    receipt.creditedPartyAccountNo ||
    receipt.receiver?.account ||
    receipt.creditedParty?.account ||
    finalResult.to ||
    data.receiverAccount ||
    '';

  const receiverNameRaw =
    finalResult.creditedPartyName ||
    finalResult.receiverName ||
    finalResult.receiver?.name ||
    finalResult.creditedParty?.name ||
    receipt.creditedPartyName ||
    receipt.receiver?.name ||
    receipt.creditedParty?.name ||
    '';

  const cfgDigits = String(configPhone || '').replace(/\D/g, '');
  const rcvStr = String(receiverAccountRaw || '').trim();

  if (rcvStr && cfgDigits.length >= 4) {
    // Extract trailing consecutive digits (handles masked strings like "2519****6463")
    const trailingMatch = rcvStr.match(/(\d{4,})$/);
    if (trailingMatch) {
      const trailing = trailingMatch[1];
      const compareLen = Math.min(trailing.length, cfgDigits.length, 9);
      const rcvTail = trailing.slice(-compareLen);
      const cfgTail = cfgDigits.slice(-compareLen);
      if (rcvTail !== cfgTail) {
        return {
          valid: false,
          reason: 'This Telebirr receipt was not sent to the official platform account.'
        };
      }
      return { valid: true };
    }
  }

  // Fallback check if only receiver name is returned and no account digits were found
  const cfgNameClean = String(configName || '').trim().toLowerCase();
  const rcvNameClean = String(receiverNameRaw || '').trim().toLowerCase();
  if (rcvNameClean && cfgNameClean.length >= 3) {
    const firstToken = cfgNameClean.split(/\s+/)[0];
    if (firstToken.length >= 3 && !rcvNameClean.includes(firstToken)) {
      return {
        valid: false,
        reason: 'This Telebirr receipt receiver name does not match the platform account.'
      };
    }
  }

  return { valid: true };
}

module.exports = {
  UUID_REGEX,
  isValidUuid,
  createRateLimiter,
  securityHeaders,
  urlIntegrityGuard,
  verifyTelebirrReceiver
};
