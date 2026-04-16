// netlify/functions/auth-callback.js
// Step 2 of OAuth flow: receives ?code= from WHOOP, exchanges for
// access_token + refresh_token, stores both in Netlify Blobs.
// WHOOP_CLIENT_ID and WHOOP_CLIENT_SECRET are Netlify env vars.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }

  const { code, state, error, error_description } = event.queryStringParameters || {};

  // WHOOP returned an error
  if (error) {
    return redirect(`/?auth=error&reason=${encodeURIComponent(error_description || error)}`);
  }

  // Validate state matches what we stored in Blobs during auth-start
  if (!state) {
    return redirect('/?auth=error&reason=missing_state');
  }

  try {
    const { getStore } = require('@netlify/blobs');
    const store = getStore('vital-auth');

    const storedState = await store.get('oauth-state').catch(() => null);
    if (!storedState || storedState !== state) {
      return redirect('/?auth=error&reason=state_mismatch');
    }
    // State is consumed — delete it immediately (one-time use)
    await store.delete('oauth-state').catch(() => {});

    const clientId     = process.env.WHOOP_CLIENT_ID;
    const clientSecret = process.env.WHOOP_CLIENT_SECRET;
    const redirectUri  = process.env.WHOOP_REDIRECT_URI; // e.g. https://your-site.netlify.app/.netlify/functions/auth-callback

    if (!clientId || !clientSecret || !redirectUri) {
      return redirect('/?auth=error&reason=missing_env_vars');
    }

    // Exchange code for tokens
    const res = await fetch('https://api.prod.whoop.com/oauth/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type:    'authorization_code',
        code,
        client_id:     clientId,
        client_secret: clientSecret,
        redirect_uri:  redirectUri,
      }).toString(),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Token exchange failed:', err);
      return redirect('/?auth=error&reason=token_exchange_failed');
    }

    const tokens = await res.json();
    // tokens: { access_token, refresh_token, expires_in, token_type }

    // Store tokens with expiry timestamp
    await store.set('tokens', JSON.stringify({
      accessToken:  tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt:    Date.now() + (tokens.expires_in - 60) * 1000, // 60s buffer
    }));

    return redirect('/?auth=success');

  } catch (err) {
    console.error('auth-callback error:', err.message);
    return redirect('/?auth=error&reason=' + encodeURIComponent(err.message));
  }
};

function redirect(location) {
  return {
    statusCode: 302,
    headers: { Location: location },
    body: '',
  };
}
