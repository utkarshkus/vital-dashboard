// POST /api/config-set — merges validated fields into the authenticated user's config in Blobs.
const { requireSession } = require('./lib/session');

const ALLOWED_KEYS = new Set(['startWeight','currentWeight','targetWeight','startDate','targetDate','stepTarget','manualSteps','wakeTime','sleepTime','caffeineProfile','caffeineDoses','weightLogs']);

function isValid(key, value) {
  if (value === null || value === undefined) return true;
  switch (key) {
    case 'startWeight': case 'currentWeight': case 'targetWeight':
      return typeof value === 'number' && value > 0 && value < 500;
    case 'stepTarget': case 'manualSteps':
      return typeof value === 'number' && value >= 0 && value <= 100000;
    case 'startDate': case 'targetDate':
      return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
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

const HDR = { 'Content-Type': 'application/json' };

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: HDR, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let session;
  try {
    session = await requireSession(event);
  } catch (err) {
    return { statusCode: 401, headers: HDR, body: JSON.stringify({ error: 'NO_SESSION' }) };
  }

  let incoming;
  try { incoming = JSON.parse(event.body || '{}'); }
  catch { return { statusCode: 400, headers: HDR, body: JSON.stringify({ error: 'Invalid JSON' }) }; }

  const sanitised = {};
  for (const [k, v] of Object.entries(incoming)) {
    if (ALLOWED_KEYS.has(k) && isValid(k, v)) sanitised[k] = v;
  }

  try {
    const { getStore, connectLambda } = require('@netlify/blobs');
    connectLambda(event);
    const store   = getStore('vital-config');
    const key     = `config-${session.userId}`;
    const raw     = await store.get(key);
    const current = raw ? JSON.parse(raw) : {};
    const merged  = { ...current, ...sanitised };
    await store.set(key, JSON.stringify(merged));
    return { statusCode: 200, headers: HDR, body: JSON.stringify({ ok: true, saved: merged }) };
  } catch (err) {
    console.error('Blobs write error:', err.message);
    return { statusCode: 500, headers: HDR, body: JSON.stringify({ error: 'Failed to save' }) };
  }
};
