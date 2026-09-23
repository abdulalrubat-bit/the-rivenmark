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
  // A malformed escape (a lone '%') made decodeURIComponent throw, and an
  // uncaught throw here takes the whole server down mid-suite.
  let url;
  try { url = decodeURIComponent(req.url.split('?')[0]); }
  catch (e) { res.writeHead(400); return res.end('bad request'); }
  let file = path.join(ROOT, url === '/' ? 'index.html' : url);
  // Never serve outside public/, however the path is written. Measured as a
  // RELATIVE path, not as a string prefix: "/x/public-old" starts with
  // "/x/public" too, so a prefix test let a sibling directory through.
  const rel = path.relative(path.resolve(ROOT), path.resolve(file));
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
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
