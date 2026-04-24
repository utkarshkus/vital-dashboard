// POST /api/change-password — lets the current user update their own password.
// Body: { currentPassword, newPassword }
const { requireSession } = require('./lib/session');
const { getUsers, saveUsers, hashPassword, verifyPassword } = require('./lib/users');

const HDR = { 'Content-Type': 'application/json' };

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: HDR, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let session;
  try {
    session = await requireSession(event);
  } catch {
    return { statusCode: 401, headers: HDR, body: JSON.stringify({ error: 'NO_SESSION' }) };
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers: HDR, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const { currentPassword, newPassword } = body;
  if (!currentPassword || !newPassword || typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
    return { statusCode: 400, headers: HDR, body: JSON.stringify({ error: 'currentPassword and newPassword required' }) };
  }
  if (newPassword.length < 8 || newPassword.length > 256) {
    return { statusCode: 400, headers: HDR, body: JSON.stringify({ error: 'New password must be 8-256 characters' }) };
  }

  try {
    const users = await getUsers(event);
    const entry = Object.entries(users).find(([, u]) => u.userId === session.userId);
    if (!entry) {
      return { statusCode: 404, headers: HDR, body: JSON.stringify({ error: 'User not found' }) };
    }
    const [username, user] = entry;

    const valid = await verifyPassword(currentPassword, user.passwordHash, user.salt);
    if (!valid) {
      return { statusCode: 401, headers: HDR, body: JSON.stringify({ error: 'Current password is incorrect' }) };
    }

    const { hash, salt } = await hashPassword(newPassword);
    users[username] = { ...user, passwordHash: hash, salt };
    await saveUsers(event, users);
    return { statusCode: 200, headers: HDR, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error('change-password error:', err.message);
    return { statusCode: 500, headers: HDR, body: JSON.stringify({ error: 'Internal error' }) };
  }
};
