// api/applications.js
// The backend API for job applications. On Vercel this file becomes the URL /api/applications.
// You must be logged in, and you only ever see and change YOUR OWN applications.
//
//   Method   URL                          Action                    CRUD
//   GET      /api/applications            list my applications      Read
//   POST     /api/applications            create a new one          Create
//   PUT      /api/applications?id=abc     update one                Update
//   DELETE   /api/applications?id=abc     delete one                Delete

const crypto = require('crypto');
const db = require('../lib/db');
const { send, readBody } = require('../lib/http');
const { getUserId } = require('../lib/session');
const { validateApplication } = require('../lib/validate');

module.exports = async function handler(req, res) {
  try {
    // ---------- Who is asking? ----------
    const userId = getUserId(req);
    if (!userId) return send(res, 401, { errors: ['Please log in.'] }); // 401 = Unauthorized
    const key = `applications:${userId}`; // each user has their own list
    const id = req.query && req.query.id;

    // ---------- READ ----------
    if (req.method === 'GET') {
      const list = await db.list(key);
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt)); // newest first
      return send(res, 200, { applications: list, storage: db.storageMode() });
    }

    // ---------- CREATE ----------
    if (req.method === 'POST') {
      const body = readBody(req);
      if (body === null) return send(res, 400, { errors: ['Request body is not valid JSON.'] });
      const check = validateApplication(body);
      if (!check.ok) return send(res, 400, { errors: check.errors });

      const now = new Date().toISOString();
      const application = { id: crypto.randomUUID(), ...check.value, createdAt: now, updatedAt: now };
      await db.set(key, application.id, application);
      return send(res, 201, { application }); // 201 = Created
    }

    // ---------- UPDATE ----------
    if (req.method === 'PUT') {
      if (!id) return send(res, 400, { errors: ['Missing id in the URL.'] });
      const existing = await db.get(key, id);
      if (!existing) return send(res, 404, { errors: ['Application not found.'] });

      const body = readBody(req);
      if (body === null) return send(res, 400, { errors: ['Request body is not valid JSON.'] });
      const check = validateApplication({ ...existing, ...body }); // keep old values for fields not sent
      if (!check.ok) return send(res, 400, { errors: check.errors });

      const updated = { ...existing, ...check.value, updatedAt: new Date().toISOString() };
      await db.set(key, id, updated);
      return send(res, 200, { application: updated });
    }

    // ---------- DELETE ----------
    if (req.method === 'DELETE') {
      if (!id) return send(res, 400, { errors: ['Missing id in the URL.'] });
      const deleted = await db.remove(key, id);
      if (!deleted) return send(res, 404, { errors: ['Application not found.'] });
      return send(res, 200, { deleted: id });
    }

    res.setHeader('Allow', 'GET, POST, PUT, DELETE');
    return send(res, 405, { errors: ['Method not allowed.'] });
  } catch (error) {
    console.error(error);
    return send(res, 500, { errors: ['Something went wrong on the server. Please try again.'] });
  }
};
