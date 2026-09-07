#!/usr/bin/env node
/* Bundles src/ into public/bundle.js with esbuild.
   esbuild ships an android-arm64 binary, so this is the same command on a
   desktop and under Termux on the phone. `--watch` rebuilds on save.
*/
import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes('--watch');

/* The extracted core, into the directory the page actually serves.
 *
 * extract-core.js writes src/core/core.js; index.html loads public/core.js.
 * Nothing joined the two, so it was a hand copy -- and a hand copy that is
 * forgotten leaves the game running the PREVIOUS core with no sign of it.
 * That is the same hazard the suites had with a stale bundle, and it is worse
 * here: a stale bundle is stale presentation, a stale core is stale rules.
 * Copied on every build, and the suites all build first.
 */
/* A BACKTICK INSIDE THE CSS.
 *
 * hud.js keeps its whole stylesheet in one template literal, so a backtick in
 * a CSS comment -- written round an identifier, the way prose does -- closes
 * the string and the file stops parsing somewhere far below. It has happened
 * three times now, and every time the esbuild error points at a word in the
 * middle of a sentence, which reads as anything but the real cause.
 *
 * Checked here rather than left to be rediscovered: the message says what to
 * do, and it costs one regex per build.
 */
const cssBlock = /const\s+CSS\s*=\s*`([\s\S]*?)\n`;/;
for (const f of ['hud.js']) {
  const src = path.join(here, '..', 'src', f);
  if (!fs.existsSync(src)) continue;
  const text = fs.readFileSync(src, 'utf8');
  const m = text.match(cssBlock);
  if (!m) continue;
  const line = text.slice(0, m.index).split('\n').length +
               m[1].slice(0, m[1].indexOf('`')).split('\n').length - 1;
  if (m[1].includes('`')) {
    console.error('\n' + f + ':' + line +
      '  a backtick inside the CSS template literal closes it.\n' +
      '  Prose in these comments must not quote identifiers with backticks.\n');
    process.exit(1);
  }
}

const core = path.join(here, '..', 'src', 'core', 'core.js');
const served = path.join(here, '..', 'public', 'core.js');
if (fs.existsSync(core)) {
  const from = fs.readFileSync(core);
  if (!fs.existsSync(served) || !fs.readFileSync(served).equals(from)) {
    fs.writeFileSync(served, from);
    console.log('core.js -> public/ (' + (from.length / 1024 | 0) + 'kB)');
  }
}

const opts = {
  entryPoints: [path.join(here, '..', 'src', 'main.js')],
  outfile: path.join(here, '..', 'public', 'bundle.js'),
  bundle: true,
  format: 'iife',
  target: ['es2020'],           // what an Android WebView a few years old has
  sourcemap: true,
  logLevel: 'info',
  // Phaser ships both; without this esbuild picks the ESM build and the
  // bundle doubles.
  mainFields: ['module', 'main'],
  minify: !watch
};

if (watch) {
  const ctx = await esbuild.context(opts);
  await ctx.watch();
  console.log('watching src/ — ctrl-c to stop');
} else {
  await esbuild.build(opts);
}
