// netlify/functions/config-get.js  (Netlify Functions v2)
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
    const store = getStore({ name: 'vital-config', consistency: 'strong' });
    const raw   = await store.get('user-config').catch(() => null);
    const data  = raw ? JSON.parse(raw) : {};
    return new Response(JSON.stringify(data), { status: 200, headers: CORS });
  } catch (err) {
    console.warn('Blobs unavailable:', err.message);
    return new Response(JSON.stringify({}), { status: 200, headers: CORS });
  }
};

export const config = { path: '/api/config-get' };
