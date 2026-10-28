// POST /api/reset-password — out-of-band password reset for account recovery.
//
// Body: { token, username, newPassword }
//
// This endpoint is INERT by default: it returns 403 unless the RECOVERY_TOKEN
// environment variable is set in the Netlify site configuration. To use it:
//   1. Set RECOVERY_TOKEN to a long random string in the Netlify UI and redeploy.
//   2. POST the matching token plus the username and a new password.
//   3. Delete RECOVERY_TOKEN from the Netlify UI and redeploy to disable it again.
//
// The user's record is updated in place: userId, displayName, and isAdmin are
// preserved, so all per-user data (config, WHOOP tokens) stays attached.
// tokenVersion is incremented, which invalidates any existing sessions.
const crypto = require('crypto');
const { getUsers, saveUsers, hashPassword } = require('./lib/users');
const { rateLimit } = require('./lib/ratelimit');

const HDR = { 'Content-Type': 'application/json' };

// Constant-time string compare that tolerates differing lengths by comparing
// fixed-size SHA-256 digests (timingSafeEqual throws on length mismatch).
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: HDR, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // Disabled unless an operator has set RECOVERY_TOKEN in the environment.
  const expected = process.env.RECOVERY_TOKEN;
  if (!expected || typeof expected !== 'string' || expected.length < 16) {
    return { statusCode: 403, headers: HDR, body: JSON.stringify({ error: 'Recovery disabled' }) };
  }

  // Rate limit per IP so the recovery token itself cannot be brute-forced.
  const limiter = await rateLimit(event, 'reset');
  if (limiter.limited) {
    return {
      statusCode: 429,
      headers: { ...HDR, 'Retry-After': String(limiter.retryAfter) },
      body: JSON.stringify({ error: 'Too many attempts. Try again later.' }),
    };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers: HDR, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { token, username, newPassword } = body;
  if (!token || !username || !newPassword
      || typeof token !== 'string' || typeof username !== 'string' || typeof newPassword !== 'string') {
    return { statusCode: 400, headers: HDR, body: JSON.stringify({ error: 'token, username and newPassword required' }) };
  }
  if (newPassword.length < 8 || newPassword.length > 256) {
    return { statusCode: 400, headers: HDR, body: JSON.stringify({ error: 'New password must be 8-256 characters' }) };
  }

  // Verify the recovery token before any user lookup (no enumeration without it).
  if (!safeEqual(token, expected)) {
    await limiter.increment();
    return { statusCode: 401, headers: HDR, body: JSON.stringify({ error: 'Invalid recovery token' }) };
  }

  try {
    const users = await getUsers(event);
    const key   = username.toLowerCase();
    const user  = users[key];
    if (!user) {
      return { statusCode: 404, headers: HDR, body: JSON.stringify({ error: 'User not found' }) };
    }

    await limiter.reset();
    const { hash, salt, iterations } = await hashPassword(newPassword);
    // Preserve userId / displayName / isAdmin so all per-user data stays linked.
    // Bumping tokenVersion invalidates every existing session for this user.
    users[key] = { ...user, passwordHash: hash, salt, iterations, tokenVersion: (user.tokenVersion || 0) + 1 };
    await saveUsers(event, users);
    return { statusCode: 200, headers: HDR, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error('reset-password error:', err.message);
    return { statusCode: 500, headers: HDR, body: JSON.stringify({ error: 'Internal error' }) };
  }
};
