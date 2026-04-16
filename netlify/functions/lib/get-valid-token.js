// netlify/functions/lib/get-valid-token.js
// Shared helper: reads stored tokens from Blobs, refreshes if expired.
// Returns a valid access token or throws if auth is not set up.

async function getValidToken() {
  const { getStore } = require('@netlify/blobs');
  const store = getStore('vital-auth');

  const raw = await store.get('tokens').catch(() => null);
  if (!raw) {
    throw new Error('NOT_AUTHENTICATED');
  }

  const tokens = JSON.parse(raw);
  // Token still valid — return it
  if (Date.now() < tokens.expiresAt) {
    return tokens.accessToken;
  }

  // Token expired — use refresh token to get a new one
  const clientId     = process.env.WHOOP_CLIENT_ID;
  const clientSecret = process.env.WHOOP_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('WHOOP_CLIENT_ID / WHOOP_CLIENT_SECRET env vars not set');
  }

  const res = await fetch('https://api.prod.whoop.com/oauth/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token: tokens.refreshToken,
      client_id:     clientId,
      client_secret: clientSecret,
    }).toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('Token refresh failed:', err);
    // Refresh token is invalid/revoked — wipe stored tokens so UI shows reconnect prompt
    await store.delete('tokens').catch(() => {});
    throw new Error('REFRESH_FAILED');
  }

  const refreshed = await res.json();
  const updated = {
    accessToken:  refreshed.access_token,
    refreshToken: refreshed.refresh_token || tokens.refreshToken, // WHOOP may not rotate refresh token
    expiresAt:    Date.now() + (refreshed.expires_in - 60) * 1000,
  };

  await store.set('tokens', JSON.stringify(updated));
  return updated.accessToken;
}

module.exports = { getValidToken };
