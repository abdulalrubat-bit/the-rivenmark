#!/usr/bin/env node
/* Does the Phaser layer profiler find a cost, and put it in the right row?
 *
 * The same proof the canvas build's profiler gets, for the same reason: a
 * profiler that cannot find a cost is worse than none, because it clears every
 * layer of suspicion at once. A known cost is planted in one layer and the
 * profile has to name that layer and clear the rest.
 *
 * Planted as real per-frame WORK inside one layer's own draw, not as a sleep,
 * so ablating that layer genuinely removes it — which is exactly what the
 * profiler claims to measure.
 *
 * DESKTOP ONLY (Playwright). Run: npm run smoke:prof
 */
const { chromium } = require('playwright');
const buildOnce = require('./build-once.cjs');
const { spawn } = require('child_process');
const path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
/* Big enough to see, small enough NOT to saturate.
 *
 * At 24ms on a software rasteriser the frame lands so far past the refresh
 * that several layers all measure the vsync floor and read alike -- the
 * profile then names three of them and the check failed about one run in
 * three. That is the clamping working as documented, not a bug, but a fixture
 * has to be built above it. Ten leaves the baseline clear of the ceiling.
 */
const PLANT = 10;          // ms of main-thread burn to hide in one layer

const pass = [], fail = [];
const ck = (n, ok, note) => (ok ? pass : fail).push((ok ? '' : 'x ') + n + (note ? '  [' + note + ']' : ''));

(async () => {
  buildOnce();
  const PORT = process.env.PORT || '8219';
  const srv = spawn(process.execPath, [path.join(__dirname, 'serve.js')],
                    { env: { ...process.env, PORT }, stdio: 'ignore' });
  await sleep(800);
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  // ?nogov so the governor does not shed the mood mid-profile and change the
  // very thing being measured.
  await p.goto('http://localhost:' + PORT + '/?nogov&nogate');
  let booted = false;
  for (let i = 0; i < 40 && !booted; i++) {
    await sleep(250);
    booted = await p.evaluate(() => {
      const g = window.__game;
      return !!(g && g.scene.getScene('delve') && g.scene.getScene('delve').scene.isActive());
    }).catch(() => false);
  }
  ck('the delve boots', booted);
  if (!booted) { report(); await b.close(); srv.kill(); return; }
  await sleep(1500);

  const layers = await p.evaluate(() => {
    const sc = window.__game.scene.getScene('delve');
    return sc.prof.layers().map(([n, o]) => n + ':' + o.length);
  });
  ck('it finds the delve’s layers', layers.length >= 10, layers.join(' '));

  const planted = await p.evaluate(ms => {
    const sc = window.__game.scene.getScene('delve');
    // Burn on the main thread inside the scenery layer's own upkeep. Hiding
    // scenery must remove it, which is what makes this a fair test of ablation
    // rather than of a timer.
    sc.__burn = true;
    const real = sc.cullDressing.bind(sc);
    sc.cullDressing = function (...a) {
      if (sc.__burn && sc.propImgs && sc.propImgs.some(i => i.visible)) {
        const t0 = performance.now();
        while (performance.now() - t0 < ms) { /* burn */ }
      }
      return real(...a);
    };
    return true;
  }, PLANT);
  ck('a cost can be planted in one layer', planted, PLANT + 'ms tied to scenery being visible');
  await sleep(1500);

  /* Run it, and on a disagreement run it again before believing it.
   *
   * This box stalls for half a second at a time under load, and one stall
   * inside one phase is indistinguishable from that layer being expensive --
   * a profile is thirty samples per layer, so a single 500ms frame moves a
   * median that far. Sixty samples per phase halves the exposure, and the
   * second run is the same precaution verify-core took for the same reason:
   * one sample cannot tell a flake from a finding.
   */
  const runProfile = async () => {
    await p.evaluate(() => {
      const sc = window.__game.scene.getScene('delve');
      sc.prof.state = null;
      sc.prof.n = 60;
      sc.prof.start();
    });
    let ok = false;
    for (let i = 0; i < 180 && !ok; i++) {
      await sleep(1000);
      ok = await p.evaluate(() => {
        const st = window.__game.scene.getScene('delve').prof.state;
        return !!(st && st.done);
      });
    }
    if (!ok) return { none: true };
    const txt = await p.evaluate(() =>
      window.__game.scene.getScene('delve').prof.state.text || '');
    const rows = txt.split('\n')
      .map(l => l.match(/^ {2}(\S+)\s+>?=?\s*([-+])([\d.]+)ms(.*)$/))
      .filter(Boolean)
      .map(m => ({ name: m[1], saved: (m[2] === '-' ? 1 : -1) * parseFloat(m[3]),
                   note: m[4].trim() }));
    return { txt, rows };
  };

  let R = await runProfile(), tries = 1;
  if (!R.none && (!R.rows[0] || R.rows[0].name !== 'scenery')) { R = await runProfile(); tries = 2; }

  ck('the profile runs to completion', !R.none, R.none ? 'never finished' : '');
  if (R.none) { report(); await b.close(); srv.kill(); process.exit(1); }
  const text = R.txt, rows = R.rows;

  ck('and produces a report', /LAYER PROFILE \(phaser\)/.test(text),
     text.split('\n')[0] || 'empty');
  ck('with a row for every layer', rows.length >= 10, rows.length + ' rows');
  const top = rows[0];
  ck('and the planted cost is the top finding', !!top && top.name === 'scenery',
     (top ? top.name + ' at ' + top.saved.toFixed(1) + 'ms' : 'no rows') +
     (tries > 1 ? ' (2nd run)' : ''));
  // A CLAMPED row is not an independent finding: the report says in as many
  // words that the number is the refresh ceiling rather than the layer's cost,
  // and when several layers reach it they all read the same. Only an unclamped
  // row above the noise band is an accusation.
  const others = rows.slice(1)
    .filter(r => !/noise/.test(r.note) && !/refresh ceiling/.test(r.note));
  ck('and nothing else is accused', others.length === 0,
     others.length ? others.map(r => r.name + ' ' + r.saved.toFixed(1)).join(', ')
                   : 'all ' + (rows.length - 1) + ' others inside the noise band');

  // The scene has to be left as it was found: a profiler that leaves half the
  // delve hidden has broken the game to measure it.
  const restored = await p.evaluate(async () => {
    const sc = window.__game.scene.getScene('delve');
    sc.__burn = false;
    for (let i = 0; i < 20; i++) await new Promise(r => requestAnimationFrame(r));
    return { props: sc.propImgs.filter(i => i.visible).length,
             bodies: sc.pool.filter(s => s.visible).length,
             hero: sc.hero.visible, fx: sc.fx.below.visible };
  });
  ck('and the delve is put back the way it was found',
     restored.props > 20 && restored.bodies > 5 && restored.hero && restored.fx,
     JSON.stringify(restored));

  ck('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  report();
  await b.close(); srv.kill();
  process.exit(fail.length ? 1 : 0);

  function report() {
    console.log('\nPASS ' + pass.length + '\n  ' + pass.join('\n  '));
    console.log('\nFAIL ' + fail.length + (fail.length ? '\n  ' + fail.join('\n  ') : ''));
  }
})();
