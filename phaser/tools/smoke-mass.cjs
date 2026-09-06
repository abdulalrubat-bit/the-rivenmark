/* THE CRUCIBLE-MASS, ON SCREEN.
 *
 * crucible.js proves the encounter works. This proves the Phaser build can
 * DRAW it, which is a separate question with its own way of going wrong: the
 * boss has no art of its own. It wears the gorger's frames at the gorger's
 * frame names, scaled by the ratio of the two bodies' radii and tinted, and
 * every part of that can fail silently -- a missing atlas frame leaves the
 * sprite wearing whatever it had, which for a fresh one is a thrall.
 */
const { chromium } = require('playwright');
const { spawn, execFileSync } = require('child_process');
const path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pass = [], fail = [];
const ck = (n, ok, note) => (ok ? pass : fail).push((ok ? '' : 'x ') + n + (note ? '  [' + note + ']' : ''));
const report = () => {
  console.log('\nPASS ' + pass.length + '\n  ' + pass.join('\n  '));
  console.log('\nFAIL ' + fail.length + (fail.length ? '\n  ' + fail.join('\n  ') : ''));
};

(async () => {
  execFileSync(process.execPath, [path.join(__dirname, 'build.js')], { stdio: 'ignore' });
  const PORT = process.env.PORT || '8219';
  const srv = spawn(process.execPath, [path.join(__dirname, 'serve.js')],
                    { env: { ...process.env, PORT }, stdio: 'ignore' });
  await sleep(800);
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

  await p.goto('http://localhost:' + PORT + '/');
  let booted = false;
  for (let i = 0; i < 40 && !booted; i++) {
    await sleep(250);
    booted = await p.evaluate(() => {
      const g = window.__game;
      return !!(g && g.scene.getScene('delve') && g.scene.getScene('delve').scene.isActive());
    }).catch(() => false);
  }
  ck('the delve boots', booted);
  if (!booted) { report(); await b.close(); srv.kill(); process.exit(1); }

  const R = await p.evaluate(async () => {
    const sc = window.__game.scene.getScene('delve');
    const cru = LEVELS.findIndex(L => L.boss === 'crucible');
    startRun('isaac', LEVELS[cru].id, 'riven');
    run.tech = LEVEL.quota; updatePortal(0.001);
    const boss = run.boss;
    if (!boss || boss.kind !== 'crucible') return { err: 'no boss' };
    // Alone on the board, so the sprite that answers is unambiguously its own.
    enemies.length = 0; enemies.push(boss);
    player.x = boss.x + 200; player.y = boss.y;
    player.hp = player.maxHp = 1e7;
    /* Long enough for the Furnace to have thrown. Its first ring is due at
     * FURNACE_CD/2 and a block lives about 1.5s, so a 90-frame window landed
     * entirely before the first cast and reported an empty board -- ten
     * seconds covers two casts however the clock jittered, and the peak is
     * tracked across the whole window rather than sampled at the end, where
     * the blocks have already resolved into burning ground. */
    let peakSlams = 0, peakHaz = 0;
    for (let i = 0; i < 600; i++) {
      update(1 / 60);
      if (slams.length > peakSlams) peakSlams = slams.length;
      if (hazards.length > peakHaz) peakHaz = hazards.length;
    }
    await new Promise(r => setTimeout(r, 400));

    const key = sc.bodyFrame(boss, performance.now());
    const has = sc.textures.get('art').has(key);
    // The drawn sprite, found by position rather than by index into a pool
    // whose order is not part of the contract.
    let sp = null;
    for (const s of (sc.bodies || sc.pool || [])) {
      if (s && s.visible && Math.hypot(s.x - boss.x, s.y - boss.y) < 4) { sp = s; break; }
    }
    // The gorger's own scale, to compare against.
    const g = newBody('gorger', boss.x + 400, boss.y, 0);
    g.awake = true; enemies.push(g);
    for (let i = 0; i < 6; i++) update(1 / 60);
    await new Promise(r => setTimeout(r, 250));
    let gs = null;
    for (const s of (sc.bodies || sc.pool || [])) {
      if (s && s.visible && Math.hypot(s.x - g.x, s.y - g.y) < 6) { gs = s; break; }
    }
    return {
      key, has,
      drawn: sp ? { frame: sp.frame.name, scale: +sp.scaleY.toFixed(3), tint: sp.tintTopLeft } : null,
      gorger: gs ? { frame: gs.frame.name, scale: +gs.scaleY.toFixed(3) } : null,
      wantRatio: +(ENEMY_TYPES.crucible.r / ENEMY_TYPES.gorger.r).toFixed(3),
      slams: peakSlams, hazards: peakHaz,
      tended: boss.tended || 0
    };
  });

  ck('the fixture put one in the delve', !R.err, R.err || '');
  if (R.err) { report(); await b.close(); srv.kill(); process.exit(1); }

  ck('it asks the atlas for the gorger’s frames, and they are there',
     /bestiary\/gorger/.test(R.key) && R.has === true, R.key + (R.has ? '' : ' MISSING'));
  ck('and the sprite on screen is actually wearing them',
     !!R.drawn && /bestiary\/gorger/.test(R.drawn.frame),
     R.drawn ? R.drawn.frame : 'NO SPRITE FOUND AT THE BOSS — nothing below proves anything');
  // The control and the point: same frames, bigger, by the ratio of the two
  // bodies rather than by a number typed into the renderer.
  ck('and drawn bigger than a real gorger, by the ratio of the two bodies',
     !!R.gorger && Math.abs(R.drawn.scale / R.gorger.scale - R.wantRatio) < 0.02,
     R.gorger ? R.drawn.scale + ' against a gorger’s ' + R.gorger.scale +
       ' — ratio ' + (R.drawn.scale / R.gorger.scale).toFixed(3) +
       ' against the bodies’ ' + R.wantRatio
       : 'NO GORGER DRAWN — the size claim proves nothing');
  ck('and tinted, so it is not read as three gorgers standing close together',
     R.drawn.tint !== 0xffffff, '0x' + (R.drawn.tint >>> 0).toString(16));
  ck('the Furnace is on the board', R.slams > 0 || R.hazards > 0,
     R.slams + ' blocks winding, ' + R.hazards + ' patches burning');

  ck('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  report();
  await b.close(); srv.kill();
  process.exit(fail.length ? 1 : 0);
})();
