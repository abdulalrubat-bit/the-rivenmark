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
  await p.goto('http://localhost:' + PORT + '/?nogov');
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

  const planted = await p.evaluate(() => {
    const sc = window.__game.scene.getScene('delve');
    // Burn on the main thread inside the scenery layer's own upkeep. Hiding
    // scenery must remove it, which is what makes this a fair test of ablation
    // rather than of a timer.
    sc.__burn = true;
    const real = sc.cullDressing.bind(sc);
    sc.cullDressing = function (...a) {
      if (sc.__burn && sc.propImgs && sc.propImgs.some(i => i.visible)) {
        const t0 = performance.now();
        while (performance.now() - t0 < 24) { /* burn */ }
      }
      return real(...a);
    };
    return true;
  });
  ck('a cost can be planted in one layer', planted, '24ms tied to scenery being visible');
  await sleep(1500);

  await p.evaluate(() => window.__game.scene.getScene('delve').prof.start());
  let done = false;
  for (let i = 0; i < 120 && !done; i++) {
    await sleep(1000);
    done = await p.evaluate(() => {
      const st = window.__game.scene.getScene('delve').prof.state;
      return !!(st && st.done);
    });
  }
  ck('the profile runs to completion', done, done ? '' : 'never finished');
  if (!done) { report(); await b.close(); srv.kill(); process.exit(1); }

  const text = await p.evaluate(() =>
    window.__game.scene.getScene('delve').prof.state.text || '');
  ck('and produces a report', /LAYER PROFILE \(phaser\)/.test(text),
     text.split('\n')[0] || 'empty');

  const rows = text.split('\n')
    .map(l => l.match(/^ {2}(\S+)\s+>?=?\s*([-+])([\d.]+)ms(.*)$/))
    .filter(Boolean)
    .map(m => ({ name: m[1], saved: (m[2] === '-' ? 1 : -1) * parseFloat(m[3]),
                 note: m[4].trim() }));
  ck('with a row for every layer', rows.length >= 10, rows.length + ' rows');
  const top = rows[0];
  ck('and the planted cost is the top finding', !!top && top.name === 'scenery',
     top ? top.name + ' at ' + top.saved.toFixed(1) + 'ms' : 'no rows');
  const others = rows.slice(1).filter(r => !/noise/.test(r.note));
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
