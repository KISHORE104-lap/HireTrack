// api/health.js  ->  URL: /api/health
// A tiny endpoint to check the backend is running and which storage it uses.

const db = require('../lib/db');

module.exports = function handler(req, res) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({
    status: 'ok',
    storage: db.storageMode(),
    time: new Date().toISOString()
  }));
};
