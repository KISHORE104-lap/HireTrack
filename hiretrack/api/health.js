// api/health.js  ->  URL: /api/health
// Shows the backend is running, which storage it uses, and which social logins are switched on.

const db = require('../lib/db');
const oauth = require('../lib/oauth');
const { send } = require('../lib/http');

module.exports = function handler(req, res) {
  send(res, 200, {
    status: 'ok',
    storage: db.storageMode(),
    socialLogin: Object.fromEntries(oauth.enabledProviders().map((p) => [p.key, p.enabled])),
    time: new Date().toISOString()
  });
};
