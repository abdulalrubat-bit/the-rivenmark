#!/usr/bin/env node
/* Builds debug.html from index.html + tools/debug-overlay.js.
   The debug build is generated, never hand-edited, so it cannot drift from
   the release page. Run: node tools/build-debug.js  */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const dbg = fs.readFileSync(path.join(__dirname, 'debug-overlay.js'), 'utf8');

const marker = '</body>';
if (src.indexOf(marker) < 0) { console.error('no </body> in index.html'); process.exit(1); }

// Stamped with what it was built from, not when. A clock in a generated file
// means every rebuild is a one-line diff against a build nobody changed, and
// the reviewer has to check that is all it was. The hash says the same thing
// the timestamp was meant to -- which source this page carries -- and says it
// in a way that does not move unless the source does.
const sha = t => crypto.createHash('sha256').update(t).digest('hex').slice(0, 12);
const stamp = 'index.html ' + sha(src) + ' + overlay ' + sha(dbg);
let out = src.replace('<title>The Rivenmark</title>',
                      '<title>The Rivenmark — debug</title>');
out = out.replace(marker,
  '<script>\n/* generated from ' + stamp + ' by tools/build-debug.js — do not edit */\n' +
  dbg + '\n</script>\n' + marker);

fs.writeFileSync(path.join(root, 'debug.html'), out);
const kb = n => (n / 1024).toFixed(1) + 'kB';
console.log('debug.html written  (' + kb(src.length) + ' + ' + kb(dbg.length) +
            ' overlay = ' + kb(out.length) + ')');
