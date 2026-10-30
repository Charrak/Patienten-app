/**
 * RheaSport – Physio & fit · Lokaler Node-Server (optional)
 * Dient die statischen Dateien aus public/ und stellt die API bereit.
 * Im APK-Modus läuft alles lokal im Gerät (window.localApi).
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const DB_PATH = path.join(__dirname, 'data', 'db.json');

// MIME types
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.gz': 'application/gzip',
};

function loadDb() {
  try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); }
  catch (_) { return null; }
}
function saveDb(db) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 1));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  
  // API routes - redirect to local-api in browser
  if (url.pathname.startsWith('/api/')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ hinweis: 'Im Server-Modus: Bitte den Lokalmodus (?local=1) verwenden oder die APK nutzen.' }));
    return;
  }

  // Static files
  let filePath = path.join(PUBLIC, url.pathname === '/' ? 'index.html' : url.pathname);
  const ext = path.extname(filePath);
  
  fs.readFile(filePath, (err, data) => {
    if (err) {
      // Try index.html for SPA routing
      fs.readFile(path.join(PUBLIC, 'index.html'), (err2, data2) => {
        if (err2) {
          res.writeHead(404);
          res.end('Not found');
          return;
        }
        res.writeHead(200, { 'Content-Type': MIME['.html'] });
        res.end(data2);
      });
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`RheaSport Server läuft auf http://localhost:${PORT}`);
  console.log(`Statische Dateien: ${PUBLIC}`);
  console.log(`Hinweis: Für vollen Funktionsumfang den Lokalmodus nutzen (?local=1) oder die APK verwenden.`);
});
