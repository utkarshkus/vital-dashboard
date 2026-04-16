// netlify/functions/whoop.js  (Netlify Functions v2)
import { getValidToken } from './lib/get-valid-token.js';

const WHOOP_BASE = 'https://api.prod.whoop.com/developer/v1';

const ALLOWED = [
  '/activity/sleep',
  '/recovery',
  '/cycle',
  '/workout',
  '/user/profile/basic',
];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

export default async (req, context) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  const url  = new URL(req.url);
  const path = url.searchParams.get('path');

  if (!path) return json(400, { error: 'Missing query param: path' });
  if (!ALLOWED.some(p => path.startsWith(p))) return json(403, { error: 'Path not permitted: ' + path });

  let token;
  try {
    token = await getValidToken();
  } catch (err) {
    if (err.message === 'NOT_AUTHENTICATED' || err.message === 'REFRESH_FAILED') {
      return json(401, { error: err.message });
    }
    return json(500, { error: err.message });
  }

  try {
    const res = await fetch(`${WHOOP_BASE}${path}`, {
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
    });
    const body = await res.text();
    return new Response(body, { status: res.status, headers: CORS });
  } catch (err) {
    return json(502, { error: 'Upstream error: ' + err.message });
  }
};

function json(status, data) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

export const config = { path: '/api/whoop' };
