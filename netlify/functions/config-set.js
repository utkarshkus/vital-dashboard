// netlify/functions/config-set.js
const ALLOWED_KEYS = new Set(['startWeight','currentWeight','targetWeight','stepTarget','manualSteps','wakeTime','sleepTime','caffeineProfile','caffeineDoses','weightLogs']);

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
      return ['default','smoker','contraceptive','pregnant'].includes(value);
    case 'caffeineDoses':
      return Array.isArray(value) && value.length <= 50;
    case 'weightLogs':
      return Array.isArray(value) && value.length <= 365 &&
        value.every(function(e) {
          return e && typeof e.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(e.date) &&
            typeof e.weight === 'number' && e.weight > 0 && e.weight < 500;
        });
    default: return false;
  }
}

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };

  let incoming;
  try { incoming = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const sanitised = {};
  for (const [k, v] of Object.entries(incoming)) {
    if (ALLOWED_KEYS.has(k) && isValid(k, v)) sanitised[k] = v;
  }

  try {
    const { getStore, connectLambda } = require('@netlify/blobs');
    connectLambda(event);
    const store   = getStore('vital-config');
    const raw     = await store.get('user-config').catch(() => null);
    const current = raw ? JSON.parse(raw) : {};
    const merged  = { ...current, ...sanitised };
    await store.set('user-config', JSON.stringify(merged));
    return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true, saved: merged }) };
  } catch (err) {
    console.error('Blobs write error:', err.message);
    return { statusCode: 500, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Failed to save: ' + err.message }) };
  }
};
