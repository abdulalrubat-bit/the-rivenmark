#!/usr/bin/env node
/* Run the canvas build's suites.
 *
 *   node tools/run-suites.js            # all of them
 *   node tools/run-suites.js eco gait   # only these
 *
 * DESKTOP ONLY: every suite drives the page through Playwright, which does not
 * run under Termux. The game itself does; its tests do not, and that is the
 * one seam in this project between what the phone can do and what it cannot.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(here, 'suites');

const all = fs.readdirSync(DIR).filter(f => f.endsWith('.js'))
              .map(f => f.replace(/\.js$/, '')).sort();
const want = process.argv.slice(2).filter(a => !a.startsWith('-'));
const run = want.length ? want : all;

const unknown = run.filter(s => !all.includes(s));
if (unknown.length) {
  console.error('no such suite: ' + unknown.join(', ') + '\nhave: ' + all.join(' '));
  process.exit(1);
}

/* THE DEBUG BUILD IS GENERATED, SO REGENERATE IT.
 *
 * combat2 and dbgtest load debug.html, which build-debug.js writes from
 * index.html. Nothing was rebuilding it, so it drifted -- FIFTY-ONE commits
 * behind, discovered when the automatic blade was deleted from index.html and
 * those two suites carried on passing because their copy still had it. Two
 * suites had been testing a build from weeks earlier and reporting green.
 *
 * A stale generated artefact that a test reads is worse than no test: it says
 * the thing works when what works is a copy of the thing from before the
 * change. So it is rebuilt here, every run, before anything reads it. It
 * takes about a tenth of a second.
 */
try {
  execFileSync(process.execPath, [path.join(here, 'build-debug.js')], { stdio: 'ignore' });
} catch (e) {
  console.error('could not rebuild debug.html — combat2 and dbgtest would be ' +
                'testing a stale build, so stopping here');
  process.exit(1);
}

/* Where the suites find Playwright. They live up here, outside any package,
 * so a bare require('playwright') only resolved on a machine that happened to
 * have it installed globally. It is a devDependency of phaser/ now, and this
 * points the suites at it -- ahead of anything already on NODE_PATH. */
const SUITE_ENV = { ...process.env,
  NODE_PATH: [path.join(here, '..', 'phaser', 'node_modules'), process.env.NODE_PATH]
    .filter(Boolean).join(path.delimiter) };

let bad = 0, totalPass = 0, totalFail = 0;
for (const s of run) {
  let out = '';
  try {
    out = execFileSync(process.execPath, [path.join(DIR, s + '.js')],
                       { encoding: 'utf8', timeout: 420000, stdio: ['ignore', 'pipe', 'pipe'],
                         env: SUITE_ENV });
  } catch (e) {
    out = (e.stdout || '') + (e.stderr || '');
  }
  // Two suite styles grew up here: "N passed, M failed" and "PASS n / FAIL m".
  let p = 0, f = 0, seen = false;
  const a = out.match(/(\d+) passed, (\d+) failed/g);
  if (a) { const m = a[a.length - 1].match(/(\d+) passed, (\d+) failed/);
           p = +m[1]; f = +m[2]; seen = true; }
  else {
    const pm = out.match(/^PASS (\d+)/m), fm = out.match(/^FAIL (\d+)/m);
    if (pm) { p = +pm[1]; f = fm ? +fm[1] : 0; seen = true; }
  }
  totalPass += p; totalFail += f;
  // A suite that produced no summary at all is a FAILURE, not a blank line.
  // The shell script this replaces printed "NO SUMMARY" and carried on with
  // exit 0, so a suite that crashed on startup looked like a quiet day.
  if (!seen) { bad++; console.log(s.padEnd(10) + ' NO SUMMARY — the suite did not report'); }
  else {
    if (f) bad++;
    console.log(s.padEnd(10) + ' ' + p + ' passed, ' + f + ' failed');
  }
  for (const line of out.split('\n').filter(l => /^\s+x /.test(l)).slice(0, 4)) {
    console.log('  ' + line.trim());
  }
}
console.log('\n' + run.length + ' suites, ' + totalPass + ' passed, ' + totalFail + ' failed' +
            (bad ? ' — ' + bad + ' suite(s) not clean' : ''));
process.exit(bad ? 1 : 0);
