// netlify/functions/auth-status.js  (Netlify Functions v2)
import { getStore } from '@netlify/blobs';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

export default async (req, context) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  try {
    const store = getStore({ name: 'vital-auth', consistency: 'strong' });
    const raw   = await store.get('tokens').catch(() => null);

    if (!raw) {
      return json({ connected: false });
    }

    const tokens  = JSON.parse(raw);
    const expired = Date.now() >= tokens.expiresAt;

    return json({ connected: true, expired, canRefresh: !!tokens.refreshToken });

  } catch (err) {
    return json({ connected: false, error: err.message });
  }
};

function json(data) {
  return new Response(JSON.stringify(data), { status: 200, headers: CORS });
}

export const config = { path: '/api/auth-status' };
