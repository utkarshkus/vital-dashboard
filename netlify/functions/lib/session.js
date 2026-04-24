// Session management — create, validate, and delete HTTP-only cookie sessions.
// Sessions stored in Netlify Blobs ('vital-sessions' store) with 24h TTL.
const crypto = require('crypto');

const SESSION_TTL_SEC = 24 * 60 * 60;

async function _store(event) {
  const { getStore, connectLambda } = require('@netlify/blobs');
  connectLambda(event);
  return getStore('vital-sessions');
}

async function createSession(event, userId) {
  const store = await _store(event);
  const token = crypto.randomBytes(32).toString('hex');
  await store.set(token, JSON.stringify({ userId }), { ttl: SESSION_TTL_SEC });
  return token;
}

async function getSession(event) {
  const cookie = event.headers?.cookie || '';
  const match = cookie.match(/vital_session=([a-f0-9]{64})/);
  if (!match) return null;
  const token = match[1];
  const store = await _store(event);
  const raw = await store.get(token).catch(() => null);
  if (!raw) return null;
  return { token, ...JSON.parse(raw) };
}

async function requireSession(event) {
  const session = await getSession(event);
  if (!session) {
    const err = new Error('NO_SESSION');
    err.statusCode = 401;
    throw err;
  }
  return session;
}

async function deleteSession(event, token) {
  const store = await _store(event);
  await store.delete(token).catch(() => {});
}

function sessionCookie(token, maxAge = SESSION_TTL_SEC) {
  return `vital_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
}

module.exports = { createSession, getSession, requireSession, deleteSession, sessionCookie };
