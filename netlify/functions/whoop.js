// netlify/functions/whoop.js
// Serverless proxy — WHOOP_TOKEN lives only in Netlify env, never sent to browser.

const WHOOP_BASE = 'https://api.prod.whoop.com/developer/v1';

exports.handler = async (event) => {
  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };

  // Preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }

  const token = process.env.WHOOP_TOKEN;
  if (!token) {
    return {
      statusCode: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'WHOOP_TOKEN environment variable is not set.' }),
    };
  }

  // path param: e.g. /activity/sleep?limit=1
  const path = event.queryStringParameters?.path;
  if (!path) {
    return {
      statusCode: 400,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Missing required query param: path' }),
    };
  }

  // Only allow known WHOOP endpoints to prevent open-proxy abuse
  const ALLOWED = ['/activity/sleep', '/recovery', '/cycle', '/workout', '/user/profile/basic'];
  const allowed = ALLOWED.some(prefix => path.startsWith(prefix));
  if (!allowed) {
    return {
      statusCode: 403,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: `Path not permitted: ${path}` }),
    };
  }

  try {
    const url = `${WHOOP_BASE}${path}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    const body = await res.text();
    return {
      statusCode: res.status,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body,
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: `Upstream error: ${err.message}` }),
    };
  }
};
