#!/usr/bin/env node
/* Does the layer profiler actually find a cost, and put it in the right row?
 *
 * This is the one tool in the project whose whole job is to be believed, and
 * it exists because the readout next to it cannot be: `draw / upd` times
 * canvas2d command RECORDING, and the rasterising happens off that clock, so
 * on a phone it reported draw 0.6ms while the device delivered 20fps.
 *
 * A profiler that cannot find a cost is worse than none, because it clears
 * every layer of suspicion at once. So a known cost is PLANTED in one layer
 * and the profile has to point at it -- and at nothing else.
 *
 * DESKTOP ONLY (Playwright). Run: node tools/smoke-profile.cjs
 */
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pass = [], fail = [];
const ck = (n, ok, note) => (ok ? pass : fail).push((ok ? '' : 'x ') + n + (note ? '  [' + note + ']' : ''));

const PLANT = 22;          // ms of main-thread burn to hide in one layer
const LAYER = 'drawProps'; // ...which the profile calls `scenery`

(async () => {
  // Rebuilt, not assumed: debug.html is generated from index.html plus the
  // overlay, and a suite that tests a stale generated file tests nothing.
  execFileSync(process.execPath, [path.join(__dirname, 'build-debug.js')],
               { stdio: ['ignore', 'ignore', 'pipe'] });

  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 },
    permissions: ['clipboard-read', 'clipboard-write'] });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('file://' + path.join(__dirname, '..', 'debug.html'));
  await sleep(4000);

  const up = await p.evaluate(() => {
    try {
      resetRun('isaac'); state = 'play'; showScreen(null);
      return { enemies: enemies.length, props: props.length };
    } catch (e) { return { err: e.message }; }
  });
  ck('the debug build boots into a delve', !up.err && up.enemies > 10,
     up.err || up.enemies + ' bodies, ' + up.props + ' props');
  if (up.err) { report(); await b.close(); process.exit(1); }
  await sleep(1200);

  const planted = await p.evaluate(([name, ms]) => {
    // Every draw function is a top-level declaration, so it is a property of
    // window and can be replaced from out here. That is the same mechanism the
    // profiler itself uses to ablate.
    const real = window[name];
    if (typeof real !== 'function') return false;
    window[name] = function (...a) {
      const t0 = performance.now();
      while (performance.now() - t0 < ms) { /* burn */ }
      return real.apply(this, a);
    };
    return true;
  }, [LAYER, PLANT]);
  ck('a cost can be planted in one layer', planted, PLANT + 'ms hidden in ' + LAYER);
  await sleep(1200);

  await p.evaluate(() => {
    [...document.querySelectorAll('#dbg button')]
      .find(x => x.textContent === 'profile').click();
  });
  let done = false;
  for (let i = 0; i < 120 && !done; i++) {
    await sleep(1000);
    done = await p.evaluate(() => [...document.querySelectorAll('#dbgStats .row')]
      .some(r => /profiling/.test(r.textContent) && /done/.test(r.textContent)));
  }
  ck('the profile runs to completion', done, done ? '' : 'never finished');
  if (!done) { report(); await b.close(); process.exit(1); }

  /* Over file:// the clipboard REJECTS -- navigator.clipboard exists in an
   * Android WebView but writeText fails, because file:// is not a secure
   * context. That is the device this whole tool exists to measure, so the
   * fallback is what actually gets tested here: the table has to appear in a
   * selectable box on screen. A guard on the API being present is not enough;
   * the promise fails and the button appears to do nothing at all. */
  await p.evaluate(() => {
    [...document.querySelectorAll('#dbg button')]
      .find(x => x.textContent === 'copy profile').click();
  });
  await sleep(400);
  const shown = await p.evaluate(() => {
    const ta = document.querySelector('#dbgProfOut textarea');
    return ta ? ta.value : '';
  });
  const clip = await p.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  const text = /LAYER PROFILE/.test(shown) ? shown : clip;
  ck('the findings come back off the device', /LAYER PROFILE/.test(text),
     /LAYER PROFILE/.test(shown) ? 'in a selectable box (clipboard unavailable here)'
       : /LAYER PROFILE/.test(clip) ? 'on the clipboard' : 'nowhere');

  const rows = text.split('\n')
    .map(l => l.match(/^ {2}(\S+)\s+>?=?\s*([-+])([\d.]+)ms(.*)$/))
    .filter(Boolean)
    .map(m => ({ name: m[1], saved: (m[2] === '-' ? 1 : -1) * parseFloat(m[3]),
                 note: m[4].trim() }));
  ck('it reports a row for every layer', rows.length >= 12, rows.length + ' rows');

  const top = rows[0];
  ck('and the planted cost is the top finding', !!top && top.name === 'scenery',
     top ? top.name + ' at ' + top.saved.toFixed(1) + 'ms' : 'no rows');
  // Clamped by vsync: no removed work makes a frame arrive before the refresh,
  // so a layer big enough to reach the ceiling alone reads LOW. It has to say
  // so, or the number gets believed as the layer's true cost.
  ck('and says the number is clamped rather than exact',
     !!top && /refresh ceiling/.test(top.note),
     top ? top.note || '(no note)' : '');
  // Everything else must be cleared. A profiler that indicts every layer is
  // as useless as one that indicts none.
  const others = rows.slice(1).filter(r => !/noise/.test(r.note));
  ck('and nothing else is accused', others.length === 0,
     others.length ? others.map(r => r.name + ' ' + r.saved.toFixed(1) + 'ms').join(', ')
                   : 'all ' + (rows.length - 1) + ' other layers inside the noise band');

  ck('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  report();
  await b.close();
  process.exit(fail.length ? 1 : 0);

  function report() {
    console.log('\nPASS ' + pass.length + '\n  ' + pass.join('\n  '));
    console.log('\nFAIL ' + fail.length + (fail.length ? '\n  ' + fail.join('\n  ') : ''));
  }
})();
