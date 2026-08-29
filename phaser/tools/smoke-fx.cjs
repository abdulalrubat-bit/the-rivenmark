#!/usr/bin/env node
/* Does the fight read?
 *
 * Before this layer the crescent was invisible: the blade's swing is animation
 * and carries no damage, so a hero attacking looked like a hero standing
 * there. Nothing reported a hit either. What is checked here is that each pool
 * the core fills actually reaches the screen, and that the damage numbers come
 * out RANKED -- a scratch small and dim, a heavy landing large and bright --
 * because a flat number is most of the difference between a fight that reads
 * and one that does not.
 *
 * DESKTOP ONLY (Playwright). Run: npm run smoke:fx
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
  buildOnce();                       // the suite must test src/, not a stale bundle
  const PORT = process.env.PORT || '8221';
  const srv = spawn(process.execPath, [path.join(__dirname, 'serve.js')],
                    { env: { ...process.env, PORT }, stdio: 'ignore' });
  await sleep(800);
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('http://localhost:' + PORT + '/');
  await sleep(3200);

  // Start a fight in front of the hero, on ground that is actually clear.
  const fight = await p.evaluate(async () => {
    const spots = [];
    for (let k = 0; k < 64 && spots.length < 5; k++) {
      const a = k * Math.PI * 2 / 16, d = 40 + ((k / 16) | 0) * 22;
      const x = player.x + Math.cos(a) * d, y = player.y + Math.sin(a) * d;
      if (!pointInWalls(x, y, 16) && clearShot(player.x, player.y, x, y)) spots.push({ x, y });
    }
    if (spots.length < 3) return { noRoom: true };
    for (const s of spots) {
      const e = newBody('thrall', s.x, s.y, 0);
      e.awake = true; e.hp = e.maxHp = 400; enemies.push(e);
    }
    updateEnemies(0.001);
    player.fireTimer = 0;
    // A few seconds of the hero swinging on his own clock.
    const seen = { arcs: 0, parts: 0, rings: 0, floats: 0, kinds: new Set() };
    for (let i = 0; i < 200; i++) {
      update(1 / 60);
      seen.arcs = Math.max(seen.arcs, arcs.length);
      seen.parts = Math.max(seen.parts, particles.length);
      seen.rings = Math.max(seen.rings, rings.length);
      seen.floats = Math.max(seen.floats, floaters.length);
      for (const f of floaters) seen.kinds.add(f.kind);
    }
    return { arcs: seen.arcs, parts: seen.parts, rings: seen.rings,
             floats: seen.floats, kinds: [...seen.kinds] };
  });
  ck('the fixture had room for a fight', !fight.noRoom,
     fight.noRoom ? 'NO CLEAR GROUND — proves nothing' : '');
  ck('the hero throws crescents', fight.arcs > 0, fight.arcs + ' in flight at once');
  // Sparks only. An ordinary exchange does not ring: ring() belongs to the
  // abilities and to a body going down, not to a crescent landing, and
  // asserting otherwise made a correct fight look broken.
  ck('blows raise sparks', fight.parts > 0, fight.parts + ' particles');
  ck('and report themselves', fight.floats > 0,
     fight.floats + ' numbers, kinds: ' + (fight.kinds || []).join(', '));

  // Now the drawing. Freeze a frame with everything on it and read the scene.
  const drawn = await p.evaluate(() => {
    const sc = window.__game.scene.getScene('delve');
    // Put one of each on the board so the draw path for every pool is walked.
    ring(player.x, player.y, '#ffd870', 6, 60, 0.5);
    burst(player.x, player.y, '#ffd870', 12, 150);
    addHazard(player.x + 60, player.y, 70, 5, 4, '#ff7a2c');
    nulls.push({ x: player.x - 60, y: player.y, r: 90, life: 5, max: 7, pulse: 0 });
    plantTotem(player.x, player.y - 70);
    beginRupture(player.x + 40, player.y + 40);
    floatDmg(player.x, player.y - 30, 9, 'hit');
    floatDmg(player.x + 12, player.y - 30, 240, 'heavy');
    floatDmg(player.x - 12, player.y - 30, 3, 'soaked');
    sc.fx.draw(performance.now());
    const vis = sc.fx.texts.filter(t => t.visible);
    return {
      hazards: hazards.length, nulls: nulls.length, totems: totems.length,
      ruptures: ruptures.length, rings: rings.length, particles: particles.length,
      texts: vis.length,
      sizes: vis.map(t => Math.round(t.style.fontSize ? parseFloat(t.style.fontSize) : 0)),
      colours: vis.map(t => t.style.color)
    };
  });
  ck('every pool has a picture',
     drawn.hazards > 0 && drawn.nulls > 0 && drawn.totems > 0 && drawn.ruptures > 0,
     'hazard, pool, totem and rupture all on the board');
  ck('a ring is drawn when something makes one', drawn.rings > 0,
     drawn.rings + ' on the board — abilities and deaths ring, plain hits do not');
  ck('the numbers are drawn', drawn.texts >= 3, drawn.texts + ' visible');
  ck('and they are ranked, not uniform',
     new Set(drawn.sizes).size >= 3 && Math.max(...drawn.sizes) > Math.min(...drawn.sizes) * 1.6,
     'sizes ' + drawn.sizes.join('/') + '  colours ' + [...new Set(drawn.colours)].join(' '));

  /* The crescent, checked in PIXELS.
   *
   * Everything above this asserts that the core filled a pool and that a draw
   * call was made. Neither proves anything reached the screen, and looking at
   * a screenshot fooled me three times running: a crescent lives 0.10s and had
   * expired before the picture was taken, and then game.loop.stop() -- which
   * halts the RENDER step too -- meant nothing drawn afterwards was ever
   * presented. So the arc is parked with the loop running and the pixels are
   * counted.
   */
  const arc = await p.evaluate(() => {
    arcs.length = 0; particles.length = 0; rings.length = 0; floaters.length = 0;
    player.fireTimer = 1e9;                    // stop him swinging again
    fire();
    const a = arcs[0];
    if (!a) return { none: true };
    a.speed = 0; a.life = 1e9; a.maxLife = 1e9;   // hang it there to be looked at
    // And push it clear of the hero first. A crescent is born at the blade,
    // about 24 units out, so parked where it starts its gold lands on Isaac's
    // own shield emblem -- which is the same Sun-Gold, and swamps the delta.
    a.x += a.dx * 90; a.y += a.dy * 90;
    const c = window.__game.scene.getScene('delve').cameras.main;
    return { screen: [Math.round(a.x - c.scrollX), Math.round(a.y - c.scrollY)],
             magic: HEROES[player.hero].magic };
  });
  // Counted as a DIFFERENCE, with and without the arc, because an absolute
  // count proves nothing: Isaac's own shield emblem is the same Sun-Gold, and
  // the first version of this passed with 890 "crescent" pixels that were
  // entirely the hero. Disabling the crescent draw did not fail it. Only the
  // delta belongs to the arc.
  const countGold = async () => {
    const [sx, sy] = arc.screen;
    const png = PNG.sync.read(await p.screenshot({
      clip: { x: Math.max(0, sx - 80), y: Math.max(0, sy - 80), width: 160, height: 160 } }));
    let n = 0, best = null;
    for (let i = 0; i < png.data.length; i += 4) {
      const r = png.data[i], g = png.data[i + 1], b2 = png.data[i + 2];
      if (r > 150 && g > 110 && b2 < 130) { n++; if (!best || r > best[0]) best = [r, g, b2]; }
    }
    return { n, best };
  };
  let withArc = { n: 0 }, without = { n: 0 };
  if (!arc.none) {
    await sleep(600);
    withArc = await countGold();
    await p.evaluate(() => { arcs.length = 0; });
    await sleep(500);
    without = await countGold();
  }
  const delta = withArc.n - without.n;
  ck('the crescent reaches the screen', !arc.none && delta > 150,
     arc.none ? 'no arc thrown'
       : delta + ' pixels of Sun-Gold that are there only when the arc is (' +
         withArc.n + ' with, ' + without.n + ' without), brightest rgb(' +
         (withArc.best || []).join(',') + ') against ' + arc.magic);

  const perf = await p.evaluate(() => {
    const s = window.__game.scene.getScene('delve').log.stats();
    return s ? s.p50 : null;
  });
  ck('and it still holds a frame', perf !== null && perf < 34,
     perf + 'ms median (software GL here)');
  ck('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));

  await p.screenshot({ path: path.join(__dirname, '..', 'fight.png') });
  console.log('\nPASS ' + pass.length + '\n  ' + pass.join('\n  '));
  console.log('\nFAIL ' + fail.length + (fail.length ? '\n  ' + fail.join('\n  ') : ''));
  await b.close(); srv.kill();
  process.exit(fail.length ? 1 : 0);
})();
