#!/usr/bin/env node
/* Puts the game into the Android assets folder.
 *
 * The APK carries the PHASER build. It used to carry the canvas one, which was
 * a single self-contained HTML file -- and on the phone that build ran at 20fps
 * with its effects already shed, while this one holds a locked 60 on the same
 * device. Measured, on an Adreno 840: 99% of frames over budget against 0%.
 *
 * That changes the shape of this script. A single file became thirteen, so it
 * runs the Phaser deploy -- which builds first, always -- rather than copying
 * anything by hand. Same discipline as before: the APK must never carry a
 * stale build, and nothing here trusts what is already sitting in assets.
 *
 * Run: node android/sync-assets.js
 */
const fs = require('fs'), path = require('path'), cp = require('child_process');
const root = path.join(__dirname, '..');
const dstDir = path.join(__dirname, 'app', 'src', 'main', 'assets');

// Anything left from a previous build is a file the APK would ship and nothing
// would notice -- including, until now, the whole canvas build's index.html.
fs.rmSync(dstDir, { recursive: true, force: true });
fs.mkdirSync(dstDir, { recursive: true });

cp.execFileSync(process.execPath,
  [path.join(root, 'phaser', 'tools', 'deploy.js'), dstDir], { stdio: 'inherit' });

const files = fs.readdirSync(dstDir).sort();
let total = 0;
for (const f of files) total += fs.statSync(path.join(dstDir, f)).size;
console.log('assets/ <- phaser build  (' + files.length + ' files, ' +
            (total / 1024 / 1024).toFixed(2) + 'MB)');
console.log('  ' + files.join(' '));
