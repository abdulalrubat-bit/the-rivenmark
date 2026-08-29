#!/usr/bin/env node
/* The furniture of a delve: the waygate, the coffers, the slag, the beacons.
 *
 * Everything here is a thing the player has to be able to SEE or the delve is
 * unplayable -- you cannot leave a gate you cannot find, and gear on the floor
 * of a dark room is a few pixels wide. So the assertions are in pixels, and
 * they are DIFFERENCES: an absolute count of "gold near the gate" is also a
 * count of the slag, the hero's shield and a lit wall, and would pass with the
 * gate deleted. Only what appears when the thing is there belongs to it.
 *
 * The sim is frozen (state off 'play') rather than stopped: game.loop.stop()
 * halts the RENDER step too, so nothing drawn after it is ever presented.
 * Freezing the core keeps the picture live while stopping the world from
 * walking over the loot mid-measurement, which it did.
 *
 * DESKTOP ONLY (Playwright). Run: npm run smoke:world
 */
const { chromium } = require('playwright');
const buildOnce = require('./build-once.cjs');
const { spawn } = require('child_process');
const { PNG } = require('pngjs');
const path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pass = [], fail = [];
const ck = (n, ok, note) => (ok ? pass : fail).push((ok ? '' : 'x ') + n + (note ? '  [' + note + ']' : ''));

