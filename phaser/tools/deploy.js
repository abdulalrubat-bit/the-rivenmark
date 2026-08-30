#!/usr/bin/env node
/* Copy a built delve into a directory something else serves.
 *
 *   node tools/deploy.js ../../abdulalrubat-bit.github.io/rivenmark
 *
 * Builds first, always. Every hard-won lesson in this folder is the same one:
 * an artefact that is copied by hand is an artefact that is one day stale, and
 * a stale deploy is the worst of them because it lands on a device you cannot
 * reach and gives no sign at all.
 *
 * Also stamps sw.js with a version derived from the CONTENT of what is being
 * shipped. A service-worker cache key bumped by hand is a cache key someone
 * forgets, and a forgotten one leaves an installed player on an old build for
 * ever -- their browser will keep serving the cached shell and never ask.
 */
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const PUB = path.join(here, '..', 'public');
const dest = process.argv[2];
if (!dest) {
  console.error('usage: node tools/deploy.js <directory>');
  process.exit(1);
}

// What a player needs, and nothing else. Named rather than globbed: public/
// also holds bundle.js.map (11MB), the core-test harness and the art
// manifest's working files, none of which belong on a public site.
const SHIP = [
  'index.html', 'app.webmanifest', 'sw.js',
  'host-stubs.js', 'host-real.js', 'core.js', 'bundle.js',
  'atlas.png', 'atlas.json', 'manifest.json',
  'icon-192.png', 'icon-512.png', 'icon-mask-512.png'
];

console.log('building…');
execFileSync(process.execPath, [path.join(here, 'build.js')], { stdio: 'inherit' });

const missing = SHIP.filter(f => !fs.existsSync(path.join(PUB, f)));
if (missing.length) {
  // Usually the atlas, which is generated from ../art and is gitignored.
  console.error('missing from public/: ' + missing.join(', ') +
                '\nrun `npm run atlas` (and `npm run core`) first.');
  process.exit(1);
}

// The version: a hash over everything that actually reaches the device, so it
// changes exactly when the build does and never when it does not.
const h = crypto.createHash('sha256');
for (const f of SHIP) {
  if (f === 'sw.js') continue;                 // it carries the hash; can't hash itself
  h.update(f).update(fs.readFileSync(path.join(PUB, f)));
}
const version = h.digest('hex').slice(0, 12);

fs.mkdirSync(dest, { recursive: true });
let bytes = 0;
for (const f of SHIP) {
  const to = path.join(dest, f);
  if (f === 'sw.js') {
    const src = fs.readFileSync(path.join(PUB, f), 'utf8');
    const out = src.replace(/^const VERSION = '.*';$/m, "const VERSION = '" + version + "';");
    if (out === src) {
      console.error('sw.js has no VERSION line to stamp — refusing to ship an ' +
                    'unversioned cache.');
      process.exit(1);
    }
    fs.writeFileSync(to, out);
    bytes += Buffer.byteLength(out);
    continue;
  }
  const buf = fs.readFileSync(path.join(PUB, f));
  fs.writeFileSync(to, buf);
  bytes += buf.length;
}

console.log('deployed ' + SHIP.length + ' files, ' + (bytes / 1024 / 1024).toFixed(2) +
            'MB, cache ' + version + '\n  -> ' + path.resolve(dest));
