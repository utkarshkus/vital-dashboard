// netlify/functions/auth-start.js
// Generates OAuth state, stores in Blobs, redirects to WHOOP auth page.
// Reached via /api/auth-start → /.netlify/functions/auth-start (netlify.toml)

const crypto = require('crypto');

exports.handler = async (event, context) => {
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
    const store = getStore({ name: 'vital-auth', consistency: 'strong' });
    await store.set('oauth-state', state, { ttl: 600 });
  } catch (err) {
    console.error('Blobs set failed:', err.message);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Could not initialise auth session.', detail: err.message }),
    };
  }

  const scopes = 'read:recovery read:sleep read:profile read:body_measurement';
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
