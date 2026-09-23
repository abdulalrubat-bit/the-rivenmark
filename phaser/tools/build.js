#!/usr/bin/env node
/* Bundles src/ into public/bundle.js with esbuild.
   esbuild ships an android-arm64 binary, so this is the same command on a
   desktop and under Termux on the phone. `--watch` rebuilds on save.
*/
import esbuild from 'esbuild';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes('--watch');

/* The core, into the directory the page actually serves.
 *
 * src/core/core.js is the game's rules and the file you edit; the page loads
 * public/core.js. Copied on every build, so the served copy can never be a
 * previous version of the rules -- the suites all build first.
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

/* NO HOLES IN THE CORE.
 *
 * Every function core.js calls must be declared in it or supplied by the
 * host. tools/check-core.js scans for the ones that are neither, and a build
 * with one stops here rather than shipping a ReferenceError to the one code
 * path nobody tried. It used to be the extractor's job, when the core was cut
 * out of the canvas build; there is no canvas build now.
 */
const core = path.join(here, '..', 'src', 'core', 'core.js');
const served = path.join(here, '..', 'public', 'core.js');

// Check the core, then copy it to where the page loads it. Returns whether it
// went through; a one-off build stops on a failure, a watch keeps watching.
function syncCore() {
  try {
    execFileSync(process.execPath, [path.join(here, 'check-core.js'), '--quiet'],
                 { stdio: 'inherit' });
  } catch {
    console.error('\ncheck-core.js failed — refusing to serve a core with a hole in it.\n');
    return false;
  }
  if (fs.existsSync(core)) {
    const from = fs.readFileSync(core);
    if (!fs.existsSync(served) || !fs.readFileSync(served).equals(from)) {
      fs.writeFileSync(served, from);
      console.log('core.js -> public/ (' + (from.length / 1024 | 0) + 'kB)');
    }
  }
  return true;
}
if (!syncCore() && !watch) process.exit(1);

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
  /* THE CORE IS NOT IN THE BUNDLE, so esbuild's watch never sees it change:
   * it is a classic script the page loads beside bundle.js. It used to be
   * checked and copied once, when the watch started, and an edit to the rules
   * after that left the page serving the old ones with nothing to say so
   * (the analysis' R03). So the core and the two host files it is checked
   * against are watched too, and every save re-checks and re-copies it. */
  const hosts = ['host-stubs.js', 'host-real.js'].map(f => path.join(here, '..', 'public', f));
  let pending = null;
  for (const f of [core, ...hosts]) {
    if (!fs.existsSync(f)) continue;
    fs.watch(f, () => {
      clearTimeout(pending);
      pending = setTimeout(() => { if (syncCore()) console.log('core re-checked and served'); }, 120);
    });
  }
  console.log('watching src/ and the core — ctrl-c to stop');
} else {
  await esbuild.build(opts);
}
