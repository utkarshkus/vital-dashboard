// POST /api/login — validates credentials, issues session cookie.
const { getUsers, verifyPassword } = require('./lib/users');
const { createSession, sessionCookie } = require('./lib/session');
const { rateLimit } = require('./lib/ratelimit');

const HDR = { 'Content-Type': 'application/json' };

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: HDR, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  // Rate limit: max 10 attempts per IP per 15 minutes
  const limiter = await rateLimit(event, 'login');
  if (limiter.limited) {
    return {
      statusCode: 429,
      headers: { ...HDR, 'Retry-After': String(limiter.retryAfter) },
      body: JSON.stringify({ error: 'Too many login attempts. Try again later.' }),
    };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers: HDR, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { username, password } = body;
  if (!username || !password || typeof username !== 'string' || typeof password !== 'string'
      || username.length > 64 || password.length > 256) {
    return { statusCode: 400, headers: HDR, body: JSON.stringify({ error: 'Username and password required' }) };
  }

  try {
    const users = await getUsers(event);
    const user  = users[username.toLowerCase()];

    if (!user) {
      // Always hash to prevent user-enumeration via timing differences
      await verifyPassword('_', 'a'.repeat(64), 'b'.repeat(32)).catch(() => {});
      await limiter.increment();
      return { statusCode: 401, headers: HDR, body: JSON.stringify({ error: 'Invalid credentials' }) };
    }

    const valid = await verifyPassword(password, user.passwordHash, user.salt);
    if (!valid) {
      await limiter.increment();
      return { statusCode: 401, headers: HDR, body: JSON.stringify({ error: 'Invalid credentials' }) };
    }

    await limiter.reset(); // clear failed-attempt counter on success
    const token = await createSession(event, user.userId, user.tokenVersion || 0);
    return {
      statusCode: 200,
      headers: { ...HDR, 'Set-Cookie': sessionCookie(token) },
      body: JSON.stringify({ ok: true }),
    };
  } catch (err) {
    console.error('Login error:', err.message);
    return { statusCode: 500, headers: HDR, body: JSON.stringify({ error: 'Internal error' }) };
  }
};
