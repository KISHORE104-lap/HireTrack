// lib/session.js
// Keeps a user logged in with a signed cookie (similar to a JWT).
//
// Cookie value = base64(payload) + "." + signature
// The signature is an HMAC-SHA256 of the payload made with a secret only the server knows,
// so nobody can change the user id inside the cookie without the signature breaking.
// The cookie is HttpOnly, so JavaScript in the page cannot read or steal it.

const crypto = require('crypto');

const COOKIE = 'ht_session';
const MAX_AGE = 7 * 24 * 60 * 60; // 7 days, in seconds

// Set SESSION_SECRET in Vercel. If missing, fall back to the database token (also secret),
// and only on a laptop to a fixed development value.
const SECRET = process.env.SESSION_SECRET || process.env.KV_REST_API_TOKEN ||
  process.env.UPSTASH_REDIS_REST_TOKEN || 'dev-only-secret-change-me';

const b64 = (text) => Buffer.from(text).toString('base64url');
const sign = (data) => crypto.createHmac('sha256', SECRET).update(data).digest('base64url');

// Read all cookies from the request into an object
function parseCookies(req) {
  const header = req.headers.cookie || '';
  const cookies = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index > -1) cookies[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return cookies;
}

// Is the site served over HTTPS? (Vercel: yes, laptop: no)
function isHttps(req) {
  return (req.headers['x-forwarded-proto'] || '').includes('https');
}

// Build a Set-Cookie header value
function cookie(req, name, value, maxAge) {
  return [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
    isHttps(req) ? 'Secure' : ''
  ].filter(Boolean).join('; ');
}

// Add a Set-Cookie header without removing ones already set
function addCookie(res, value) {
  const existing = res.getHeader('Set-Cookie');
  const list = existing ? [].concat(existing) : [];
  list.push(value);
  res.setHeader('Set-Cookie', list);
}

// Log the user in: put a signed cookie on the response
function startSession(req, res, userId) {
  const payload = b64(JSON.stringify({ uid: userId, exp: Date.now() + MAX_AGE * 1000 }));
  addCookie(res, cookie(req, COOKIE, `${payload}.${sign(payload)}`, MAX_AGE));
}

// Log out: replace the cookie with an expired one
function endSession(req, res) {
  addCookie(res, cookie(req, COOKIE, '', 0));
}

// Returns the logged-in user id, or null
function getUserId(req) {
  const token = parseCookies(req)[COOKIE];
  if (!token || !token.includes('.')) return null;
  const [payload, signature] = token.split('.');
  const expected = sign(payload);
  // timingSafeEqual compares in constant time, so attackers can't guess the signature byte by byte
  if (signature.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return data.exp > Date.now() ? data.uid : null;
  } catch {
    return null;
  }
}

module.exports = { startSession, endSession, getUserId, parseCookies, cookie, addCookie, isHttps };
