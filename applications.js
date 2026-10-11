// api/applications.js
// The backend API. On Vercel, this file automatically becomes the URL /api/applications.
//
// It follows REST: the HTTP METHOD says what to do with the data (CRUD).
//
//   Method   URL                          Action                    CRUD
//   GET      /api/applications            list all applications     Read
//   POST     /api/applications            create a new one          Create
//   PUT      /api/applications?id=abc     update one                Update
//   DELETE   /api/applications?id=abc     delete one                Delete

const crypto = require('crypto');
const db = require('../lib/db');
const { validateApplication } = require('../lib/validate');

// Small helper to send a JSON reply with a status code
function send(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

// The request body arrives as JSON. Vercel usually parses it for us (req.body);
// this also handles the case where it is still a string.
function readBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return null; // invalid JSON
    }
  }
  return req.body;
}

// Vercel calls this function for every request to /api/applications
module.exports = async function handler(req, res) {
  try {
    const id = req.query && req.query.id;

    // ---------- READ ----------
    if (req.method === 'GET') {
      const list = await db.getAll();
      // Newest first
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return send(res, 200, { applications: list, storage: db.storageMode() });
    }

    // ---------- CREATE ----------
    if (req.method === 'POST') {
      const body = readBody(req);
      if (body === null) return send(res, 400, { errors: ['Request body is not valid JSON.'] });

      const check = validateApplication(body);
      if (!check.ok) return send(res, 400, { errors: check.errors });

      const now = new Date().toISOString();
      const application = {
        id: crypto.randomUUID(), // unique id, e.g. "3f2a9c1e-5b7d-..."
        ...check.value,
        createdAt: now,
        updatedAt: now
      };
      await db.save(application);
      return send(res, 201, { application }); // 201 = "Created"
    }

    // ---------- UPDATE ----------
    if (req.method === 'PUT') {
      if (!id) return send(res, 400, { errors: ['Missing id in the URL.'] });

      const existing = await db.getById(id);
      if (!existing) return send(res, 404, { errors: ['Application not found.'] });

      const body = readBody(req);
      if (body === null) return send(res, 400, { errors: ['Request body is not valid JSON.'] });

      // Merge: keep old values for any field the browser did not send
      const check = validateApplication({ ...existing, ...body });
      if (!check.ok) return send(res, 400, { errors: check.errors });

      const updated = {
        ...existing,
        ...check.value,
        updatedAt: new Date().toISOString()
      };
      await db.save(updated);
      return send(res, 200, { application: updated });
    }

    // ---------- DELETE ----------
    if (req.method === 'DELETE') {
      if (!id) return send(res, 400, { errors: ['Missing id in the URL.'] });

      const deleted = await db.remove(id);
      if (!deleted) return send(res, 404, { errors: ['Application not found.'] });
      return send(res, 200, { deleted: id });
    }

    // Any other method (PATCH, etc.)
    res.setHeader('Allow', 'GET, POST, PUT, DELETE');
    return send(res, 405, { errors: ['Method not allowed.'] });
  } catch (error) {
    // Something unexpected (e.g. database down): log it for us, send a safe message to the user
    console.error(error);
    return send(res, 500, { errors: ['Something went wrong on the server. Please try again.'] });
  }
};
