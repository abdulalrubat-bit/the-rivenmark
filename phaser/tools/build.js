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
