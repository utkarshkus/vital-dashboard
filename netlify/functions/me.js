// GET /api/me — returns the current user's profile (userId, username, displayName, isAdmin).
const { requireSession } = require('./lib/session');
const { getUsers } = require('./lib/users');

const HDR = { 'Content-Type': 'application/json' };

exports.handler = async (event) => {
  let session;
  try {
    session = await requireSession(event);
  } catch {
    return { statusCode: 401, headers: HDR, body: JSON.stringify({ error: 'NO_SESSION' }) };
  }

  try {
    const users = await getUsers(event);
    const entry = Object.entries(users).find(([, u]) => u.userId === session.userId);
    if (!entry) {
      return { statusCode: 404, headers: HDR, body: JSON.stringify({ error: 'User not found' }) };
    }
    const [username, u] = entry;
    return {
      statusCode: 200,
      headers: HDR,
      body: JSON.stringify({
        userId:      u.userId,
        username,
        displayName: u.displayName,
        isAdmin:     u.isAdmin || false,
      }),
    };
  } catch (err) {
    console.error('me error:', err.message);
    return { statusCode: 500, headers: HDR, body: JSON.stringify({ error: 'Internal error' }) };
  }
};
