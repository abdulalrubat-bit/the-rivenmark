#!/usr/bin/env node
/* Does the delve scene actually draw the core's world?
 *
 * Screenshots are how this was found to work; assertions are how it stays
 * working. The one that matters most is the gait: bodies advance their walk
 * cycle by DISTANCE TRAVELLED rather than on a clock, which is a rule of the
 * simulation, and Phaser's animation system cannot express it. If that check
 * ever goes, the bodies are being animated by something other than the game.
 *
 * DESKTOP ONLY (Playwright). Run: npm run smoke:delve
 */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pass = [], fail = [];
const ck = (n, ok, note) => (ok ? pass : fail).push((ok ? '' : 'x ') + n + (note ? '  [' + note + ']' : ''));

(async () => {
  const PORT = process.env.PORT || '8211';
  const srv = spawn(process.execPath, [path.join(__dirname, 'serve.js')],
                    { env: { ...process.env, PORT }, stdio: 'ignore' });
  await sleep(800);
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

  // A scene that never finishes create() is a hang with nothing in the log --
  // which is exactly what an unterminated pool loop looked like -- so booting
  // is timed rather than assumed.
  const t0 = Date.now();
  await p.goto('http://localhost:' + PORT + '/');
  let booted = false;
  for (let i = 0; i < 40 && !booted; i++) {
    await sleep(250);
    booted = await p.evaluate(() => {
      const g = window.__game;
      return !!(g && g.scene.getScene('delve') && g.scene.getScene('delve').scene.isActive());
    }).catch(() => false);
  }
  ck('the delve boots', booted, ((Date.now() - t0) / 1000).toFixed(1) + 's');
  if (!booted) { report(); await b.close(); srv.kill(); return; }

  await sleep(2500);
  const R = await p.evaluate(() => {
    const sc = window.__game.scene.getScene('delve');
    return {
      renderer: window.__game.renderer.type === 2 ? 'WebGL' : 'Canvas',
      walls: walls.length, props: props.length, bodies: enemies.length,
      wallGfx: !!sc.wallGfx, propImgs: sc.propImgs ? sc.propImgs.length : 0,
      pool: sc.pool.length,
      quota: LEVEL.quota, level: LEVEL.name,
      heroAt: [Math.round(sc.hero.x), Math.round(sc.hero.y)],
      playerAt: [Math.round(player.x), Math.round(player.y)]
    };
  });

  ck('on the GPU renderer', R.renderer === 'WebGL', R.renderer);
  ck('the core generated a world', R.walls > 10 && R.props > 50 && R.bodies > 20,
     R.walls + ' walls, ' + R.props + ' props, ' + R.bodies + ' bodies in ' + R.level);
  ck('the statics went down once', R.wallGfx && R.propImgs > 50,
     R.propImgs + ' scenery images and one wall graphic');
  ck('a sprite exists for every body', R.pool >= R.bodies,
     R.pool + ' sprites for ' + R.bodies + ' bodies');
  ck('the hero sprite tracks the hero',
     Math.abs(R.heroAt[0] - R.playerAt[0]) < 2 && Math.abs(R.heroAt[1] - R.playerAt[1]) < 2,
     R.heroAt.join(',') + ' against ' + R.playerAt.join(','));

  // The gait. Walk one body a long way by hand and watch the frame change with
  // the distance -- then hold it still and watch it stop. A clock-driven
  // animation would keep cycling while standing.
  const gait = await p.evaluate(async () => {
    const sc = window.__game.scene.getScene('delve');
    const e = enemies.find(b => b.hp > 0 && b.kind === 'thrall');
    if (!e) return { none: true };
    e.awake = true;
    const seen = new Set();
    for (let i = 0; i < 60; i++) {
      const x0 = e.x, y0 = e.y;
      e.x += 12;                       // a stride's worth of ground per step
      advanceGait(e, x0, y0, 1 / 60);
      seen.add(sc.bodyFrame(e));
    }
    const moving = [...seen];
    // Now stand still: pace decays and the frame should settle on the rest pose.
    for (let i = 0; i < 120; i++) advanceGait(e, e.x, e.y, 1 / 60);
    return { moving, still: sc.bodyFrame(e), pace: +e.pace.toFixed(3) };
  });
  ck('a walking body cycles its gait', !gait.none && gait.moving.length >= 4,
     gait.none ? 'no thrall found' : gait.moving.length + ' distinct frames over 720 units');
  ck('and a standing one does not', !gait.none && /-rest$/.test(gait.still),
     gait.none ? '' : 'settled on ' + gait.still + ' at pace ' + gait.pace);

  const perf = await p.evaluate(() => {
    const s = window.__game.scene.getScene('delve').log.stats();
    return s ? { fps: s.fps, p50: s.p50, worst: s.worst, over: s.overPct } : null;
  });
  ck('and it holds a frame', perf && perf.p50 < 34,
     perf ? perf.fps + 'fps, median ' + perf.p50 + 'ms, worst ' + perf.worst +
            'ms (software GL here — a phone GPU is the real test)' : 'no samples');

  ck('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  await p.screenshot({ path: path.join(__dirname, '..', 'delve.png') });
  report();
  await b.close(); srv.kill();
  process.exit(fail.length ? 1 : 0);

  function report() {
    console.log('\nPASS ' + pass.length + '\n  ' + pass.join('\n  '));
    console.log('\nFAIL ' + fail.length + (fail.length ? '\n  ' + fail.join('\n  ') : ''));
  }
})();
