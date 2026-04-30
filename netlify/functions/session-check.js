// GET /api/session-check — returns 200 if session cookie is valid, 401 otherwise.
// Uses requireSession (not getSession) so tokenVersion invalidation is enforced here too.
const { requireSession } = require('./lib/session');

const HDR = { 'Content-Type': 'application/json' };

exports.handler = async (event) => {
  try {
    await requireSession(event);
    return { statusCode: 200, headers: HDR, body: JSON.stringify({ authenticated: true }) };
  } catch (err) {
    if (err.statusCode === 401) {
      return { statusCode: 401, headers: HDR, body: JSON.stringify({ authenticated: false }) };
    }
    return { statusCode: 500, headers: HDR, body: JSON.stringify({ error: 'Internal error' }) };
  }
};
