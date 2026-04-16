// netlify/functions/auth-start.js
// Step 1 of OAuth flow: generates a cryptographic state, stores it in Blobs,
// then redirects the browser to WHOOP's authorization page.
// Called when user clicks "Connect WHOOP" in the dashboard.

const crypto = require('crypto');

exports.handler = async (event) => {
  const clientId    = process.env.WHOOP_CLIENT_ID;
  const redirectUri = process.env.WHOOP_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'WHOOP_CLIENT_ID or WHOOP_REDIRECT_URI env var not set.' }),
    };
  }

  // Generate a cryptographically secure state (32 hex chars = 128 bits)
  const state = crypto.randomBytes(16).toString('hex');

  try {
    const { getStore } = require('@netlify/blobs');
    const store = getStore('vital-auth');
    // Store state with 10-minute TTL (WHOOP auth must complete within that window)
    await store.set('oauth-state', state, { ttl: 600 });
  } catch (err) {
    console.error('Failed to store OAuth state:', err.message);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Could not initialise auth session.' }),
    };
  }

  const scopes = [
    'read:recovery',
    'read:sleep',
    'read:profile',
    'read:body_measurement',
  ].join(' ');

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
