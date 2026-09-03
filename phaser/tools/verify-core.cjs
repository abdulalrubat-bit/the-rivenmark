#!/usr/bin/env node
/* Runs the canvas build's own test suites against the EXTRACTED core.
 *
 * This is the only claim worth making about an extraction: not that it parses,
 * not that it looks complete, but that the assertions written against the
 * original still hold against it. Each suite is copied with its URL rewritten
 * to core-test.html and run unchanged, and the pass/fail counts are compared
 * against the same suite run against index.html in the same session -- so a
 * suite that is merely flaky shows as equal-and-flaky rather than as a
 * regression.
 *
 * Suites that drive the DOM menus are not in the list: there are no menus in
 * the extracted core yet, and asserting against absent UI would prove nothing.
 *
 * DESKTOP ONLY (Playwright). Run: npm run verify
 */
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const { spawn } = require('child_process');

const SUITES = (process.env.SUITES ||
  'horde roles packs terrain ramp lieuts bosses invader newkinds eco deceiver crescent ' +
  'extract stash gear vendor loadout prog hall layout combat2 combat3 zayd kit hub bag gait ' +
  'weight'
).split(/\s+/).filter(Boolean);

/* Which suites can meaningfully be compared.
 *
 * A suite that drives the DOM menus, or asserts about where something is
 * drawn, cannot pass against a core with no menus and no renderer -- and
 * excluding those by hand, one failure at a time, is indistinguishable from
 * excluding whatever happens to be failing. So it is decided by reading the
 * suite: if it reaches for the renderer or the page, it is reported as not
 * comparable and its result is not counted either way.
 *
 * Two suites in the list are worth naming, because both LOOK like simulation
 * and are not: horde asserts a forged coffer sprite stands in until the sheet
 * decodes, and deceiver measures where the False Dawn crystal lands against
 * the boss bar. Both are rendering, and both correctly fail here.
 */
const PRESENTATION = [
  /\bSPR\b/, /\bctx\b/, /\bdraw\s*\(/, /\bdrawHall\b/, /\bBOSS_BAR_H\b/,
  /\bSTANDING\b/, /\bview\./, /\.click\(/, /\$eval\(/,
  /document\./, /getComputedStyle/, /screenshot\(/, /\bHUD_H\b/,
  // The canvas build's DOM element map, named by its members rather than as a
  // bare `el.` -- eco.js calls a local body `el` and a broad pattern skipped a
  // suite that had been matching index.html assertion for assertion. A pattern
  // that excludes a passing suite is worse than no pattern at all.
  /\bel\.(gateBtn|overTitle|overSub|overStats|bagBadge|hud|clock|hpFill|hpText)\b/
];
function touchesPresentation(src) {
  return PRESENTATION.filter(re => re.test(src)).map(re => String(re));
}

// The suites live in the repo now. They used to live in a scratch directory
// under /tmp, which is one container restart from gone and certain to go when
// the session that wrote them ended -- an odd place for the only safety net a
// 14,000-line file has. SCRATCH still overrides, for running against a working
// copy of a suite without committing it.
const SCRATCH = process.env.SCRATCH ||
  path.join(__dirname, '..', '..', 'tools', 'suites');
const PORT = process.env.PORT || '8155';
const CORE_URL = 'http://localhost:' + PORT + '/core-test.html';

// A statement that throws while core.js is loading aborts the rest of the
// script, and every later failure is then a confusing knock-on ("cannot access
// SLOTS before initialization" when the real fault was LEVEL, three hundred
// statements earlier). Load the page once on its own first and report that
// directly.
const CANVAS_URL = 'file:///home/user/neon-extraction/index.html';

function run(file, page) {
  try {
    const out = execFileSync(process.execPath, [file], {
      encoding: 'utf8', timeout: 420000,
      env: { ...process.env, NODE_PATH: '/opt/node22/lib/node_modules',
             ...(page ? { RIVENMARK_PAGE: page } : {}) }
    });
    return parse(out);
  } catch (e) {
    return parse((e.stdout || '') + (e.stderr || ''));
  }
}
function parse(out) {
  let m = out.match(/(\d+) passed, (\d+) failed/);
  if (m) return { pass: +m[1], fail: +m[2] };
  const p = out.match(/^PASS (\d+)/m), f = out.match(/^FAIL (\d+)/m);
  if (p) return { pass: +p[1], fail: f ? +f[1] : 0 };
  return { pass: null, fail: null, out: out.slice(-400) };
}

const srv = spawn(process.execPath, [path.join(__dirname, 'serve.js')],
                  { env: { ...process.env, PORT }, stdio: 'ignore' });
process.on('exit', () => srv.kill());

(async () => {
  const { chromium } = require('playwright');
  await new Promise(r => setTimeout(r, 700));
  const b = await chromium.launch();
  const pg = await b.newPage();
  const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(CORE_URL);
  await new Promise(r => setTimeout(r, 500));
  const ready = await pg.evaluate(() => !!window.__coreReady);
  await b.close();
  if (!ready || errs.length) {
    console.error('core.js does not load cleanly:\n  ' +
                  (errs.join('\n  ') || '__coreReady never set'));
    srv.kill();
    process.exit(1);
  }
  console.log('core.js loads clean\n');
  main();
})();

function main() {

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-core-'));
let bad = 0;
console.log('suite         index.html      extracted core');
let skipped = 0;
for (const s of SUITES) {
  const src = path.join(SCRATCH, s + '.js');
  if (!fs.existsSync(src)) { console.log(s.padEnd(12) + '  (not found)'); continue; }
  const why = touchesPresentation(fs.readFileSync(src, 'utf8'));
  if (why.length) {
    skipped++;
    console.log(s.padEnd(12) + 'not comparable - asserts about the renderer or the page  ' +
                why.slice(0, 2).join(' '));
    continue;
  }
  // The SAME file, twice, pointed at a different page by the environment. It
  // used to be copied to a temp directory with the URL string-replaced, and
  // that broke silently the moment the suites stopped hard-coding an absolute
  // path: the replace stopped matching, both arms ran against index.html, and
  // six suites were reported as behaving differently when the only difference
  // was a rewrite that no longer happened.
  //
  // Run both, and on a difference run both again before believing it. This box
  // stalls for half a second at a time under load, and a suite with fixed
  // sleeps in it flakes on either side -- bosses has come back 23/24 against
  // index.html itself. One sample cannot tell a flake from a regression, and
  // reporting one as the other is worse than saying nothing.
  let orig = run(src), port = run(src, CORE_URL), tries = 1;
  const agree = () => orig.pass === port.pass && orig.fail === port.fail;
  while (!agree() && tries < 2) { orig = run(src); port = run(src, CORE_URL); tries++; }
  const same = agree();
  if (!same) bad++;
  console.log(s.padEnd(12) +
    String(orig.pass + '/' + (orig.pass + orig.fail)).padEnd(16) +
    String(port.pass + '/' + (port.pass + port.fail)).padEnd(14) +
    (same ? (tries > 1 ? 'same (2nd run)' : 'same') : '  <-- DIFFERS') +
    (port.out ? '  ' + port.out.replace(/\s+/g, ' ').slice(0, 120) : ''));
}
srv.kill();
console.log('\n' + skipped + ' suite(s) skipped: they assert about the renderer or the DOM,');
console.log('neither of which the extracted core has.');
console.log(bad ? bad + ' comparable suite(s) BEHAVE DIFFERENTLY against the extracted core'
                : 'every comparable suite behaves identically against the extracted core');
process.exit(bad ? 1 : 0);
}
