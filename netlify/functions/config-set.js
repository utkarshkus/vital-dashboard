// netlify/functions/config-set.js
// Writes user config to Netlify Blobs. Allowlist-protected.

const ALLOWED_KEYS = new Set([
  'startWeight',
  'currentWeight',
  'targetWeight',
  'stepTarget',
  'manualSteps',
  'wakeTime',
  'sleepTime',
  'caffeineProfile',
  'caffeineDoses',   // JSON array of dose objects
]);

// Basic value validators — reject obviously bad data
function isValid(key, value) {
  if (value === null || value === undefined) return true; // allow clearing
  switch (key) {
    case 'startWeight':
    case 'currentWeight':
    case 'targetWeight':
      return typeof value === 'number' && value > 0 && value < 500;
    case 'stepTarget':
      return typeof value === 'number' && value > 0 && value <= 100000;
    case 'manualSteps':
      return typeof value === 'number' && value >= 0 && value <= 100000;
    case 'wakeTime':
    case 'sleepTime':
      return typeof value === 'string' && /^\d{2}:\d{2}$/.test(value);
    case 'caffeineProfile':
      return ['default', 'smoker', 'contraceptive', 'pregnant'].includes(value);
    case 'caffeineDoses':
      return Array.isArray(value) && value.length <= 50; // cap at 50 doses
    default:
      return false;
  }
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let incoming;
  try {
    incoming = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  // Allowlist + validate
  const sanitised = {};
  for (const [k, v] of Object.entries(incoming)) {
    if (ALLOWED_KEYS.has(k) && isValid(k, v)) sanitised[k] = v;
  }

  try {
    const { getStore } = require('@netlify/blobs');
    const store = getStore('vital-config');

    // Merge — partial updates never wipe unmentioned fields
    const existing = await store.get('user-config');
    const current  = existing ? JSON.parse(existing) : {};
    const merged   = { ...current, ...sanitised };

    await store.set('user-config', JSON.stringify(merged));

    return {
      statusCode: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ok: true, saved: merged }),
    };
  } catch (err) {
    console.error('Blobs write error:', err.message);
    return {
      statusCode: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to save: ' + err.message }),
    };
  }
};
