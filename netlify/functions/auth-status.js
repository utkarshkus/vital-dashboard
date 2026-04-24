// Returns WHOOP connection status for the authenticated user.
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
    const store = getStore('vital-auth');
    const raw   = await store.get(`tokens-${session.userId}`).catch(() => null);

    if (!raw) return json({ connected: false });

    const tokens  = JSON.parse(raw);
    const expired = Date.now() >= tokens.expiresAt;
    return json({ connected: true, expired, canRefresh: !!tokens.refreshToken });

  } catch (err) {
    return json({ connected: false });
  }

  function json(data) {
    return { statusCode: 200, headers: HDR, body: JSON.stringify(data) };
  }
};
