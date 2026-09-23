#!/usr/bin/env node
/* How a blow feels: the shake, the flash, and the red at the edges.
 *
 * The core has always said when a blow lands -- cam.shake, a body's
 * hitFlash, the hero's hitFlash -- and the canvas build drew all three. The
 * Phaser port read none of them: its camera followed the hero on its own and
 * never shook, a struck body was tinted white (which, multiplied, is no change
 * at all), and taking damage put nothing on the glass. Measured here off
 * what is actually drawn, each against a control, so a check cannot pass on a
 * frame where nothing was asked of it.
 */
const { chromium } = require('playwright');
const buildOnce = require('./build-once.cjs');
const { spawn } = require('child_process');
const path = require('path');
const { PNG } = require('pngjs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pass = [], fail = [];
const ck = (n, ok, note) => (ok ? pass : fail).push((ok ? '' : 'x ') + n + (note ? '  [' + note + ']' : ''));

(async () => {
  buildOnce();
  const PORT = process.env.PORT || '8294';
  const srv = spawn(process.execPath, [path.join(__dirname, 'serve.js')],
                    { env: { ...process.env, PORT }, stdio: 'ignore' });
  await sleep(800);
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const shot = async clip => PNG.sync.read(await p.screenshot({ clip }));
  const mean = (png, ch) => { let s = 0, n = 0;
    for (let i = 0; i < png.data.length; i += 4) { s += ch === 'lum'
      ? png.data[i] * 0.3 + png.data[i + 1] * 0.59 + png.data[i + 2] * 0.11
      : png.data[i + ch]; n++; }
    return s / n; };
  // The body's highlights, not the box's average: a sprite is a few hundred
  // pixels in a box of floor, and the floor does not flash.
  const p90 = png => { const l = [];
    for (let i = 0; i < png.data.length; i += 4)
      l.push(png.data[i] * 0.3 + png.data[i + 1] * 0.59 + png.data[i + 2] * 0.11);
    l.sort((a, b) => a - b); return l[Math.floor(l.length * 0.9)]; };

  try {
    await p.goto('http://localhost:' + PORT + '/?nogate&nogov');
    await p.waitForFunction(() => state === 'play' && window.__game, null, { timeout: 30000 });
    await sleep(600);
    // Nothing to interfere: every body asleep, and the hero untouchable except
    // for the one blow this suite lands on purpose -- otherwise whatever wakes
    // keeps re-striking him and every measurement below is of that instead.
    await p.evaluate(() => { for (const e of enemies) { e.awake = false; }
      player.hp = player.maxHp = 1e9; player.invuln = 1e9; });

    /* ---- the camera stands where the core's does ------------------------ */
    const at = await p.evaluate(() => { const v = __game.scene.getScene('delve').cameras.main.worldView;
      return { dx: v.x - cam.x, dy: v.y - cam.y, hx: player.x - v.x, hy: player.y - v.y,
               w: v.width, h: v.height }; });
    ck('the camera stands where the core’s camera does',
       Math.abs(at.dx) < 2 && Math.abs(at.dy) < 2, 'off by ' + at.dx.toFixed(1) + ',' + at.dy.toFixed(1));
    ck('with the hero in view', at.hx > 0 && at.hx < at.w && at.hy > 0 && at.hy < at.h);

    /* ---- the shake ------------------------------------------------------- */
    const spread = await p.evaluate(async shake => {
      const c = __game.scene.getScene('delve').cameras.main;
      const xs = [];
      for (let i = 0; i < 12; i++) {
        cam.shake = shake;                         // held, not decaying, for the sample
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        xs.push(c.worldView.x - cam.x);
      }
      cam.shake = 0;
      return Math.max(...xs) - Math.min(...xs);
    }, 12);
    const still = await p.evaluate(async () => {
      const c = __game.scene.getScene('delve').cameras.main; const xs = [];
      for (let i = 0; i < 12; i++) { cam.shake = 0;
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        xs.push(c.worldView.x - cam.x); }
      return Math.max(...xs) - Math.min(...xs);
    });
    ck('a shake moves the view', spread > 3, spread.toFixed(1) + ' units of jitter at shake 12');
    ck('and nothing moves it when there is none', still < 0.5, still.toFixed(2) + ' units');
    const blow = await p.evaluate(() => { cam.shake = 0; player.invuln = 0;
      hurtPlayerBy(50); const s = cam.shake;
      player.invuln = 1e9; return s; });
    ck('and taking a blow is what starts one', blow > 3, 'shake ' + blow.toFixed(1));

    /* ---- a struck body flashes ------------------------------------------- */
    // A body of our own, asleep beside the hero, once the shake has settled.
    await sleep(900);
    const target = await p.evaluate(() => {
      cam.shake = 0; player.hitFlash = 0;
      const e = newBody('thrall', player.x + 70, player.y, 0);
      e.awake = false; e.hitFlash = 0; enemies.push(e); window.__struck = e;
      const v = __game.scene.getScene('delve').cameras.main.worldView;
      return { x: e.x - v.x, y: e.y - v.y };
    });
    // Where it is NOW, each time: a body is nudged by its neighbours between
    // frames, and a crop taken where it was a moment ago is a crop of floor.
    const around = async () => {
      const t = await p.evaluate(() => { const v = __game.scene.getScene('delve').cameras.main.worldView;
        __struck.x = player.x + 70; __struck.y = player.y;      // held in place
        return { x: __struck.x - v.x, y: __struck.y - v.y }; });
      await sleep(120);
      return { x: t.x - 30, y: t.y - 40, width: 60, height: 64 };
    };
    await sleep(300);
    const dull = p90(await shot(await around()));
    await p.evaluate(() => { __struck.hitFlash = 99; });
    const lit = p90(await shot(await around()));
    await p.evaluate(() => { __struck.hitFlash = 0; });
    ck('a struck body flashes', lit > dull + 30,
       'brightest tenth ' + dull.toFixed(0) + ' -> ' + lit.toFixed(0));

    /* ---- the red at the edges -------------------------------------------- */
    await sleep(500);
    const edge = { x: 0, y: 300, width: 24, height: 200 };
    const calm = await shot(edge);
    await p.evaluate(() => { player.hitFlash = 99; });
    await sleep(200);
    const hurt = await shot(edge);
    await p.evaluate(() => { player.hitFlash = 0; });
    const redness = png => mean(png, 0) - (mean(png, 1) + mean(png, 2)) / 2;
    ck('taking damage reddens the edges of the glass', redness(hurt) > redness(calm) + 10,
       'red over green/blue ' + redness(calm).toFixed(1) + ' -> ' + redness(hurt).toFixed(1));
    await sleep(500);
    const after = await p.evaluate(() => __game.scene.getScene('delve').air.hurt.visible);
    ck('and it clears once the flash is spent', after === false);

    ck('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  } catch (e) {
    ck('the suite got all the way through', false, e.message.split('\n')[0]);
  }
  console.log('\nPASS ' + pass.length + '\n  ' + pass.join('\n  '));
  console.log('\nFAIL ' + fail.length + (fail.length ? '\n  ' + fail.join('\n  ') : ''));
  await b.close(); srv.kill();
  process.exit(fail.length ? 1 : 0);
})();
