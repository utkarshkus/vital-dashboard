// GET  /api/setup — returns { needsSetup: bool }
// POST /api/setup — creates the first user account (blocked if users already exist).
const crypto = require('crypto');
const { getUsers, saveUsers, hashPassword } = require('./lib/users');
const { createSession, sessionCookie } = require('./lib/session');

const HDR = { 'Content-Type': 'application/json' };

exports.handler = async (event) => {
  if (event.httpMethod === 'GET') {
    try {
      const users = await getUsers(event);
      return {
        statusCode: 200,
        headers: HDR,
        body: JSON.stringify({ needsSetup: Object.keys(users).length === 0 }),
      };
    } catch (err) {
      console.error('Setup GET error:', err.message);
      return { statusCode: 500, headers: HDR, body: JSON.stringify({ error: 'Internal error' }) };
    }
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: HDR, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const users = await getUsers(event);
    if (Object.keys(users).length > 0) {
      return { statusCode: 403, headers: HDR, body: JSON.stringify({ error: 'Setup already complete' }) };
    }

    let body;
    try { body = JSON.parse(event.body || '{}'); }
    catch { return { statusCode: 400, headers: HDR, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

    const { username, password } = body;
    if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
      return { statusCode: 400, headers: HDR, body: JSON.stringify({ error: 'Username and password required' }) };
    }
    if (!/^[a-zA-Z0-9_.-]{2,32}$/.test(username)) {
      return { statusCode: 400, headers: HDR, body: JSON.stringify({ error: 'Username must be 2-32 alphanumeric characters (a-z, 0-9, _ . -)' }) };
    }
    if (password.length < 8 || password.length > 256) {
      return { statusCode: 400, headers: HDR, body: JSON.stringify({ error: 'Password must be 8-256 characters' }) };
    }

    const userId = crypto.randomBytes(8).toString('hex');
    const { hash, salt, iterations } = await hashPassword(password);
    await saveUsers(event, {
      [username.toLowerCase()]: { userId, passwordHash: hash, salt, iterations, displayName: username, isAdmin: true, tokenVersion: 0 },
    });

    const token = await createSession(event, userId, 0);
    return {
      statusCode: 200,
      headers: { ...HDR, 'Set-Cookie': sessionCookie(token) },
      body: JSON.stringify({ ok: true }),
    };
  } catch (err) {
    console.error('Setup POST error:', err.message);
    return { statusCode: 500, headers: HDR, body: JSON.stringify({ error: 'Internal error' }) };
  }
};
