// api/auth.js  ->  everything about logging in and out.
//
//   GET  /api/auth?action=providers        which social logins are switched on
//   GET  /api/auth?action=me               the logged-in user (401 if not logged in)
//   POST /api/auth?action=signup           { name, email, password }  -> creates account, logs in
//   POST /api/auth?action=login            { email, password }        -> logs in
//   POST /api/auth?action=demo                                        -> logs in to a demo account with sample data
//   POST /api/auth?action=logout                                      -> logs out
//   GET  /auth/start/<provider>            -> redirects to Google / GitHub / LinkedIn
//   GET  /auth/callback/<provider>?code=   -> provider sends the user back here
// (the two /auth/... URLs are mapped to this file in vercel.json)

const crypto = require('crypto');
const { send, redirect, readBody } = require('../lib/http');
const session = require('../lib/session');
const users = require('../lib/users');
const oauth = require('../lib/oauth');
const { seedForUser } = require('../lib/samples');

const DEMO_EMAIL = 'demo@hiretrack.app';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STATE_COOKIE = 'ht_oauth_state';

module.exports = async function handler(req, res) {
  const action = (req.query && req.query.action) || '';
  const provider = (req.query && req.query.provider) || '';

  try {
    // ---------- Which login buttons to show ----------
    if (action === 'providers' && req.method === 'GET') {
      return send(res, 200, { providers: oauth.enabledProviders() });
    }

    // ---------- Who am I? ----------
    if (action === 'me' && req.method === 'GET') {
      const userId = session.getUserId(req);
      const user = userId ? await users.findById(userId) : null;
      if (!user) return send(res, 401, { errors: ['Not logged in.'] });
      return send(res, 200, { user: users.publicUser(user) });
    }

    // ---------- Sign up with email ----------
    if (action === 'signup' && req.method === 'POST') {
      const body = readBody(req);
      if (body === null) return send(res, 400, { errors: ['Request body is not valid JSON.'] });
      const name = String(body.name || '').trim().slice(0, 60);
      const email = String(body.email || '').trim().toLowerCase().slice(0, 120);
      const password = String(body.password || '');

      const errors = [];
      if (!name) errors.push('Name is required.');
      if (!EMAIL_PATTERN.test(email)) errors.push('Enter a valid email address.');
      if (password.length < 8) errors.push('Password must be at least 8 characters.');
      if (errors.length) return send(res, 400, { errors });

      if (await users.findByEmail(email)) {
        return send(res, 409, { errors: ['An account with this email already exists. Log in instead.'] });
      }
      const user = await users.createWithPassword({ name, email, password });
      session.startSession(req, res, user.id);
      return send(res, 201, { user: users.publicUser(user) });
    }

    // ---------- Log in with email ----------
    if (action === 'login' && req.method === 'POST') {
      const body = readBody(req);
      if (body === null) return send(res, 400, { errors: ['Request body is not valid JSON.'] });
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');

      const user = email ? await users.findByEmail(email) : null;
      // Same message whether the email or the password is wrong, so attackers can't find which emails exist
      if (!user || !users.checkPassword(password, user.passwordHash)) {
        return send(res, 401, { errors: ['Wrong email or password.'] });
      }
      session.startSession(req, res, user.id);
      return send(res, 200, { user: users.publicUser(user) });
    }

    // ---------- One-click demo account (for interviews and visitors) ----------
    if (action === 'demo' && req.method === 'POST') {
      let user = await users.findByEmail(DEMO_EMAIL);
      if (!user) {
        user = await users.createWithPassword({
          name: 'Demo User',
          email: DEMO_EMAIL,
          password: crypto.randomBytes(24).toString('hex') // nobody knows it: demo login is only via this button
        });
      }
      await seedForUser(user.id); // sample applications, only the first time
      session.startSession(req, res, user.id);
      return send(res, 200, { user: users.publicUser(user) });
    }

    // ---------- Log out ----------
    if (action === 'logout' && req.method === 'POST') {
      session.endSession(req, res);
      return send(res, 200, { ok: true });
    }

    // ---------- Social login, step 1: go to the provider ----------
    if (action === 'start' && req.method === 'GET') {
      if (!oauth.isEnabled(provider)) {
        return redirect(res, `/login?error=${encodeURIComponent(provider + ' login is not set up yet.')}`);
      }
      // "state" is a random value we check on return, so nobody can forge a login (CSRF protection)
      const state = crypto.randomBytes(16).toString('hex');
      session.addCookie(res, session.cookie(req, STATE_COOKIE, state, 600));
      return redirect(res, oauth.authorizationUrl(req, provider, state));
    }

    // ---------- Social login, step 2: the provider sends the user back ----------
    if (action === 'callback' && req.method === 'GET') {
      const { code, state, error } = req.query;
      const expectedState = session.parseCookies(req)[STATE_COOKIE];
      session.addCookie(res, session.cookie(req, STATE_COOKIE, '', 0)); // one-time use

      if (error) return redirect(res, `/login?error=${encodeURIComponent('Login was cancelled.')}`);
      if (!oauth.isEnabled(provider) || !code || !state || state !== expectedState) {
        return redirect(res, `/login?error=${encodeURIComponent('Login could not be verified. Please try again.')}`);
      }

      const profile = await oauth.exchangeCodeForProfile(req, provider, code);
      const user = await users.findOrCreateFromProvider(provider, profile);
      session.startSession(req, res, user.id);
      return redirect(res, '/');
    }

    return send(res, 404, { errors: ['Unknown auth action.'] });
  } catch (err) {
    console.error(err);
    if (action === 'callback') {
      return redirect(res, `/login?error=${encodeURIComponent('Login failed. Please try again.')}`);
    }
    return send(res, 500, { errors: ['Something went wrong on the server. Please try again.'] });
  }
};
