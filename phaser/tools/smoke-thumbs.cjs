#!/usr/bin/env node
/* Two thumbs, and the one that walks is never lost.
 *
 * Playtested on a phone: "the hero stops walking when I touch attack". Real
 * touches (CDP Input.dispatchTouchEvent, the way a phone delivers them, not
 * page-level pointer calls) on a phone-sized page:
 *
 *   - walk, then hold the Conduit: still walking, and striking
 *   - hold the Conduit first, then walk: the walking thumb owns the stick
 *   - hold the Conduit AND the heavy button, then walk: still walks. Phaser
 *     takes a pointer slot for every touch on the page, HUD included, and
 *     with two slots the third thumb got none -- the hero stood still
 *   - auto-strike: with nothing touched but the stick, the blade swings at
 *     a body in reach when it is on, and does not when it is off
 *
 * WHAT WOULD MAKE THIS VACUOUS. "Still walking" is read off the stick's owner
 * and its throw as well as off the ground covered, so a hero shoved along by
 * something else does not pass it; and auto-strike is checked OFF as well as
 * on, so a blade that swings for any reason does not pass it.
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
  const PORT = process.env.PORT || '8303';
  const srv = spawn(process.execPath, [path.join(__dirname, 'serve.js')],
                    { env: { ...process.env, PORT }, stdio: 'ignore' });
  await sleep(800);
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  const G = 'http://localhost:' + PORT + '/';

  const T = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  const pt = (id, x, y) => ({ x, y, id, radiusX: 8, radiusY: 8, force: 1 });
  const lift = () => T('touchEnd', []);
  const centre = sel => p.$eval(sel, e => { const r = e.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  const read = () => p.evaluate(() => ({ x: player.x, y: player.y, active: stick.active, mag: stick.mag,
    ox: stick.ox, swings: combatLog.filter(e => e.k === 'swing').length,
    auto: combatLog.filter(e => e.k === 'swing' && e.r === 'auto').length }));
  // A fresh delve, the horde asleep and harmless, the hero somewhere open.
  const delve = async () => {
    await p.evaluate(() => { attackCancel('test'); stickEnd(); });
    await p.evaluate(() => {
      for (const e of enemies) { e.awake = false; e.hp = 0; }
      enemies.length = 0;
      player.hp = player.maxHp = 1e9; player.invuln = 1e9;
      const c = openCells.find(o => !pointInWalls(o.x, o.y, 260)) || openCells[0];
      player.x = c.x; player.y = c.y;
    });
  };
  // Walk up: the left thumb goes down at (90, 620) and drags a full throw.
  const walkPoints = (others, i) => [pt(1, 90, 620 - Math.min(8, i) * 12), ...others];

  try {
    await p.goto(G);
    await p.evaluate(() => { localStorage.clear();
      localStorage.setItem('rivenmark.settings.v1', JSON.stringify({ tutorialSeen: true, autostrike: false })); });
    await p.goto(G);
    await p.waitForSelector('#screens.up #descend', { timeout: 30000 });
    await p.tap('#descend');
    await p.waitForFunction(() => state === 'play', null, { timeout: 15000 });
    await sleep(500);
    const con = await centre('#hud .conduit');
    const heavy = await centre('#hud .heavy');

    // ---- walk, then hold the Conduit --------------------------------------
    await delve();
    await T('touchStart', walkPoints([], 0));
    for (let i = 1; i <= 8; i++) { await T('touchMove', walkPoints([], i)); await sleep(16); }
    // Read before the Conduit goes down: a ready blade strikes on the press
    // itself, and a headless page steps the simulation too slowly for a
    // second beat to be sure of arriving.
    const a0 = await read();
    await T('touchStart', walkPoints([pt(2, con.x, con.y)], 8));
    for (let i = 0; i < 30; i++) { await T('touchMove', walkPoints([pt(2, con.x, con.y)], 8)); await sleep(30); }
    const a1 = await read();
    await lift(); await sleep(100);
    ck('walking, then holding the Conduit: still walking', a1.active && a1.mag > 0.8 && a0.y - a1.y > 8,
       'stick ' + a1.active + ' at ' + a1.mag.toFixed(2) + ', ' + Math.round(a0.y - a1.y) + 'px');
    ck('...and striking while it walks', a1.swings > a0.swings, (a1.swings - a0.swings) + ' swings');

    // ---- the Conduit first, then walk ---------------------------------------
    await delve();
    await T('touchStart', [pt(2, con.x, con.y)]); await sleep(120);
    const b0 = await read();
    await T('touchStart', [pt(2, con.x, con.y), pt(1, 90, 620)]);
    for (let i = 1; i <= 8; i++) { await T('touchMove', [pt(2, con.x, con.y), pt(1, 90, 620 - i * 12)]); await sleep(30); }
    await sleep(400);
    const b1 = await read();
    await lift(); await sleep(100);
    ck('the Conduit held first never takes the stick', !b0.active, 'stick ' + b0.active);
    ck('...and the thumb that lands next walks', b1.active && Math.round(b1.ox) === 90 && b1.mag > 0.8 &&
       b0.y - b1.y > 8, 'stick at x ' + Math.round(b1.ox) + ', ' + Math.round(b0.y - b1.y) + 'px');

    // ---- the Conduit and the heavy held, then walk: three thumbs -----------
    await delve();
    await T('touchStart', [pt(2, con.x, con.y)]); await sleep(60);
    await T('touchStart', [pt(2, con.x, con.y), pt(3, heavy.x, heavy.y)]); await sleep(60);
    const c0 = await read();
    await T('touchStart', [pt(2, con.x, con.y), pt(3, heavy.x, heavy.y), pt(1, 90, 620)]);
    for (let i = 1; i <= 8; i++) {
      await T('touchMove', [pt(2, con.x, con.y), pt(3, heavy.x, heavy.y), pt(1, 90, 620 - i * 12)]);
      await sleep(30);
    }
    await sleep(400);
    const c1 = await read();
    await lift(); await sleep(100);
    ck('with the Conduit and the heavy both held, a third thumb still walks', c1.active && c1.mag > 0.8,
       'stick ' + c1.active + ' at ' + c1.mag.toFixed(2) + ', ' + Math.round(c0.y - c1.y) + 'px');

    // ---- a stick owned by a finger Phaser has lost ---------------------------
    // The lift that never arrived: the stick belongs to a pointer that is not
    // down (here, one that does not exist). It used to hold the stick for the
    // rest of the delve, and every thumb after it was ignored.
    await delve();
    await p.evaluate(() => { stickStart(99, 90, 620); });
    await T('touchStart', [pt(1, 90, 620)]);
    for (let i = 1; i <= 8; i++) { await T('touchMove', [pt(1, 90, 620 - i * 12)]); await sleep(30); }
    await sleep(300);
    const g1 = await p.evaluate(() => ({ id: stick.id, mag: stick.mag,
      took: combatLog.some(e => e.k === 'stick' && e.r === 'end' && e.why === 'takeover') }));
    await lift(); await sleep(100);
    ck('a stick left by a lost finger is taken over by the next thumb', g1.id !== 99 && g1.mag > 0.8 && g1.took,
       JSON.stringify(g1));

    // ---- auto-strike: off, then on ------------------------------------------
    const standBy = () => p.evaluate(() => {
      const e = newBody('thrall', player.x + 60, player.y, 0);
      e.hp = e.maxHp = 1e9; e.awake = false; enemies.push(e);
    });
    await delve(); await standBy();
    const d0 = await read(); await sleep(1500); const d1 = await read();
    ck('auto-strike off: nothing touched, nothing swung', d1.swings === d0.swings, (d1.swings - d0.swings) + ' swings');
    await p.evaluate(() => { setAutoStrike(true); });
    await delve(); await standBy();
    const e0 = await read(); await sleep(1500); const e1 = await read();
    ck('auto-strike on: the blade swings by itself at a body in reach', e1.auto - e0.auto >= 1,
       (e1.auto - e0.auto) + ' auto swings');
    await delve();
    const f0 = await read(); await sleep(1000); const f1 = await read();
    ck('...and not at nothing', f1.swings === f0.swings, (f1.swings - f0.swings) + ' swings with nobody near');

    // The setting reaches it, and is kept.
    await p.evaluate(() => { setAutoStrike(false); });
    await p.click('#hud .hold button'); await sleep(250);
    await p.click('#toSettings'); await sleep(200);
    const shown = await p.$eval('#screens [data-set="autostrike"] .act', e => e.textContent);
    await p.click('#screens [data-set="autostrike"]'); await sleep(150);
    const after = await p.evaluate(() => ({ core: autoStrike,
      saved: JSON.parse(localStorage.getItem('rivenmark.settings.v1')).autostrike }));
    ck('the settings row turns it on, and it is kept', shown === 'off' && after.core === true && after.saved === true,
       shown + ' -> ' + JSON.stringify(after));

    ck('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  } catch (e) {
    ck('the suite got all the way through', false, e.message.split('\n')[0]);
  }
  console.log('\nPASS ' + pass.length + '\n  ' + pass.join('\n  '));
  console.log('\nFAIL ' + fail.length + (fail.length ? '\n  ' + fail.join('\n  ') : ''));
  await b.close(); srv.kill();
  process.exit(fail.length ? 1 : 0);
})();
