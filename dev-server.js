// dev-server.js
// Runs the whole app on your own computer, the same way Vercel runs it online.
//   Start:  node dev-server.js
//   Open:   http://localhost:3000
//
// It does two jobs:
//   - URLs starting with /api/  -> run the matching file in the api/ folder
//   - every other URL           -> send the file from the public/ folder

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // ----- API routes -----
  if (url.pathname.startsWith('/api/')) {
    const name = url.pathname.slice(5).replace(/[^a-z0-9-]/gi, ''); // e.g. "applications"
    const file = path.join(__dirname, 'api', name + '.js');
    if (!fs.existsSync(file)) {
      res.statusCode = 404;
      return res.end(JSON.stringify({ errors: ['No such API route.'] }));
    }

    // Collect the request body, then hand over to the API function
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      req.query = Object.fromEntries(url.searchParams);
      req.body = raw || undefined;
      require(file)(req, res);
    });
    return;
  }

  // ----- Static files -----
  const requested = url.pathname === '/' ? '/index.html' : url.pathname;
  const filePath = path.join(PUBLIC_DIR, path.normalize(requested));
  if (!filePath.startsWith(PUBLIC_DIR) || !fs.existsSync(filePath)) {
    res.statusCode = 404;
    return res.end('Not found');
  }
  res.setHeader('Content-Type', TYPES[path.extname(filePath)] || 'application/octet-stream');
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, () => {
  console.log(`HireTrack running at http://localhost:${PORT}`);
});
