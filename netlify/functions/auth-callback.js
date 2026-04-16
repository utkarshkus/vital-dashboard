// netlify/functions/auth-callback.js
// Receives ?code= from WHOOP, validates state, exchanges for tokens, stores in Blobs.

exports.handler = async (event, context) => {
  const { code, state, error, error_description } = event.queryStringParameters || {};

  if (error) {
    return redirect(`/?auth=error&reason=${encodeURIComponent(error_description || error)}`);
  }
  if (!state || !code) {
    return redirect('/?auth=error&reason=missing_params');
  }

  try {
    const { getStore, connectLambda } = require('@netlify/blobs');
    connectLambda(event);
    const store = getStore({ name: 'vital-auth', consistency: 'strong' });

    const storedState = await store.get('oauth-state').catch(() => null);
    if (!storedState || storedState !== state) {
      return redirect('/?auth=error&reason=state_mismatch');
    }
    await store.delete('oauth-state').catch(() => {});

    const clientId     = process.env.WHOOP_CLIENT_ID;
    const clientSecret = process.env.WHOOP_CLIENT_SECRET;
    const redirectUri  = process.env.WHOOP_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      return redirect('/?auth=error&reason=missing_env_vars');
    }

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
    await store.set('tokens', JSON.stringify({
      accessToken:  tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt:    Date.now() + (tokens.expires_in - 60) * 1000,
    }));

    return redirect('/?auth=success');

  } catch (err) {
    console.error('auth-callback error:', err.message);
    return redirect('/?auth=error&reason=' + encodeURIComponent(err.message));
  }
};

function redirect(location) {
  return { statusCode: 302, headers: { Location: location }, body: '' };
}
