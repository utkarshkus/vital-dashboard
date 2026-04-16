// netlify/functions/auth-status.js
// Returns WHOOP connection status — connected, expired, canRefresh.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }

  try {
    const { getStore, connectLambda } = require('@netlify/blobs');
    connectLambda(event);
    const store = getStore({ name: 'vital-auth', consistency: 'strong' });
    const raw   = await store.get('tokens').catch(() => null);

    if (!raw) return json({ connected: false });

    const tokens  = JSON.parse(raw);
    const expired = Date.now() >= tokens.expiresAt;
    return json({ connected: true, expired, canRefresh: !!tokens.refreshToken });

  } catch (err) {
    return json({ connected: false, error: err.message });
  }

  function json(data) {
    return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify(data) };
  }
};
