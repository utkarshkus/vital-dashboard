// WHOOP API proxy — validates session, auto-refreshes token via Blobs.
const { getValidToken } = require('./lib/get-valid-token');
const { requireSession } = require('./lib/session');

const WHOOP_BASE = 'https://api.prod.whoop.com/developer/v2';
const ALLOWED = ['/activity/sleep', '/recovery', '/cycle', '/workout', '/user/profile/basic', '/user/measurement/body'];

const HDR = { 'Content-Type': 'application/json' };

exports.handler = async (event) => {
  let session;
  try {
    session = await requireSession(event);
  } catch (err) {
    return json(401, { error: 'NO_SESSION' });
  }

  const path = event.queryStringParameters?.path;
  if (!path) return json(400, { error: 'Missing query param: path' });
  // Reject path traversal sequences before the allowlist check.
  if (path.includes('..') || /%2e/i.test(path)) return json(403, { error: 'Path not permitted' });
  if (!ALLOWED.some(p => path.startsWith(p))) return json(403, { error: 'Path not permitted' });

  let token;
  try {
    token = await getValidToken(event, session.userId);
  } catch (err) {
    if (err.message === 'NOT_AUTHENTICATED' || err.message === 'REFRESH_FAILED') {
      return json(401, { error: err.message });
    }
    return json(500, { error: 'Token error' });
  }

  try {
    const res  = await fetch(`${WHOOP_BASE}${path}`, {
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    });
    const body = await res.text();
    return { statusCode: res.status, headers: HDR, body };
  } catch (err) {
    return json(502, { error: 'Upstream error' });
  }
};

function json(status, data) {
  return { statusCode: status, headers: HDR, body: JSON.stringify(data) };
}
