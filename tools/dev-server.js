#!/usr/bin/env node
// DETAR — minimaler statischer Dev-Server (2026-09-04): dient NUR dazu, die
// Quelldateien lokal über http:// zu testen (Refresh statt Build-Schritt) —
// ES-Module/fetch (tuning.json, Fonts, Assets) laufen unter file:// nicht.
// Keine Redirects, keine Clean-URLs, kein Cache (immer frische Dateien).
// Ersetzt NICHT tools/build-lokal-prototyp.py (Einzeldatei-Offline-Export
// bleibt unverändert bestehen).
//
// Aufruf:  node tools/dev-server.js [port] [wurzelverzeichnis]
// Dann:    http://localhost:<port>/index.html?desktop&dev
//          (?desktop = ohne Kamera, Karte als Boden-Plane, s. js/main.js)
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", process.argv[3] || ".");
const PORT = Number(process.argv[2]) || 8743;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".mind": "application/octet-stream",
};

http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p === "/") p = "/index.html";
  const full = path.normalize(path.join(ROOT, p));
  if (!full.startsWith(ROOT)) { res.writeHead(403); return res.end("forbidden"); }
  fs.readFile(full, (err, data) => {
    if (err) { res.writeHead(404); return res.end("not found: " + p); }
    const ext = path.extname(full).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log(`detar-dev: http://localhost:${PORT}/index.html?desktop&dev  (root: ${ROOT})`);
});
