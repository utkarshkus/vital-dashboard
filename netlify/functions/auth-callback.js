// Receives ?code= from WHOOP, validates state, exchanges for tokens, stores per userId in Blobs.
const { requireSession } = require('./lib/session');

exports.handler = async (event, context) => {
  const { code, state, error } = event.queryStringParameters || {};

  if (error) {
    return redirect('/?auth=error&reason=whoop_denied');
  }
  if (!state || !code) {
    return redirect('/?auth=error&reason=missing_params');
  }

  let session;
  try {
    session = await requireSession(event);
  } catch (err) {
    return redirect('/login.html');
  }

  try {
    const { getStore, connectLambda } = require('@netlify/blobs');
    connectLambda(event);
    const store = getStore('vital-auth');

    const rawState = await store.get(`oauth-state-${state}`).catch(() => null);
    if (!rawState) {
      return redirect('/?auth=error&reason=state_mismatch');
    }
    const stateData = JSON.parse(rawState);
    if (stateData.userId !== session.userId) {
      return redirect('/?auth=error&reason=state_mismatch');
    }
    await store.delete(`oauth-state-${state}`).catch(() => {});

    const clientId     = process.env.WHOOP_CLIENT_ID;
    const clientSecret = process.env.WHOOP_CLIENT_SECRET;
    const redirectUri  = process.env.WHOOP_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      return redirect('/?auth=error&reason=server_config_error');
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
      console.error('Token exchange failed:', await res.text());
      return redirect('/?auth=error&reason=token_exchange_failed');
    }

    const tokens = await res.json();
    await store.set(`tokens-${session.userId}`, JSON.stringify({
      accessToken:  tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt:    Date.now() + (tokens.expires_in - 60) * 1000,
    }));

    return redirect('/?auth=success');

  } catch (err) {
    console.error('auth-callback error:', err.message);
    return redirect('/?auth=error&reason=server_error');
  }
};

function redirect(location) {
  return { statusCode: 302, headers: { Location: location }, body: '' };
}
