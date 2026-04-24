// User management — password hashing (PBKDF2-SHA256) and Blobs-backed user store.
const crypto = require('crypto');

const PBKDF2_ITERS = 100000;
const KEY_LEN = 32;

async function hashPassword(password, salt) {
  if (!salt) salt = crypto.randomBytes(16).toString('hex');
  const hash = await new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, PBKDF2_ITERS, KEY_LEN, 'sha256', (err, key) => {
      if (err) reject(err); else resolve(key.toString('hex'));
    });
  });
  return { hash, salt };
}

async function verifyPassword(password, storedHash, salt) {
  const { hash } = await hashPassword(password, salt);
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(storedHash, 'hex'));
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

module.exports = { hashPassword, verifyPassword, getUsers, saveUsers };
