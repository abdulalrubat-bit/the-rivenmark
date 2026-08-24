#!/usr/bin/env node
/* Copies the generated debug page into the Android assets folder.
   The APK must never carry a stale build, so this runs the debug build first
   and copies the result, rather than trusting whatever is sitting there.
   Run: node android/sync-assets.js   */
const fs = require('fs'), path = require('path'), cp = require('child_process');
const root = path.join(__dirname, '..');

cp.execFileSync(process.execPath, [path.join(root, 'tools', 'build-debug.js')],
                { stdio: 'inherit' });

const src = path.join(root, 'debug.html');
const dstDir = path.join(__dirname, 'app', 'src', 'main', 'assets');
fs.mkdirSync(dstDir, { recursive: true });
const dst = path.join(dstDir, 'index.html');
fs.copyFileSync(src, dst);
const kb = n => (n / 1024).toFixed(1) + 'kB';
console.log('assets/index.html <- debug.html  (' + kb(fs.statSync(dst).size) + ')');
