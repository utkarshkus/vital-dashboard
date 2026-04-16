// netlify/functions/lib/get-valid-token.js
// Shared helper — returns a valid WHOOP access token, refreshing if expired.

async function getValidToken(event) {
  const { getStore, connectLambda } = require('@netlify/blobs');
  connectLambda(event);
  const store = getStore('vital-auth');
  const raw   = await store.get('tokens').catch(() => null);

  if (!raw) throw new Error('NOT_AUTHENTICATED');

  const tokens = JSON.parse(raw);
  if (Date.now() < tokens.expiresAt) return tokens.accessToken;

  // Expired — use refresh token
  const clientId     = process.env.WHOOP_CLIENT_ID;
  const clientSecret = process.env.WHOOP_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('Missing WHOOP env vars');

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
    console.error('Token refresh failed:', await res.text());
    await store.delete('tokens').catch(() => {});
    throw new Error('REFRESH_FAILED');
  }

  const refreshed = await res.json();
  const updated = {
    accessToken:  refreshed.access_token,
    refreshToken: refreshed.refresh_token || tokens.refreshToken,
    expiresAt:    Date.now() + (refreshed.expires_in - 60) * 1000,
  };
  await store.set('tokens', JSON.stringify(updated));
  return updated.accessToken;
}

module.exports = { getValidToken };
