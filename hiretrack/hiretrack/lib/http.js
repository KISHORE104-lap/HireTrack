// lib/http.js
// Small helpers shared by every API file.

// Send a JSON reply with a status code
function send(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

// Send the browser to another page
function redirect(res, location) {
  res.statusCode = 302;
  res.setHeader('Location', location);
  res.end();
}

// The request body as an object. Vercel usually parses JSON for us (req.body);
// this also handles a raw string. Returns null if the JSON is invalid.
function readBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return null;
    }
  }
  return req.body;
}

module.exports = { send, redirect, readBody };
