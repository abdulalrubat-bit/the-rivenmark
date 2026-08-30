#!/usr/bin/env node
/* A static server for public/, with no dependencies.

   Termux cannot open a file:// page in Chrome with the permissions a game
   needs, and a WebGL context over file:// is refused outright on some
   builds. Serving over localhost sidesteps both: run this, then open
   http://localhost:8080 in the phone's browser.
*/
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// public/ by default; ROOT overrides it so a suite can serve a DEPLOYED copy
// instead. What a player gets is what deploy.js chose to copy, and that list
// is worth testing against rather than assuming.
const ROOT = process.env.ROOT || path.join(here, '..', 'public');
const PORT = +(process.env.PORT || 8080);

const TYPES = { '.html':'text/html', '.js':'text/javascript', '.map':'application/json',
                '.json':'application/json', '.png':'image/png', '.css':'text/css' };

http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  let file = path.join(ROOT, url === '/' ? 'index.html' : url);
  // Never serve outside public/, however the path is written.
  if (!path.resolve(file).startsWith(path.resolve(ROOT))) {
    res.writeHead(403); return res.end('no');
  }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(buf);
  });
}).listen(PORT, () => console.log('http://localhost:' + PORT));
