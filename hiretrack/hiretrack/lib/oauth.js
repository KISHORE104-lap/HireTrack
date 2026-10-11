// lib/oauth.js
// "Sign in with Google / GitHub / LinkedIn" using the OAuth 2.0 authorization-code flow.
//
//   1. Our server redirects the user to the provider's login page (with our client id).
//   2. The user approves; the provider redirects back to /auth/callback/<provider>?code=...
//   3. Our server swaps the code for an access token (using our client secret).
//   4. With the token we ask the provider for the user's name, email and photo.
//
// Each provider is switched on by adding its two keys in Vercel's Environment Variables.

const PROVIDERS = {
  google: {
    name: 'Google',
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scope: 'openid email profile',
    async profile(token) {
      const me = await getJson('https://openidconnect.googleapis.com/v1/userinfo', token);
      return { id: me.sub, name: me.name, email: me.email, avatar: me.picture };
    }
  },
  github: {
    name: 'GitHub',
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
    authorizeUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    scope: 'read:user user:email',
    async profile(token) {
      const me = await getJson('https://api.github.com/user', token);
      let email = me.email;
      if (!email) {
        // The email may be private: ask for the list and take the primary verified one
        const emails = await getJson('https://api.github.com/user/emails', token);
        const primary = Array.isArray(emails) && emails.find((e) => e.primary && e.verified);
        email = primary ? primary.email : '';
      }
      return { id: String(me.id), name: me.name || me.login, email, avatar: me.avatar_url };
    }
  },
  linkedin: {
    name: 'LinkedIn',
    clientId: process.env.LINKEDIN_CLIENT_ID,
    clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
    authorizeUrl: 'https://www.linkedin.com/oauth/v2/authorization',
    tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
    scope: 'openid profile email',
    async profile(token) {
      const me = await getJson('https://api.linkedin.com/v2/userinfo', token);
      return { id: me.sub, name: me.name, email: me.email, avatar: me.picture };
    }
  }
};

async function getJson(url, token) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'User-Agent': 'HireTrack' }
  });
  if (!response.ok) throw new Error(`Profile request failed (${response.status})`);
  return response.json();
}

function isEnabled(key) {
  const p = PROVIDERS[key];
  return Boolean(p && p.clientId && p.clientSecret);
}

// Which buttons the login page should switch on
function enabledProviders() {
  return Object.keys(PROVIDERS).map((key) => ({ key, name: PROVIDERS[key].name, enabled: isEnabled(key) }));
}

// The address the provider sends the user back to. Must match what you register with the provider.
function redirectUri(req, key) {
  const base = process.env.APP_URL ||
    `${(req.headers['x-forwarded-proto'] || 'http').split(',')[0]}://${req.headers['x-forwarded-host'] || req.headers.host}`;
  return `${base.replace(/\/$/, '')}/auth/callback/${key}`;
}

// Step 1: the provider's login URL
function authorizationUrl(req, key, state) {
  const p = PROVIDERS[key];
  const params = new URLSearchParams({
    client_id: p.clientId,
    redirect_uri: redirectUri(req, key),
    response_type: 'code',
    scope: p.scope,
    state
  });
  return `${p.authorizeUrl}?${params}`;
}

// Steps 3 and 4: code -> token -> profile
async function exchangeCodeForProfile(req, key, code) {
  const p = PROVIDERS[key];
  const response = await fetch(p.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri(req, key),
      client_id: p.clientId,
      client_secret: p.clientSecret
    })
  });
  const data = await response.json();
  if (!data.access_token) throw new Error(data.error_description || data.error || 'No access token returned');
  return p.profile(data.access_token);
}

module.exports = { PROVIDERS, isEnabled, enabledProviders, authorizationUrl, exchangeCodeForProfile, redirectUri };
