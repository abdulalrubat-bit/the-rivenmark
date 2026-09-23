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
  'icon-192.png', 'icon-512.png', 'icon-mask-512.png',
  'cinzel-400.woff2', 'cinzel-600.woff2', 'OFL-Cinzel.txt', 'icons.png'
];

/* THE ATLAS, PACKED HERE RATHER THAN ASKED FOR.
 *
 * This used to check the atlas was present and, if it was not, tell whoever
 * ran the deploy to go and run `npm run atlas` themselves. That is the wrong
 * shape twice over. It cannot catch the case that matters -- an atlas that
 * exists and is OLDER than ../art, which passes the check and ships last
 * week's sprites -- and android/sync-assets.js had already worked this out
 * and packed one itself before calling in here, which is the same fix made
 * in one of the two places that needed it.
 *
 * A second and a half, and now every route to a device packs from ../art:
 * the web deploy, the APK, and anyone running this by hand.
 */
console.log('packing the atlas…');
execFileSync(process.execPath, [path.join(here, 'pack-atlas.js')], { stdio: 'inherit' });

console.log('building…');
execFileSync(process.execPath, [path.join(here, 'build.js')], { stdio: 'inherit' });

/* Still checked afterwards, as a post-condition rather than a prompt: the two
 * commands above write everything in SHIP that is generated, so anything
 * absent now is a tool that failed quietly, not a step somebody skipped.
 */
const missing = SHIP.filter(f => !fs.existsSync(path.join(PUB, f)));
if (missing.length) {
  console.error('missing from public/ after packing and building: ' + missing.join(', ') +
                '\nthat is a tool that failed without saying so — do not ship this.');
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
