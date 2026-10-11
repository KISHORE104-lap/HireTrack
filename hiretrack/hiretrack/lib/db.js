// lib/db.js
// The "database layer". The rest of the backend only uses these functions,
// so the storage can change without touching anything else.
//
// Data is kept in Redis "hashes" (a hash is like a dictionary: field -> value):
//   users             userId          -> user JSON
//   users:email       email           -> userId
//   users:oauth       "google:12345"  -> userId
//   applications:<userId>  appId      -> application JSON   (each user has their own)
//
// Two storage modes:
//   1. Redis (Upstash, free on Vercel)  -> saved permanently
//   2. Memory (JavaScript objects)      -> used when no database is connected;
//                                          data disappears when the server restarts

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const useRedis = Boolean(REDIS_URL && REDIS_TOKEN);

// ---------- Memory mode ----------
// { "users": { id1: "...", id2: "..." }, "applications:abc": { ... } }
const memory = {};
const table = (key) => (memory[key] = memory[key] || {});

// ---------- Redis mode ----------
// Upstash accepts Redis commands over HTTPS as a JSON array, e.g. ["HGET", "users", "abc"]
async function redis(command) {
  const response = await fetch(REDIS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command)
  });
  const data = await response.json();
  if (data.error) throw new Error('Database error: ' + data.error);
  return data.result;
}

// ---------- Basic hash operations ----------

// All values of a hash, parsed from JSON -> array of objects
async function list(key) {
  if (!useRedis) return Object.values(table(key)).map((v) => JSON.parse(v));
  const flat = (await redis(['HGETALL', key])) || []; // [field1, value1, field2, value2, ...]
  const result = [];
  for (let i = 0; i < flat.length; i += 2) result.push(JSON.parse(flat[i + 1]));
  return result;
}

// One raw string value (or null)
async function getRaw(key, field) {
  if (!useRedis) return table(key)[field] ?? null;
  return redis(['HGET', key, field]);
}

// One value parsed from JSON (or null)
async function get(key, field) {
  const raw = await getRaw(key, field);
  return raw ? JSON.parse(raw) : null;
}

// Save a raw string value
async function setRaw(key, field, value) {
  if (!useRedis) {
    table(key)[field] = value;
    return;
  }
  await redis(['HSET', key, field, value]);
}

// Save an object as JSON
async function set(key, field, object) {
  await setRaw(key, field, JSON.stringify(object));
  return object;
}

// Delete one field. Returns true if it existed.
async function remove(key, field) {
  if (!useRedis) {
    const existed = field in table(key);
    delete table(key)[field];
    return existed;
  }
  return (await redis(['HDEL', key, field])) === 1;
}

function storageMode() {
  return useRedis ? 'redis' : 'memory';
}

module.exports = { list, get, getRaw, set, setRaw, remove, storageMode };
