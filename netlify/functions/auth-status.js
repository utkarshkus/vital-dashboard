// netlify/functions/auth-status.js
// Returns whether WHOOP tokens are stored and whether they are valid/expired.
// Used by the dashboard on load to decide whether to show "Connect WHOOP".

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
    const { getStore } = require('@netlify/blobs');
    const store = getStore('vital-auth');
    const raw = await store.get('tokens').catch(() => null);

    if (!raw) {
      return respond({ connected: false });
    }

    const tokens = JSON.parse(raw);
    const expired = Date.now() >= tokens.expiresAt;

    // If expired but refresh token exists, it can auto-renew — still "connected"
    return respond({
      connected:    true,
      expired,
      canRefresh:   !!tokens.refreshToken,
    });

  } catch (err) {
    return respond({ connected: false, error: err.message });
  }

  function respond(data) {
    return {
      statusCode: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    };
  }
};
