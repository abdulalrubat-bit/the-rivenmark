#!/usr/bin/env node
/* THE COMBAT BASELINE: what the controls actually do, measured.
 *
 * The analysis (docs/ROADMAP.md, "Combat first") names nine ways the attack
 * can let a player down, C01 to C09, each from a reproduction. This script
 * runs every one of them again, in the combat room, and writes what it found
 * to docs/COMBAT_BASELINE.md -- so the claims are checked rather than carried,
 * and so the same script run after the controls change is the before/after.
 *
 * The world is stepped here, frame by frame at 60Hz, with the scene's own
 * stepping switched off: a timing measured against requestAnimationFrame in a
 * headless browser is a measurement of the headless browser. The two host
 * checks (C05, C06) go through real pointer events on the Conduit, because
 * what they are about is what the HUD does with a thumb.
 *
 * Run: node tools/combat-baseline.js   (builds, serves, and writes the doc)
 *      CONTROLS=classic|new             which scheme to measure, once there are two
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { execFileSync, spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const PORT = process.env.PORT || '8311';
const CONTROLS = process.env.CONTROLS || '';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  execFileSync(process.execPath, [path.join(ROOT, 'phaser/tools/build.js')], { stdio: 'ignore' });
  const srv = spawn(process.execPath, [path.join(ROOT, 'phaser/tools/serve.js')],
                    { env: { ...process.env, PORT }, stdio: 'ignore' });
  await sleep(800);
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  const url = 'http://localhost:' + PORT + '/?nogate&nogov&room=combat' +
              (CONTROLS ? '&controls=' + CONTROLS : '');
  const rows = [];
  try {
    await p.goto(url);
    await p.waitForFunction(() => state === 'play' && run.room === 'combat', null, { timeout: 30000 });
    await sleep(500);

    // Helpers, in the page: the scene stops stepping, and we step instead.
    await p.evaluate(() => {
      const sc = __game.scene.getScene('delve');
      sc.stepping = false;
      window.B = {
        step(secs) { let lost = 0; const n = Math.round(secs * 60);
          for (let i = 0; i < n; i++) if (!stepDelve(1 / 60)) lost++; return lost; },
        reset() {
          conduitRelease(); player.conDown = false; player.cleave = 0; player.conAim = false;
          player.fireTimer = 0; player.combo = 0; player.comboT = 0; hitStop = 0;
          player.hp = player.maxHp = 1e9; player.invuln = 1e9; player.gcd = 0; player.cds = {};
          for (const e of enemies) if (!e.dummy) e.awake = false;
        },
        swings() { return player.swingNo || 0; }
      };
    });

    const R = await p.evaluate(() => {
      const o = {};
      // C01: a still press held a little past the tap window.
      B.reset(); let s0 = B.swings(); conduitPress(); B.step(0.25); conduitRelease();
      o.c01 = { held250: B.swings() - s0 };
      B.reset(); B.step(0.5); s0 = B.swings(); conduitPress(); B.step(0.15); conduitRelease();
      o.c01.held150 = B.swings() - s0;

      // C02: a second tap while the blade is still coming round.
      B.reset(); B.step(0.5); s0 = B.swings();
      conduitPress(); B.step(1 / 60); conduitRelease();
      B.step(player.fireDelay * 0.5);
      conduitPress(); B.step(1 / 60); conduitRelease();
      B.step(player.fireDelay * 1.5);
      o.c02 = { taps: 2, swings: B.swings() - s0, delay: +player.fireDelay.toFixed(3) };

      // C03: aiming out near the edge and holding -- when does it stop swinging?
      B.reset(); B.step(0.5); s0 = B.swings();
      conduitPress(); conduitAim(0, 0.9);
      let firstGather = null, swingsBefore = 0, swingsAfter = 0;
      for (let i = 0; i < 60; i++) {
        const before = B.swings(); B.step(1 / 60);
        if (player.cleave > 0 && firstGather === null) firstGather = (i + 1) / 60;
        if (B.swings() > before) { if (firstGather === null) swingsBefore++; else swingsAfter++; }
      }
      const strideGathering = (player.cleave || 0) > 0 ? CLEAVE_STRIDE : 1;
      conduitRelease();
      o.c03 = { gatherAt: firstGather && +firstGather.toFixed(3), swingsBefore, swingsAfter,
                stride: strideGathering };

      // C04: the same edge, reached after half a second inside it.
      B.reset(); B.step(0.5);
      conduitPress(); conduitAim(0, 0.5); B.step(0.5);
      conduitAim(0, 0.9); B.step(1 / 60);
      o.c04 = { cleaveOneFrameAfterEdge: +(player.cleave || 0).toFixed(3) };
      conduitRelease();

      // C07: ten kills in a second -- how much of that second does the world stand still?
      B.reset(); B.step(0.5);
      let lost = 0;
      for (let k = 0; k < 10; k++) {
        const e = newBody('thrall', player.x + 50, player.y, 0); enemies.push(e);
        damageEnemy(e, 1e6, player.x, player.y);
        lost += B.step(0.1);
      }
      o.c07 = { framesFrozen: lost, of: 60, share: +(lost / 60).toFixed(2) };
      for (const e of enemies) if (!e.dummy && e.kind === 'thrall' && e.hp <= 0) e.hp = 0;

      // C08: a thrall close in front, the avatar further off -- where does a tap aim?
      B.reset();
      const near = newBody('thrall', player.x + 60, player.y, 0); near.awake = false; enemies.push(near);
      const far = newBody('deceiver', player.x, player.y + 160, 0); far.awake = false; enemies.push(far);
      B.step(1 / 60);
      const a = aimAngle();
      o.c08 = { aimedAt: Math.abs(Math.sin(a)) > 0.7 ? 'the avatar (160 away)' : 'the thrall (60 away)' };
      near.hp = 0; far.hp = 0; B.step(1 / 60);

      // C09: Guillotine with nothing in reach.
      B.reset();
      const keep = enemies.filter(e => e.hp > 0);
      for (const e of keep) { e.sx = e.x; e.sy = e.y; e.x += 5000; }
      B.step(1 / 60);
      player.charges = CHARGE_MAX;
      const took = castAbility('guillotine');
      o.c09 = { accepted: took, chargesAfter: player.charges, of: CHARGE_MAX };
      for (const e of keep) { e.x = e.sx; e.y = e.sy; }
      B.step(1 / 60);
      return o;
    });

    // C05 and C06: through the HUD, with real pointer events.
    const box = await p.$eval('#hud .conduit', e => { const r = e.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    await p.evaluate(() => B.reset());
    await p.mouse.move(box.x, box.y); await p.mouse.down();
    await p.mouse.move(box.x - 30, box.y, { steps: 4 });
    await p.mouse.move(box.x - 3, box.y, { steps: 4 });
    const c05 = await p.evaluate(() => ({
      knob: getComputedStyle(document.querySelector('#hud .conduit')).getPropertyValue('--knob').trim(),
      simAiming: !!player.conAim, simMag: +(player.conMag || 0).toFixed(2) }));
    await p.mouse.up();

    await p.evaluate(() => { B.reset(); __game.scene.getScene('delve').stepping = true; });
    await p.mouse.move(box.x, box.y); await p.mouse.down();
    await p.mouse.move(box.x - 45, box.y, { steps: 4 });
    await sleep(1400);
    const c06 = await p.evaluate(() => {
      const el = document.querySelector('#hud .conduit');
      const cleave = +(player.cleave || 0).toFixed(2);
      el.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, bubbles: true }));
      const last = combatLog.filter(e => e.k === 'release').slice(-1)[0];
      return { cleaveBeforeCancel: cleave, releaseLogged: last ? last.r : 'none' };
    });
    await p.mouse.up();

    // The table.
    const row = (id, claim, found, reproduced) => rows.push({ id, claim, found, reproduced });
    row('C01', 'A still press held past 200ms does nothing.',
        `held 250ms: ${R.c01.held250} swings; held 150ms: ${R.c01.held150}`, R.c01.held250 === 0);
    row('C02', 'A tap while the blade is still coming round is lost, not queued.',
        `2 taps (the second at half the ${R.c02.delay}s beat): ${R.c02.swings} swing${R.c02.swings === 1 ? '' : 's'}`,
        R.c02.swings < 2);
    row('C03', 'Aiming out near the edge turns into a gather, stops the swings and slows the stride.',
        `gather began at ${R.c03.gatherAt}s; ${R.c03.swingsBefore} swings before it, ${R.c03.swingsAfter} after; stride x${R.c03.stride}`,
        R.c03.gatherAt !== null && R.c03.swingsAfter === 0);
    row('C04', 'Reaching the edge after a long press gathers at once.',
        `one frame after reaching the edge (0.5s into the press): gather ${R.c04.cleaveOneFrameAfterEdge}`,
        R.c04.cleaveOneFrameAfterEdge > 0);
    row('C05', 'Back inside the deadzone, the knob centres but the simulation keeps the old aim.',
        `knob ${c05.knob === '0' ? 'centred' : 'shown'}; simulation aiming: ${c05.simAiming} at ${c05.simMag}`,
        c05.knob === '0' && c05.simAiming);
    row('C06', 'A cancelled gesture is treated as a release.',
        `gathering ${c06.cleaveBeforeCancel}, then pointercancel: logged "${c06.releaseLogged}"`,
        c06.releaseLogged === 'heavy');
    row('C07', 'Hit-stop freezes the whole world, movement included.',
        `ten kills in a second: ${R.c07.framesFrozen} of ${R.c07.of} frames frozen (${Math.round(R.c07.share * 100)}%)`,
        R.c07.framesFrozen > 0);
    row('C08', 'Assisted aim prefers the avatar over a nearer threat.',
        `thrall at 60, avatar at 160: a tap aims at ${R.c08.aimedAt}`, /avatar/.test(R.c08.aimedAt));
    row('C09', 'An ability can spend before finding it has nothing to act on.',
        `Guillotine with nothing in reach: ${R.c09.accepted ? 'accepted' : 'refused'}, charges ${R.c09.of} -> ${R.c09.chargesAfter}`,
        R.c09.accepted && R.c09.chargesAfter < R.c09.of);
  } catch (e) {
    rows.push({ id: '!!', claim: 'the baseline ran to the end', found: e.message.split('\n')[0], reproduced: false });
  }
  await b.close(); srv.kill();

  const scheme = CONTROLS || 'default';
  const md = [
    '# Combat baseline — ' + scheme + ' controls',
    '',
    'Written by `tools/combat-baseline.js`. Do not edit by hand: run it again.',
    '',
    'Each row is one of the problems in the combat analysis, reproduced in the',
    'combat room (`?room=combat`) with the world stepped at 60Hz by the script.',
    '"Present" means the problem still happens with these controls.',
    '',
    '| | The claim | Measured | Present |',
    '|---|---|---|---|',
    ...rows.map(r => `| ${r.id} | ${r.claim} | ${r.found} | ${r.reproduced ? 'yes' : 'no'} |`),
    '',
    errs.length ? 'Page errors: ' + errs.slice(0, 3).join(' | ') : 'No page errors.',
    ''
  ].join('\n');
  const out = path.join(ROOT, 'docs', 'COMBAT_BASELINE' + (CONTROLS ? '.' + CONTROLS : '') + '.md');
  fs.writeFileSync(out, md);
  console.log(md);
  process.exit(0);
})();
