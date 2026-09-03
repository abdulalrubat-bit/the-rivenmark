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
const buildOnce = require('./build-once.cjs');
const { spawn } = require('child_process');
const path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pass = [], fail = [];
const ck = (n, ok, note) => (ok ? pass : fail).push((ok ? '' : 'x ') + n + (note ? '  [' + note + ']' : ''));

(async () => {
  buildOnce();                       // the suite must test src/, not a stale bundle
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
      wallImgs: sc.wallImgs ? sc.wallImgs.length : 0,
      solids: (() => { let n = 0; for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) if (cellAt(x, y) === SOLID) n++; return n; })(),
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

  // The stone dressing. Every solid cell that is not a pit wears a lit top,
  // and every exposed face wears courses on top of that -- so the image count
  // has to exceed the solid-cell count, not merely be non-zero. A dressing
  // that silently failed to find its frames would return an empty list and
  // the delve would still render, just bare.
  ck('the walls wear their stone', R.wallImgs > R.solids,
     R.wallImgs + ' dressing images over ' + R.solids + ' solid cells');

  // ...and it is culled. Phaser does not cull ordinary game objects, so all
  // ~1700 of these were being submitted every frame: measured p90 16.7 -> 33.3ms
  // and a quarter of frames over budget. Visibility is set by hand instead.
  // Two things are asserted, because either alone can pass while broken: that
  // most of the dressing is switched off, and that what is left is actually
  // near the camera -- and then that the set MOVES when the camera does, which
  // is what separates culling from a one-off list built at spawn.
  const cull = await p.evaluate(async () => {
    const sc = window.__game.scene.getScene('delve');
    const c = sc.cameras.main;
    const key = () => sc.wallImgs.map(im => (im.visible ? 1 : 0)).join('');
    const shown = () => sc.wallImgs.reduce((n, im) => n + (im.visible ? 1 : 0), 0);
    const stray = () => sc.wallImgs.filter(im => im.visible &&
      (im.x < c.scrollX - 400 || im.x > c.scrollX + c.width + 400 ||
       im.y < c.scrollY - 400 || im.y > c.scrollY + c.height + 400)).length;

    sc.cullDressing(true);
    const here = { on: shown(), stray: stray(), key: key() };

    // Walk the camera to the far corner of the world and let it settle.
    const back = { x: player.x, y: player.y };
    player.x = WORLD.w - 300; player.y = WORLD.h - 300;
    for (let i = 0; i < 30; i++) await new Promise(r => requestAnimationFrame(r));
    sc.cullDressing(true);
    const away = { on: shown(), stray: stray(), key: key() };

    player.x = back.x; player.y = back.y;
    for (let i = 0; i < 30; i++) await new Promise(r => requestAnimationFrame(r));
    sc.cullDressing(true);
    return { here, away, total: sc.wallImgs.length };
  });
  ck('and most of it is switched off', cull.here.on > 0 && cull.here.on < cull.total * 0.35,
     cull.here.on + ' of ' + cull.total + ' visible');
  ck('nothing far from the camera is drawn', cull.here.stray === 0 && cull.away.stray === 0,
     cull.here.stray + ' stray here, ' + cull.away.stray + ' stray across the world');
  ck('and the cull follows the camera', cull.here.key !== cull.away.key,
     cull.here.on + ' visible here against ' + cull.away.on + ' across the world');
  /* NOBODY IS WEARING SOMEBODY ELSE'S FRAME.
   *
   * Reported from a real run: "the deceiver turned into a column, so I was
   * fighting a piece of scenery". He was -- he was drawn as `walls/course-0-1`.
   * Two faults met. The Deceiver and his mirages blink rather than walk, so the
   * forge gives them one pose and no run cycle, and a blink is a large jump in
   * one frame, which reads as a large pace: the one body in the game with no
   * run cycle was the one most certain to ask for one. And
   * textures.getFrame(key, name) does not return null for a name the atlas
   * lacks -- it returns the texture's FIRST frame -- so the existence guard
   * always passed and setFrame fell back to the same wall.
   *
   * Every check the suites had went through bodyFrame or a synthetic body.
   * This one reads what is actually ON SCREEN, in a running delve, and asks
   * whether each sprite belongs to the body it is standing on. That is the
   * question the player asks, and it is the one nothing was asking.
   */
  const dressed = await p.evaluate(async () => {
    const sc = window.__game.scene.getScene('delve');
    // Drive every kind through the moving path, which is where the fault was:
    // standing bodies wear -rest and -rest always exists.
    for (const e of enemies) { if (e.hp > 0) { e.pace = 1; e.gait = Math.random() * 400; } }
    // And PLANT the kinds a shallow delve does not spawn. Left to what turns
    // up, this ran over four kinds and the one that was broken -- the one with
    // no run cycle at all -- was never among them.
    const planted = ['deceiver', 'mirage', 'lieutenant', 'gorger'];
    const live0 = enemies.filter(x => x.hp > 0);
    // Everything is put back before returning: this probe runs before the gait
    // and breath checks, and leaving a delve full of sprinting mirages made
    // them measure a world this one had rearranged.
    const undo = live0.map(e => ({ e, kind: e.kind, pace: e.pace, gait: e.gait }));
    planted.forEach((k, i) => { if (live0[i]) live0[i].kind = k; });
    for (let i = 0; i < 4; i++) await new Promise(r => requestAnimationFrame(r));
    const live = enemies.filter(x => sc.showBody(x));
    const wrong = [];
    const kinds = new Set();
    for (let i = 0; i < live.length; i++) {
      const sp = sc.pool[i];
      if (!sp || !sp.visible) continue;
      kinds.add(live[i].kind);
      if (!sp.frame.name.startsWith('bestiary/' + live[i].kind + '-')) {
        wrong.push(live[i].kind + ' wearing ' + sp.frame.name);
      }
    }
    const out = { wrong: [...new Set(wrong)], n: live.length, kinds: [...kinds] };
    for (const u of undo) { u.e.kind = u.kind; u.e.pace = u.pace; u.e.gait = u.gait; }
    for (let i = 0; i < 2; i++) await new Promise(r => requestAnimationFrame(r));
    return out;
  });
  ck('every body wears a frame of its own kind, walking',
     dressed.wrong.length === 0,
     dressed.wrong.length ? dressed.wrong.slice(0, 4).join('; ')
       : dressed.n + ' bodies across ' + dressed.kinds.length + ' kinds');

  // Including the one that has no walk at all.
  const blink = await p.evaluate(async () => {
    const sc = window.__game.scene.getScene('delve');
    const e = enemies.find(x => x.hp > 0);
    if (!e) return { none: true };
    const was = e.kind;
    e.kind = 'deceiver'; e.pace = 1; e.gait = 3 * 21;
    const asked = sc.bodyFrame(e, 0);
    e.kind = was;
    return { asked, exists: sc.textures.get('art').has(asked) };
  });
  ck('and a kind with no run cycle asks for the pose it does have',
     !blink.none && blink.asked === 'bestiary/deceiver-rest' && blink.exists,
     blink.none ? 'no body' : 'a moving deceiver asks for ' + blink.asked +
       (blink.exists ? '' : ' — WHICH DOES NOT EXIST'));

  ck('a sprite exists for every body', R.pool >= R.bodies,
     R.pool + ' sprites for ' + R.bodies + ' bodies');
  ck('the hero sprite tracks the hero',
     Math.abs(R.heroAt[0] - R.playerAt[0]) < 2 && Math.abs(R.heroAt[1] - R.playerAt[1]) < 2,
     R.heroAt.join(',') + ' against ' + R.playerAt.join(','));

  // The gait. Walk one body a long way by hand and watch the frame change with
  // the distance -- then hold it still and watch the WALK stop.
  //
  // What is asserted about standing is that the gait stops contributing, not
  // that the sprite goes perfectly rigid: a kind with authored idle art
  // breathes on a clock while stopped, which is a different mechanism and
  // smoke-art's business. Pinning this to '-rest' would have made giving any
  // kind an idle loop look like a gait regression. So: the clock is held
  // fixed, and the claim is that walking a stopped body's gait forward changes
  // nothing and it is no longer wearing a run pose.
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
      seen.add(sc.bodyFrame(e, 0));
    }
    const moving = [...seen];
    // Now stand still: pace decays and the gait stops driving the frame.
    for (let i = 0; i < 120; i++) advanceGait(e, e.x, e.y, 1 / 60);
    const still = sc.bodyFrame(e, 0);
    for (let i = 0; i < 120; i++) advanceGait(e, e.x, e.y, 1 / 60);
    return { moving, still, again: sc.bodyFrame(e, 0), pace: +e.pace.toFixed(3) };
  });
  ck('a walking body cycles its gait', !gait.none && gait.moving.length >= 4,
     gait.none ? 'no thrall found' : gait.moving.length + ' distinct frames over 720 units');
  /* And breathes while it stands.
   *
   * Done as a horizontal scale rather than as posed frames: six forged idle
   * poses per creature measured 3.95MB, a third of the whole sprite budget,
   * to say that a body is alive. So the thing to assert is that scaleX moves
   * over time while scaleY does not -- a body that grew in both would be
   * getting bigger, not breathing, and its feet would leave the floor.
   */
  const breath = await p.evaluate(async () => {
    const sc = window.__game.scene.getScene('delve');
    const e = enemies.find(b => b.hp > 0 && b.kind === 'thrall');
    if (!e) return { none: true };
    e.pace = 0; e.braced = false;
    const xs = [], ys = [];
    for (let i = 0; i < 30; i++) {
      await new Promise(r => requestAnimationFrame(r));
      const sp = sc.pool.find(s => s.visible && /-rest$/.test(s.frame.name));
      if (sp) { xs.push(+sp.scaleX.toFixed(5)); ys.push(+sp.scaleY.toFixed(5)); }
    }
    const span = a => Math.max(...a) - Math.min(...a);
    // Two bodies started at different points in the cycle, or a pack breathes
    // in unison and reads as one machine.
    const two = enemies.filter(b => b.hp > 0).slice(0, 12).map(b => b.breathPhase);
    return { n: xs.length, dx: span(xs), dy: span(ys), mid: ys[0],
             phases: new Set(two.filter(v => v !== undefined)).size,
             bodies: two.length };
  });
  ck('and breathes while it stands',
     !breath.none && breath.n > 5 && breath.dx > 0.0005 && breath.dy < 1e-6,
     breath.none ? 'no thrall' : 'scaleX moved ' + breath.dx.toFixed(4) +
       ' over ' + breath.n + ' frames, scaleY ' + breath.dy.toFixed(6) +
       ' (fixed at ' + breath.mid + ')');
  ck('and not in unison with the body beside it',
     !breath.none && breath.phases > 1,
     breath.none ? '' : breath.phases + ' distinct phases across ' + breath.bodies + ' bodies');

  ck('and a standing one stops walking', !gait.none && !/-run-\d+$/.test(gait.still) &&
     gait.still === gait.again,
     gait.none ? '' : 'settled on ' + gait.still + ' at pace ' + gait.pace +
                 ', unchanged after 2s more of standing');

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
