// netlify/functions/whoop.js
// WHOOP API proxy — auto-refreshes token via Blobs.

const { getValidToken } = require('./lib/get-valid-token');

const WHOOP_BASE = 'https://api.prod.whoop.com/developer/v1';

const ALLOWED = ['/activity/sleep', '/recovery', '/cycle', '/workout', '/user/profile/basic'];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }

  const path = event.queryStringParameters?.path;
  if (!path) return json(400, { error: 'Missing query param: path' });
  if (!ALLOWED.some(p => path.startsWith(p))) return json(403, { error: 'Path not permitted: ' + path });

  let token;
  try {
    token = await getValidToken(event);
  } catch (err) {
    if (err.message === 'NOT_AUTHENTICATED' || err.message === 'REFRESH_FAILED') {
      return json(401, { error: err.message });
    }
    return json(500, { error: err.message });
  }

  try {
    const res  = await fetch(`${WHOOP_BASE}${path}`, {
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    });
    const body = await res.text();
    return { statusCode: res.status, headers: { ...CORS, 'Content-Type': 'application/json' }, body };
  } catch (err) {
    return json(502, { error: 'Upstream error: ' + err.message });
  }
};

function json(status, data) {
  return { statusCode: status, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(data) };
}