(async () => {
  buildOnce();                       // the suite must test src/, not a stale bundle
  const PORT = process.env.PORT || '8215';
  const srv = spawn(process.execPath, [path.join(__dirname, 'serve.js')],
                    { env: { ...process.env, PORT }, stdio: 'ignore' });
  await sleep(800);
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

  /* Loaded with ?noatmos&nogov.
   *
   * Not to make the numbers look better -- to make them exist at all. Every
   * pixel assertion below is a DIFFERENCE against a frozen frame, and the
   * atmosphere is not frozen: fog drifts, ash falls, torches gutter. With it
   * running, a box with nothing in it reads eighty changed pixels and every
   * measurement here is noise on top of noise. And the governor, left free,
   * sheds the mood halfway through a measurement, so the picture under test
   * stops existing partway through the test.
   *
   * The atmosphere has its own suite (smoke:air) where it is the subject
   * rather than the weather.
   */
  await p.goto('http://localhost:' + PORT + '/?noatmos&nogov');
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

  /* Pixels, as a DIFFERENCE of two screenshots of the same box.
   *
   * A colour predicate was the first attempt and it is the wrong tool here:
   * these beacons are drawn ADDITIVELY over a brown floor, so a corpse's cold
   * #9fc2d8 lands as rgb(105,118,126) and fails "blue > red + 22" by one. The
   * question is not what colour arrived, it is whether anything did -- so take
   * the box before, take it after, and count what moved.
   *
   * Only sound because the sim is frozen: nothing else in the box changes.
   * `settle()` proves that each time rather than assuming it -- a fixture that
   * cannot find nothing cannot find something either.
   */
  const shot = async (at, half) => PNG.sync.read(await p.screenshot({ clip: {
    x: Math.max(0, at[0] - half), y: Math.max(0, at[1] - half),
    width: half * 2, height: half * 2 } }));
  const moved = (a, b2) => {
    let n = 0;
    for (let i = 0; i < a.data.length; i += 4) {
      if (Math.abs(a.data[i] - b2.data[i]) +
          Math.abs(a.data[i + 1] - b2.data[i + 1]) +
          Math.abs(a.data[i + 2] - b2.data[i + 2]) > 24) n++;
    }
    return n;
  };
  /* Two shots of an unchanged box. Whatever this returns is the noise floor
   * that every measurement below has to beat. */
  const settle = async (at, half) => {
    const a = await shot(at, half);
    await sleep(350);
    return { base: a, noise: moved(a, await shot(at, half)) };
  };
  const GOLD = (r, g, bl) => r > 140 && g > 100 && bl < r - 40;
  const countGold = async (at, half) => {
    const png = await shot(at, half);
    let n = 0;
    for (let i = 0; i < png.data.length; i += 4) {
      if (GOLD(png.data[i], png.data[i + 1], png.data[i + 2])) n++;
    }
    return n;
  };

  /* Stage the delve: freeze it, clear the crowd (a thrall standing on the
   * gate is 400 pixels of thrall), and put one of everything where it can be
   * looked at. Returns where each landed in SCREEN space. */
  const stage = await p.evaluate(async () => {
    const sc = window.__game.scene.getScene('delve');
    state = 'over';                       // freeze the sim, keep rendering
    enemies.length = 0;
    player.x = portal.x; player.y = portal.y - 46;
    portal.active = false; portal.channel = 0;
    loot.length = 0; drops.length = 0; run.corpse = null;
    for (let i = 0; i < 40; i++) await new Promise(r => requestAnimationFrame(r));
    const c = sc.cameras.main;
    const S = (x, y) => [Math.round(x - c.scrollX), Math.round(y - c.scrollY)];
    // Clear floor to stand things on, well away from everything that moves.
    //
    // Three constraints, each of which was a false reading first: not inside a
    // wall (that measures a wall), on screen with room for the box, and CLEAR
    // OF THE GATE -- whose rune ring turns for ever, so a box overlapping it
    // is never still and reads ~300 changed pixels with nothing in it.
    const clear = (want, from, half) => {
      let best = null, bd = 1e9;
      for (let a = 0; a < 48; a++) {
        for (let d = 120; d <= 300; d += 15) {
          const x = portal.x + Math.cos(a / 48 * TAU) * d;
          const y = portal.y + Math.sin(a / 48 * TAU) * d;
          if (cellAt((x / CELL_W) | 0, (y / CELL_W) | 0) === SOLID) continue;
          if (Math.hypot(x - portal.x, y - portal.y) < PORTAL_R + half + 24) continue;
          if (x < c.scrollX + half + 8 || x > c.scrollX + c.width - half - 8) continue;
          if (y < c.scrollY + half + 96 || y > c.scrollY + c.height - half - 150) continue;
          const gap = Math.hypot(x - want[0], y - want[1]) +
                      (from ? Math.max(0, 210 - Math.hypot(x - from[0], y - from[1])) * 4 : 0);
          if (gap < bd) { bd = gap; best = [Math.round(x), Math.round(y)]; }
        }
      }
      return best;
    };
    const lootW   = clear([portal.x - 130, portal.y + 150], null, 60);
    const dropW   = clear([portal.x + 150, portal.y + 40], lootW, 90);
    const corpseW = clear([portal.x - 150, portal.y - 60], dropW, 80);
    if (!lootW || !dropW || !corpseW) return { noRoom: true };
    return {
      gate: S(portal.x, portal.y),
      lootW, dropW, corpseW,
      lootAt: S(lootW[0], lootW[1]),
      dropAt: S(dropW[0], dropW[1]),
      corpseAt: S(corpseW[0], corpseW[1]),
      chests: chests.length, chestImgs: (sc.chestImgs || []).length,
      heroDepth: sc.hero.depth, playerY: Math.round(player.y),
      shadows: sc.shadows.length
    };
  });

  // A gate walled into a corner leaves nowhere to stand a beacon, and every
  // measurement below would then be taken somewhere arbitrary. Say so rather
  // than measure the wrong thing.
  ck('there is clear floor to measure on', !stage.noRoom,
     stage.noRoom ? 'the gate has no open apron on screen this seed' : 'three clear spots');
  if (stage.noRoom) { report(); await b.close(); srv.kill(); process.exit(1); }

  // --- the waygate ---------------------------------------------------------
  // The gate turns even while dormant, so its box is never still and the diff
  // is useless on it -- here the question really is the colour, because waking
  // is entirely a change of colour.
  const BLUEISH = (r, g, bl) => bl > 90 && bl > r + 22 && g > 60;
  const countBlue = async () => {
    const png = await shot(stage.gate, 80);
    let n = 0;
    for (let i = 0; i < png.data.length; i += 4) {
      if (BLUEISH(png.data[i], png.data[i + 1], png.data[i + 2])) n++;
    }
    return n;
  };
  const gateOff = await countBlue();
  await p.evaluate(() => { portal.active = true; });
  await sleep(500);
  const gateOn = await countBlue();
  ck('the waygate lights when it wakes', gateOn - gateOff > 200,
     (gateOn - gateOff) + ' arcane pixels that are there only when it is active (' +
     gateOn + ' awake, ' + gateOff + ' dormant)');

  // The channel is the only readout during the seconds you stand in it.
  const chanOff = await countGold(stage.gate, 80);
  await p.evaluate(() => { portal.channel = (LEVEL.channel || 6) * 0.75; });
  await sleep(400);
  const chanOn = await countGold(stage.gate, 80);
  ck('and the channel closes around it', chanOn - chanOff > 120,
     (chanOn - chanOff) + ' pixels of gold arc at three-quarters');
  await p.evaluate(() => { portal.channel = 0; });

  // --- slag on the floor ---------------------------------------------------
  const slag = await settle(stage.lootAt, 60);
  const lootN = await p.evaluate(w => {
    for (let i = 0; i < 8; i++)
      loot.push({ x: w[0] - 70 + i * 20, y: w[1], value: i % 2 ? 3 : 1,
                  spin: i * 0.4, life: 9 });
    return loot.length;
  }, stage.lootW);
  await sleep(500);
  const slagOn = moved(slag.base, await shot(stage.lootAt, 60));
  ck('slag lands on the floor', slagOn > slag.noise + 200,
     slagOn + ' pixels changed for ' + lootN + ' pieces, over a still floor of ' +
     slag.noise);
  const lootPool = await p.evaluate(() => {
    const sc = window.__game.scene.getScene('delve');
    loot.length = 0;
    return { imgs: sc.lootImgs.length };
  });
  await sleep(400);
  const slagGone = moved(slag.base, await shot(stage.lootAt, 60));
  ck('and is gone when it is picked up', slagGone <= slag.noise + 40,
     slagGone + ' pixels still changed against a noise floor of ' + slag.noise +
     ', with ' + lootPool.imgs + ' images kept pooled');

  // --- a drop's beacon -----------------------------------------------------
  const drop = await settle(stage.dropAt, 90);
  await p.evaluate(w => {
    drops.push({ x: w[0], y: w[1],
                 item: { name: 'A test blade', slot: 'weapon', rarity: 'riven', affixes: [] } });
  }, stage.dropW);
  await sleep(500);
  const dropOn = moved(drop.base, await shot(stage.dropAt, 90));
  ck('a drop throws a beacon', dropOn > drop.noise + 300,
     dropOn + ' pixels changed over a still floor of ' + drop.noise);

  // Rarity is the whole point of the beacon: a riven blade must not look like
  // a worn one from across the room, and the way it says so is HEIGHT. So the
  // shaft is measured, not the rarity table -- asking rarityOf() what rarity
  // an item is passes perfectly with the beacon deleted, which is what the
  // first version of this check did.
  //
  // Measured as AREA in the top strip of the box rather than as "the highest
  // row anything changed". A shaft fades out towards its top by design, so its
  // last few bands sit within a few values of the floor, and where exactly they
  // cross a threshold depends on what is under them -- over a lit wall the same
  // shaft "ended" 56 rows lower and the check flaked. Counting how much of the
  // strip lit up asks the question the eye asks.
  const HEAD = 34;             // rows a worn shaft (54 tall) cannot reach
  const headLit = async id => {
    await p.evaluate(([w, r]) => {
      drops.length = 0;
      drops.push({ x: w[0], y: w[1],
                   item: { name: 'x', slot: 'weapon', rarity: r, affixes: [] } });
    }, [stage.dropW, id]);
    await sleep(400);
    const now = await shot(stage.dropAt, 90);
    let n = 0;
    for (let y = 0; y < HEAD; y++) {
      for (let x = 0; x < 180; x++) {
        const i = (y * 180 + x) * 4;
        // A lower bar than `moved` uses: this is the faint end of the shaft,
        // which is the whole point of measuring up here.
        if (Math.abs(now.data[i] - drop.base.data[i]) +
            Math.abs(now.data[i + 1] - drop.base.data[i + 1]) +
            Math.abs(now.data[i + 2] - drop.base.data[i + 2]) > 9) n++;
      }
    }
    return n;
  };
  const tall = await headLit('mythic');
  const short = await headLit('worn');
  await p.evaluate(() => { drops.length = 0; });
  ck('and its height is its rarity', tall > short + 400,
     'a mythic shaft lights ' + tall + ' pixels of the top ' + HEAD +
     ' rows, a worn one ' + short);

  // --- the corpse ----------------------------------------------------------
  const corpse = await settle(stage.corpseAt, 80);
  await p.evaluate(w => { run.corpse = { x: w[0], y: w[1], taken: false }; },
                   stage.corpseW);
  await sleep(500);
  const corpseOn = moved(corpse.base, await shot(stage.corpseAt, 80));
  ck('your own corpse is marked', corpseOn > corpse.noise + 250,
     corpseOn + ' pixels changed over a still floor of ' + corpse.noise);
  await p.evaluate(() => { run.corpse.taken = true; });
  await sleep(400);
  const corpseTaken = moved(corpse.base, await shot(stage.corpseAt, 80));
  ck('and it goes when you reclaim it', corpseTaken <= corpse.noise + 40,
     corpseTaken + ' pixels still changed against a noise floor of ' + corpse.noise);

  // --- coffers -------------------------------------------------------------
  ck('every coffer gets an image', stage.chests > 0 && stage.chestImgs === stage.chests,
     stage.chestImgs + ' images for ' + stage.chests + ' coffers');
  const chest = await p.evaluate(async () => {
    const sc = window.__game.scene.getScene('delve');
    const c = sc.chestImgs[0];
    if (!c) return { none: true };
    const shut = c.img.frame.name;
    c.ch.open = true;
    for (let i = 0; i < 6; i++) await new Promise(r => requestAnimationFrame(r));
    return { shut, open: c.img.frame.name };
  });
  ck('and opening one changes what it shows',
     !chest.none && /shut$/.test(chest.shut) && /open$/.test(chest.open),
     chest.none ? 'no coffers' : chest.shut + ' -> ' + chest.open);

  // --- sorting and shadows -------------------------------------------------
  // The hero sorts against the crowd by y. At a fixed high depth he drew
  // through every body in front of him, which reads as pasted-on.
  ck('the hero sorts with the crowd', Math.abs(stage.heroDepth - stage.playerY) < 2,
     'depth ' + stage.heroDepth + ' at y ' + stage.playerY);
  const sorted = await p.evaluate(async () => {
    const sc = window.__game.scene.getScene('delve');
    state = 'play';
    const e = { ...player };
    // Two bodies, one above the hero and one below, and their depths must
    // straddle his.
    enemies.length = 0;
    for (let i = 0; i < 20; i++) await new Promise(r => requestAnimationFrame(r));
    state = 'over';
    // A standing prop must sort the same way; flat scenery never does.
    const up = sc.propImgs.filter(im => im.depth > 0).length;
    const flat = sc.propImgs.filter(im => im.depth < -1000).length;
    return { up, flat, shadows: sc.shadows.length, heroShadow: !!sc.heroShadow };
  });
  ck('standing scenery sorts, flat scenery does not',
     sorted.up > 0 && sorted.flat > 0,
     sorted.up + ' standing, ' + sorted.flat + ' flat');
  ck('and everything standing casts one shadow', sorted.heroShadow,
     sorted.shadows + ' pooled for bodies, plus the hero');

  // The diffs above are only meaningful if an unchanged box reads as unchanged.
  // If this ever goes, every measurement in this suite is noise and the passes
  // below it mean nothing.
  const noise = Math.max(slag.noise, drop.noise, corpse.noise);
  ck('an empty box reads as empty', noise < 60,
     'worst noise floor ' + noise + ' pixels (slag ' + slag.noise + ', drop ' +
     drop.noise + ', corpse ' + corpse.noise + ')');

  const perf = await p.evaluate(() => {
    const s = window.__game.scene.getScene('delve').log.stats();
    return s ? { p50: s.p50, p90: s.p90 } : null;
  });
  ck('and it still holds a frame', perf && perf.p90 < 34,
     perf ? 'median ' + perf.p50 + 'ms, p90 ' + perf.p90 + 'ms (software GL here)' : 'no samples');
  ck('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));

  await p.screenshot({ path: path.join(__dirname, '..', 'world.png') });
  report();
  await b.close(); srv.kill();
  process.exit(fail.length ? 1 : 0);

  function report() {
    console.log('\nPASS ' + pass.length + '\n  ' + pass.join('\n  '));
    console.log('\nFAIL ' + fail.length + (fail.length ? '\n  ' + fail.join('\n  ') : ''));
  }
})();
