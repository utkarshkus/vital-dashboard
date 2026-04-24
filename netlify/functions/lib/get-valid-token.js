// Shared helper — returns a valid WHOOP access token for a given userId, refreshing if expired.

async function getValidToken(event, userId) {
  const { getStore, connectLambda } = require('@netlify/blobs');
  connectLambda(event);
  const store = getStore('vital-auth');
  const key   = `tokens-${userId}`;
  const raw   = await store.get(key).catch(() => null);

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
    const errText = await res.text();
    console.error('Token refresh failed:', errText);

    if (res.status === 400) {
      // WHOOP rotates refresh tokens — give the winning concurrent request time to persist
      for (let i = 0; i < 3; i++) {
        await new Promise(r => setTimeout(r, 300));
        const latest = await store.get(key).catch(() => null);
        if (latest) {
          const latestTokens = JSON.parse(latest);
          if (Date.now() < latestTokens.expiresAt) return latestTokens.accessToken;
        }
      }
      await store.delete(key).catch(() => {});
    } else if (res.status === 401) {
      await store.delete(key).catch(() => {});
    }

    throw new Error('REFRESH_FAILED');
  }

  const refreshed = await res.json();
  const updated = {
    accessToken:  refreshed.access_token,
    refreshToken: refreshed.refresh_token || tokens.refreshToken,
    expiresAt:    Date.now() + (refreshed.expires_in - 60) * 1000,
  };
  await store.set(key, JSON.stringify(updated));
  return updated.accessToken;
}

module.exports = { getValidToken };
