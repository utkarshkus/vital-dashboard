// GET /api/config-get — returns the authenticated user's config from Blobs.
const { requireSession } = require('./lib/session');

const HDR = { 'Content-Type': 'application/json' };

exports.handler = async (event) => {
  let session;
  try {
    session = await requireSession(event);
  } catch (err) {
    return { statusCode: 401, headers: HDR, body: JSON.stringify({ error: 'NO_SESSION' }) };
  }

  try {
    const { getStore, connectLambda } = require('@netlify/blobs');
    connectLambda(event);
    const store = getStore('vital-config');
    const raw   = await store.get(`config-${session.userId}`);
    return { statusCode: 200, headers: HDR, body: raw || '{}' };
  } catch (err) {
    console.warn('Blobs unavailable:', err.message);
    return { statusCode: 500, headers: HDR, body: JSON.stringify({ error: 'Blobs unavailable' }) };
  }
};
