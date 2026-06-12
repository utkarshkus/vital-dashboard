// User management — password hashing (PBKDF2-SHA256) and Blobs-backed user store.
const crypto = require('crypto');

const PBKDF2_ITERS = 600000; // OWASP-recommended minimum for PBKDF2-SHA256
const LEGACY_ITERS = 100000; // hashes created before the iterations field existed
const KEY_LEN = 32;

async function hashPassword(password, salt, iterations = PBKDF2_ITERS) {
  if (!salt) salt = crypto.randomBytes(16).toString('hex');
  const hash = await new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, iterations, KEY_LEN, 'sha256', (err, key) => {
      if (err) reject(err); else resolve(key.toString('hex'));
    });
  });
  return { hash, salt, iterations };
}

async function verifyPassword(password, storedHash, salt, iterations = LEGACY_ITERS) {
  const { hash } = await hashPassword(password, salt, iterations);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(storedHash, 'hex'));
}

// True if the stored hash predates the current iteration count and should be
// regenerated next time the plaintext password is available.
function needsRehash(user) {
  return (user.iterations || LEGACY_ITERS) !== PBKDF2_ITERS;
}

async function getUsers(event) {
  const { getStore, connectLambda } = require('@netlify/blobs');
  connectLambda(event);
  const store = getStore('vital-users');
  const raw = await store.get('users').catch(() => null);
  return raw ? JSON.parse(raw) : {};
}

async function saveUsers(event, users) {
  const { getStore, connectLambda } = require('@netlify/blobs');
  connectLambda(event);
  const store = getStore('vital-users');
  await store.set('users', JSON.stringify(users));
}

// Looks up the session user and throws 403 if they are not an admin.
async function requireAdmin(event, session) {
  const users = await getUsers(event);
  const user = Object.values(users).find(u => u.userId === session.userId);
  if (!user || !user.isAdmin) {
    const err = new Error('NOT_ADMIN');
    err.statusCode = 403;
    throw err;
  }
}

module.exports = { hashPassword, verifyPassword, needsRehash, getUsers, saveUsers, requireAdmin, PBKDF2_ITERS };
