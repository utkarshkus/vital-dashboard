// GET /api/session-check — returns 200 if session cookie is valid, 401 otherwise.
const { getSession } = require('./lib/session');

const HDR = { 'Content-Type': 'application/json' };

exports.handler = async (event) => {
  try {
    const session = await getSession(event);
    if (!session) {
      return { statusCode: 401, headers: HDR, body: JSON.stringify({ authenticated: false }) };
    }
    return { statusCode: 200, headers: HDR, body: JSON.stringify({ authenticated: true }) };
  } catch (err) {
    return { statusCode: 500, headers: HDR, body: JSON.stringify({ error: 'Internal error' }) };
  }
};
