// lib/db.js
// The "database layer". Every other file talks to the data ONLY through
// these five functions, so we could swap the database without touching anything else.
//
// Two storage modes:
//   1. Redis database (Upstash, free on Vercel)  -> data is saved permanently
//   2. Memory (a JavaScript object)              -> used when no database is connected;
//                                                   data disappears when the server restarts

// Vercel adds these environment variables automatically when you connect Upstash Redis.
const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const HASH_KEY = 'applications'; // all applications live in one Redis "hash" (like a dictionary)

const useRedis = Boolean(REDIS_URL && REDIS_TOKEN);

// ---------- Memory mode ----------
// An object used like a dictionary: { "id1": {...}, "id2": {...} }
const memoryStore = {};

// ---------- Redis mode ----------
// Upstash lets us send Redis commands over HTTPS as a JSON array, e.g. ["HGETALL", "applications"]
async function redis(command) {
  const response = await fetch(REDIS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(command)
  });
  const data = await response.json();
  if (data.error) {
    throw new Error('Database error: ' + data.error);
  }
  return data.result;
}

// ---------- The five functions the API uses ----------

// Read every application. Returns an array of objects.
async function getAll() {
  if (!useRedis) {
    return Object.values(memoryStore);
  }
  // HGETALL returns a flat list: [id1, json1, id2, json2, ...]
  const flat = (await redis(['HGETALL', HASH_KEY])) || [];
  const list = [];
  for (let i = 0; i < flat.length; i += 2) {
    list.push(JSON.parse(flat[i + 1]));
  }
  return list;
}

// Read one application by id. Returns the object or null.
async function getById(id) {
  if (!useRedis) {
    return memoryStore[id] || null;
  }
  const json = await redis(['HGET', HASH_KEY, id]);
  return json ? JSON.parse(json) : null;
}

// Save (create or replace) one application.
async function save(application) {
  if (!useRedis) {
    memoryStore[application.id] = application;
    return application;
  }
  await redis(['HSET', HASH_KEY, application.id, JSON.stringify(application)]);
  return application;
}

// Delete one application. Returns true if something was deleted.
async function remove(id) {
  if (!useRedis) {
    const existed = id in memoryStore;
    delete memoryStore[id];
    return existed;
  }
  const deletedCount = await redis(['HDEL', HASH_KEY, id]);
  return deletedCount === 1;
}

// Tells the frontend which storage is in use.
function storageMode() {
  return useRedis ? 'redis' : 'memory';
}

module.exports = { getAll, getById, save, remove, storageMode };
