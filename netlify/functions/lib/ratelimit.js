// IP-based sliding-window rate limiter backed by Netlify Blobs.
// Usage:
//   const limiter = await rateLimit(event, 'login');
//   if (limiter.limited) return { statusCode: 429, ... };
//   // ... attempt ...
//   if (failed) await limiter.increment();
//   else         await limiter.reset();

const WINDOW_SEC  = 15 * 60; // 15-minute window
const MAX_ATTEMPTS = 10;

async function rateLimit(event, action) {
  const { getStore, connectLambda } = require('@netlify/blobs');
  connectLambda(event);
  const store = getStore('vital-ratelimit');

  // x-nf-client-connection-ip is set by Netlify's CDN and cannot be spoofed by clients.
  // x-forwarded-for first entry is client-controlled and must not be used for security decisions.
  const ip  = event.headers?.['x-nf-client-connection-ip']
            || event.headers?.['client-ip']
            || 'unknown';
  const key = `${action}:${ip}`;

  const raw    = await store.get(key).catch(() => null);
  const record = raw ? JSON.parse(raw) : { count: 0, windowStart: Date.now() };
  const hadRecord = !!raw;

  // Reset window if it has expired
  if (Date.now() > record.windowStart + WINDOW_SEC * 1000) {
    record.count       = 0;
    record.windowStart = Date.now();
  }

  const limited    = record.count >= MAX_ATTEMPTS;
  const retryAfter = limited
    ? Math.ceil((record.windowStart + WINDOW_SEC * 1000 - Date.now()) / 1000)
    : 0;

  return {
    limited,
    retryAfter,
    async increment() {
      record.count++;
      await store.set(key, JSON.stringify(record), { ttl: WINDOW_SEC }).catch(() => {});
    },
    async reset() {
      // Skip the delete round-trip on the happy path where no record exists.
      if (!hadRecord) return;
      await store.delete(key).catch(() => {});
    },
  };
}

module.exports = { rateLimit };
