// User management — admin only.
// GET    /api/admin-users         → list all users (no password hashes)
// POST   /api/admin-users         → create a new user  { username, password, isAdmin? }
// DELETE /api/admin-users         → remove a user       { username }
// PATCH  /api/admin-users         → toggle admin flag   { username, isAdmin }
const crypto = require('crypto');
const { requireSession } = require('./lib/session');
const { getUsers, saveUsers, hashPassword, requireAdmin } = require('./lib/users');

const HDR = { 'Content-Type': 'application/json' };

exports.handler = async (event) => {
  // Must be authenticated
  let session;
  try {
    session = await requireSession(event);
  } catch {
    return { statusCode: 401, headers: HDR, body: JSON.stringify({ error: 'NO_SESSION' }) };
  }

  // Must be admin
  try {
    await requireAdmin(event, session);
  } catch {
    return { statusCode: 403, headers: HDR, body: JSON.stringify({ error: 'Admin access required' }) };
  }

  // ── GET: list users ────────────────────────────────────────────
  if (event.httpMethod === 'GET') {
    try {
      const users = await getUsers(event);
      const list = Object.entries(users).map(([username, u]) => ({
        username,
        displayName: u.displayName,
        userId:      u.userId,
        isAdmin:     u.isAdmin || false,
        isSelf:      u.userId === session.userId,
      }));
      return { statusCode: 200, headers: HDR, body: JSON.stringify({ users: list }) };
    } catch (err) {
      console.error('admin-users GET error:', err.message);
      return { statusCode: 500, headers: HDR, body: JSON.stringify({ error: 'Internal error' }) };
    }
  }

  // ── POST: create user ──────────────────────────────────────────
  if (event.httpMethod === 'POST') {
    let body;
    try { body = JSON.parse(event.body || '{}'); }
    catch { return { statusCode: 400, headers: HDR, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

    const { username, password, isAdmin = false } = body;
    if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
      return { statusCode: 400, headers: HDR, body: JSON.stringify({ error: 'Username and password required' }) };
    }
    if (!/^[a-zA-Z0-9_.-]{2,32}$/.test(username)) {
      return { statusCode: 400, headers: HDR, body: JSON.stringify({ error: 'Username must be 2-32 chars: letters, digits, _ . -' }) };
    }
    if (password.length < 8 || password.length > 256) {
      return { statusCode: 400, headers: HDR, body: JSON.stringify({ error: 'Password must be 8-256 characters' }) };
    }

    try {
      const users = await getUsers(event);
      if (users[username.toLowerCase()]) {
        return { statusCode: 409, headers: HDR, body: JSON.stringify({ error: 'Username already exists' }) };
      }
      const userId = crypto.randomBytes(8).toString('hex');
      const { hash, salt, iterations } = await hashPassword(password);
      users[username.toLowerCase()] = { userId, passwordHash: hash, salt, iterations, displayName: username, isAdmin: !!isAdmin, tokenVersion: 0 };
      await saveUsers(event, users);
      return { statusCode: 201, headers: HDR, body: JSON.stringify({ ok: true, userId }) };
    } catch (err) {
      console.error('admin-users POST error:', err.message);
      return { statusCode: 500, headers: HDR, body: JSON.stringify({ error: 'Internal error' }) };
    }
  }

  // ── PATCH: toggle admin flag ───────────────────────────────────
  if (event.httpMethod === 'PATCH') {
    let body;
    try { body = JSON.parse(event.body || '{}'); }
    catch { return { statusCode: 400, headers: HDR, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

    const { username, isAdmin } = body;
    if (!username || typeof isAdmin !== 'boolean') {
      return { statusCode: 400, headers: HDR, body: JSON.stringify({ error: 'username and isAdmin (boolean) required' }) };
    }

    try {
      const users = await getUsers(event);
      const target = users[username.toLowerCase()];
      if (!target) {
        return { statusCode: 404, headers: HDR, body: JSON.stringify({ error: 'User not found' }) };
      }
      if (target.userId === session.userId) {
        return { statusCode: 400, headers: HDR, body: JSON.stringify({ error: 'Cannot change your own admin status' }) };
      }
      users[username.toLowerCase()] = { ...target, isAdmin };
      await saveUsers(event, users);
      return { statusCode: 200, headers: HDR, body: JSON.stringify({ ok: true }) };
    } catch (err) {
      console.error('admin-users PATCH error:', err.message);
      return { statusCode: 500, headers: HDR, body: JSON.stringify({ error: 'Internal error' }) };
    }
  }

  // ── DELETE: remove user ────────────────────────────────────────
  if (event.httpMethod === 'DELETE') {
    let body;
    try { body = JSON.parse(event.body || '{}'); }
    catch { return { statusCode: 400, headers: HDR, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

    const { username } = body;
    if (!username) {
      return { statusCode: 400, headers: HDR, body: JSON.stringify({ error: 'username required' }) };
    }

    try {
      const users = await getUsers(event);
      const target = users[username.toLowerCase()];
      if (!target) {
        return { statusCode: 404, headers: HDR, body: JSON.stringify({ error: 'User not found' }) };
      }
      if (target.userId === session.userId) {
        return { statusCode: 400, headers: HDR, body: JSON.stringify({ error: 'Cannot delete your own account' }) };
      }
      delete users[username.toLowerCase()];
      await saveUsers(event, users);
      return { statusCode: 200, headers: HDR, body: JSON.stringify({ ok: true }) };
    } catch (err) {
      console.error('admin-users DELETE error:', err.message);
      return { statusCode: 500, headers: HDR, body: JSON.stringify({ error: 'Internal error' }) };
    }
  }

  return { statusCode: 405, headers: HDR, body: JSON.stringify({ error: 'Method not allowed' }) };
};
