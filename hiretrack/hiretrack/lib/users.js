// lib/users.js
// Creating and finding user accounts.
// Passwords are never stored. We store a "hash": scrypt(password + random salt).
// To log in we hash the typed password the same way and compare.

const crypto = require('crypto');
const db = require('./db');

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function checkPassword(password, stored) {
  if (!stored || !stored.startsWith('scrypt$')) return false;
  const [, salt, hash] = stored.split('$');
  const attempt = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(attempt, Buffer.from(hash, 'hex'));
}

// What we send to the browser: never the password hash
function publicUser(user) {
  if (!user) return null;
  const { passwordHash, ...safe } = user;
  return safe;
}

async function findById(id) {
  return db.get('users', id);
}

async function findByEmail(email) {
  const id = await db.getRaw('users:email', email.toLowerCase());
  return id ? findById(id) : null;
}

// Email + password signup
async function createWithPassword({ name, email, password }) {
  const user = {
    id: crypto.randomUUID(),
    name,
    email: email.toLowerCase(),
    avatar: '',
    providers: ['email'],
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString()
  };
  await db.set('users', user.id, user);
  await db.setRaw('users:email', user.email, user.id);
  return user;
}

// Google / GitHub / LinkedIn login: find the account linked to this provider,
// or an account with the same email, or create a new one.
async function findOrCreateFromProvider(provider, profile) {
  const key = `${provider}:${profile.id}`;
  const linkedId = await db.getRaw('users:oauth', key);
  if (linkedId) return findById(linkedId);

  let user = profile.email ? await findByEmail(profile.email) : null;
  if (user) {
    if (!user.providers.includes(provider)) user.providers.push(provider);
    if (!user.avatar && profile.avatar) user.avatar = profile.avatar;
  } else {
    user = {
      id: crypto.randomUUID(),
      name: profile.name || profile.email || 'New user',
      email: (profile.email || '').toLowerCase(),
      avatar: profile.avatar || '',
      providers: [provider],
      createdAt: new Date().toISOString()
    };
    if (user.email) await db.setRaw('users:email', user.email, user.id);
  }
  await db.set('users', user.id, user);
  await db.setRaw('users:oauth', key, user.id);
  return user;
}

module.exports = { findById, findByEmail, createWithPassword, findOrCreateFromProvider, checkPassword, publicUser };
