// Generates OAuth state keyed to the current user, stores in Blobs, redirects to WHOOP auth page.
const crypto = require('crypto');
const { requireSession } = require('./lib/session');

exports.handler = async (event, context) => {
  let session;
  try {
    session = await requireSession(event);
  } catch (err) {
    return { statusCode: 302, headers: { Location: '/login.html' }, body: '' };
  }

  const clientId    = process.env.WHOOP_CLIENT_ID;
  const redirectUri = process.env.WHOOP_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'WHOOP_CLIENT_ID or WHOOP_REDIRECT_URI env var not set.' }),
    };
  }

  const state = crypto.randomBytes(16).toString('hex');

  try {
    const { getStore, connectLambda } = require('@netlify/blobs');
    connectLambda(event);
    const store = getStore('vital-auth');
    await store.set(`oauth-state-${state}`, JSON.stringify({ userId: session.userId }), { ttl: 600 });
  } catch (err) {
    console.error('Blobs set failed:', err.message);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Could not initialise auth session.' }),
    };
  }

  const scopes = 'read:recovery read:sleep read:profile read:body_measurement offline';
  const authUrl = new URL('https://api.prod.whoop.com/oauth/oauth2/auth');
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', scopes);
  authUrl.searchParams.set('state', state);

  return {
    statusCode: 302,
    headers: { Location: authUrl.toString() },
    body: '',
  };
};
