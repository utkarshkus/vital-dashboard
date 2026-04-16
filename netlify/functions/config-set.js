// netlify/functions/config-set.js  (Netlify Functions v2)
import { getStore } from '@netlify/blobs';

const ALLOWED_KEYS = new Set([
  'startWeight', 'currentWeight', 'targetWeight',
  'stepTarget', 'manualSteps',
  'wakeTime', 'sleepTime',
  'caffeineProfile', 'caffeineDoses',
]);

function isValid(key, value) {
  if (value === null || value === undefined) return true;
  switch (key) {
    case 'startWeight': case 'currentWeight': case 'targetWeight':
      return typeof value === 'number' && value > 0 && value < 500;
    case 'stepTarget': case 'manualSteps':
      return typeof value === 'number' && value >= 0 && value <= 100000;
    case 'wakeTime': case 'sleepTime':
      return typeof value === 'string' && /^\d{2}:\d{2}$/.test(value);
    case 'caffeineProfile':
      return ['default', 'smoker', 'contraceptive', 'pregnant'].includes(value);
    case 'caffeineDoses':
      return Array.isArray(value) && value.length <= 50;
    default:
      return false;
  }
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

export default async (req, context) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: CORS });
  }

  let incoming;
  try {
    incoming = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: CORS });
  }

  const sanitised = {};
  for (const [k, v] of Object.entries(incoming)) {
    if (ALLOWED_KEYS.has(k) && isValid(k, v)) sanitised[k] = v;
  }

  try {
    const store   = getStore({ name: 'vital-config', consistency: 'strong' });
    const raw     = await store.get('user-config').catch(() => null);
    const current = raw ? JSON.parse(raw) : {};
    const merged  = { ...current, ...sanitised };
    await store.set('user-config', JSON.stringify(merged));
    return new Response(JSON.stringify({ ok: true, saved: merged }), { status: 200, headers: CORS });
  } catch (err) {
    console.error('Blobs write error:', err.message);
    return new Response(JSON.stringify({ error: 'Failed to save: ' + err.message }), { status: 500, headers: CORS });
  }
};

export const config = { path: '/api/config-set' };
