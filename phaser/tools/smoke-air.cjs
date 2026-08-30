#!/usr/bin/env node
/* Mood, and the governor that takes it away.
 *
 * Two different things are being asserted here and they pull opposite ways.
 * One is that the atmosphere is actually drawn -- light on the walls, haze,
 * ash, the dark closing in. The other is that ALL OF IT GOES when the frame
 * cannot afford it, except the light pass, which is not decoration: without it
 * the tunnels read as flat black and a torch is a sprite of a torch that
 * lights nothing.
 *
 * The governor gets tested directly rather than through the picture, because
 * its two failure modes are both invisible: never dropping (the port shipped
 * that -- 30fps with lowFx false throughout) and never restoring (the canvas
 * build shipped that, for a whole session, after one rough patch).
 *
 * DESKTOP ONLY (Playwright). Run: npm run smoke:air
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
  const PORT = process.env.PORT || '8217';
  const srv = spawn(process.execPath, [path.join(__dirname, 'serve.js')],
                    { env: { ...process.env, PORT }, stdio: 'ignore' });
  await sleep(800);
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

  // ?nogov: see the note in delve.js. The governor is exercised on its own
  // below, and end-to-end on a second load at the bottom of this file.
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

  const shot = async clip => PNG.sync.read(await p.screenshot({ clip }));
  const moved = (a, b2) => {
    let n = 0;
    for (let i = 0; i < a.data.length; i += 4) {
      if (Math.abs(a.data[i] - b2.data[i]) +
          Math.abs(a.data[i + 1] - b2.data[i + 1]) +
          Math.abs(a.data[i + 2] - b2.data[i + 2]) > 24) n++;
    }
    return n;
  };
  const brightness = png => {
    let s = 0;
    for (let i = 0; i < png.data.length; i += 4) {
      s += png.data[i] + png.data[i + 1] + png.data[i + 2];
    }
    return s / (png.data.length / 4);
  };

  // --- the baked textures --------------------------------------------------
  // Read straight out of the texture rather than off the screen: these are
  // one-off bakes and their defects are properties of the texture.
  const baked = await p.evaluate(() => {
    const T = window.__game.textures;
    const px = (key, x, y) => {
      const c = T.get(key).getSourceImage();
      const g = c.getContext ? c.getContext('2d') : null;
      if (!g) return null;
      const d = g.getImageData(x, y, 1, 1).data;
      return [d[0], d[1], d[2], d[3]];
    };
    const size = key => { const c = T.get(key).getSourceImage();
                          return [c.width, c.height]; };
    // A tile that does not wrap puts a hard rectangular seam across the room:
    // sample the two edges that meet when it repeats.
    const S = size('fogTile')[0];
    let seam = 0, n = 0;
    for (let y = 0; y < S; y += 4) {
      const l = px('fogTile', 0, y), r = px('fogTile', S - 1, y);
      seam += Math.abs(l[3] - r[3]); n++;
    }
    for (let x = 0; x < S; x += 4) {
      const t = px('fogTile', x, 0), b2 = px('fogTile', x, S - 1);
      seam += Math.abs(t[3] - b2[3]); n++;
    }
    const [vw, vh] = size('vignette');
    return {
      fog: size('fogTile'), seam: +(seam / n).toFixed(2),
      vig: [vw, vh],
      vigMid: px('vignette', vw >> 1, vh >> 1),
      vigCorner: px('vignette', 2, 2),
      screen: [innerWidth, innerHeight]
    };
  });
  // Seamless measures ~0.5; the unwrapped version measured 8.4. The bar sits
  // between them with room, not next to the failure.
  ck('the fog tile wraps without a seam', baked.seam < 4,
     'opposite edges differ by ' + baked.seam + ' of alpha on average');
  ck('the vignette is baked at the viewport, not stretched from a square',
     baked.vig[0] === baked.screen[0] && baked.vig[1] === baked.screen[1],
     baked.vig.join('x') + ' for a ' + baked.screen.join('x') + ' screen');
  ck('and it is clear in the middle and near black at the rim',
     baked.vigMid[3] < 30 && baked.vigCorner[3] > 180,
     'alpha ' + baked.vigMid[3] + ' at the centre, ' + baked.vigCorner[3] + ' at the corner');

  // --- the light pass ------------------------------------------------------
  const light = await p.evaluate(async () => {
    const sc = window.__game.scene.getScene('delve');
    const c = sc.cameras.main;
    state = 'over';                              // freeze; the layer redraws
    // lowFx ON for this one, which sheds the fog, the ash and the vignette and
    // keeps the light pass -- exactly the property being asserted below.
    //
    // Not a convenience. Mean brightness over a box is the measurement, and
    // fog DRIFTS and ash FALLS across that box between the two screenshots.
    // With them running the "unlit" shot came back BRIGHTER than the lit one
    // as often as not, which is the haze moving, not a torch.
    lowFx = true;
    if (!lamps.length) return { none: true };
    // Drive the camera TO a lamp rather than hoping one is on screen: the
    // first version filtered for a lamp already in view, and on some seeds
    // there simply is not one.
    //
    // Read the camera back A FRAME LATER, not immediately. setScroll does not
    // clamp to the camera bounds until preRender, so scrollY straight after it
    // still holds the out-of-bounds value asked for -- and for a lamp near the
    // top of the world that is a lie by nearly 300 pixels. The suite believed
    // the lamp was centred at y=422 while it actually rendered at y=139,
    // measured a box with no lamp in it, and reported a torch that lit
    // nothing. It failed on about half of all seeds: exactly the ones where
    // the clamp bit.
    c.stopFollow();
    const frame = () => new Promise(r => requestAnimationFrame(r));
    let L = null, at = null;
    for (const cand of lamps) {
      c.setScroll(cand.x - c.width / 2, cand.y - c.height / 2);
      await frame();
      const sx = cand.x - c.scrollX, sy = cand.y - c.scrollY;
      if (sx > 90 && sx < c.width - 90 && sy > 150 && sy < c.height - 200) {
        L = cand; at = [Math.round(sx), Math.round(sy)];
        break;
      }
    }
    if (!L) return { none: true };
    for (let i = 0; i < 8; i++) await frame();
    // And check the camera did not move under us between choosing and settling.
    const finalAt = [Math.round(L.x - c.scrollX), Math.round(L.y - c.scrollY)];
    if (Math.abs(finalAt[0] - at[0]) > 2 || Math.abs(finalAt[1] - at[1]) > 2) {
      return { none: true, moved: [at, finalAt] };
    }
    return { at, lamps: lamps.length, lit: sc.air.litCount };
  });
  ck('there is a lamp to measure', !light.none,
     light.none ? (light.moved ? 'the camera moved between choosing and settling: ' +
                                 JSON.stringify(light.moved)
                               : 'no lamp lands clear of the screen edges this seed')
                : light.lamps + ' lamps in the delve');
  if (light.none) { report(); await b.close(); srv.kill(); process.exit(1); }

  /* Counted as CHANGED PIXELS, not as mean brightness.
   *
   * Mean brightness over a 140px box was the first attempt and it never
   * worked: one torch shifts the average of that box by less than a unit, so
   * the check was reading whatever else moved. With the haze running it
   * "passed" by 16-20 units of drifting fog, and the unlit shot came back
   * brighter than the lit one as often as not. With the haze off, both shots
   * read 137.4. It was measuring the weather either way.
   *
   * A torch is a LOCAL glow. What it does is change a few thousand pixels
   * near itself, which is exactly what a difference image sees.
   */
  const lampClip = { x: Math.max(0, light.at[0] - 70), y: Math.max(0, light.at[1] - 70),
                     width: 140, height: 140 };
  const lampOn = await shot(lampClip);
  await p.evaluate(async () => {
    const sc = window.__game.scene.getScene('delve');
    window.__lamps = lamps.slice(); lamps.length = 0;
    for (let i = 0; i < 10; i++) await new Promise(r => requestAnimationFrame(r));
    return sc.air.litCount;
  });
  await sleep(400);
  const lampOff = await shot(lampClip);
  // The noise floor is taken with the lamps ALREADY OUT, not before.
  // A lit box is never still: torches gutter, by design --
  // `0.78 + 0.22 * sin(t*7.3) * sin(t*3.1)` -- so the flicker is the very
  // thing being measured and taking the floor while it runs charged the
  // measurement for its own signal. It read 1359 "still" pixels that way.
  await sleep(350);
  const lampNoise = moved(lampOff, await shot(lampClip));
  const lampDelta = moved(lampOn, lampOff);
  ck('an unlit box is still', lampNoise < 60,
     lampNoise + ' pixels move on their own once the lamps are out');
  ck('a torch lights the stone around it', lampDelta > lampNoise + 500,
     lampDelta + ' pixels change when the lamps go out, over a still floor of ' +
     lampNoise);

  // Culled to the view, so a big cave costs no more than a small one.
  const cull = await p.evaluate(async () => {
    const sc = window.__game.scene.getScene('delve');
    lamps.push(...window.__lamps);
    lowFx = false;                               // the mood back on for what follows
    for (let i = 0; i < 8; i++) await new Promise(r => requestAnimationFrame(r));
    return { lamps: lamps.length, lit: sc.air.litCount };
  });
  ck('and only the ones on screen are drawn', cull.lit < cull.lamps * 0.6,
     cull.lit + ' blobs for ' + cull.lamps + ' lamps in the delve');

  // --- haze, ash and the dark ----------------------------------------------
  // The LEFT EDGE, not the middle. Both the vignette and the gloom are clear
  // at the centre by construction -- that is what a vignette is -- so a box in
  // the middle of the screen measures the one place neither of them touches,
  // and reads 105.1 either way. Bottom-left holds the debug readout and
  // bottom-right the kit, so this is the strip that is only ever the room.
  const mid = { x: 0, y: 280, width: 66, height: 240 };
  const withMood = await shot(mid);
  const gloomed = await p.evaluate(async () => {
    run.gloom = GLOOM_TIME * 0.5;
    for (let i = 0; i < 8; i++) await new Promise(r => requestAnimationFrame(r));
    return window.__game.scene.getScene('delve').air.gloom.visible;
  });
  await sleep(300);
  const withGloom = await shot(mid);
  ck('the gloom takes the light', gloomed && brightness(withGloom) < brightness(withMood) - 4,
     'the room reads ' + brightness(withMood).toFixed(1) + ' lit and ' +
     brightness(withGloom).toFixed(1) + ' with the dark closed in');
  await p.evaluate(() => { run.gloom = 0; });
  await sleep(300);

  const flash = await p.evaluate(async () => {
    swapFlash = 1;
    for (let i = 0; i < 6; i++) await new Promise(r => requestAnimationFrame(r));
    return window.__game.scene.getScene('delve').air.flash.visible;
  });
  await sleep(250);
  const withFlash = await shot(mid);
  ck('a swap takes the frame in the new hero’s colour',
     flash && brightness(withFlash) > brightness(withMood) + 8,
     'the frame reads ' + brightness(withFlash).toFixed(1) + ' against ' +
     brightness(withMood).toFixed(1));
  await p.evaluate(() => { swapFlash = 0; });
  await sleep(250);

  // --- lowFx: what goes, and what must not ---------------------------------
  const shed = await p.evaluate(async () => {
    const a = window.__game.scene.getScene('delve').air;
    lowFx = true;
    for (let i = 0; i < 8; i++) await new Promise(r => requestAnimationFrame(r));
    const off = { fog: a.fog.visible, motes: a.moteGfx.visible, vig: a.vig.visible,
                  lit: a.litCount };
    lowFx = false;
    for (let i = 0; i < 8; i++) await new Promise(r => requestAnimationFrame(r));
    return { off, on: { fog: a.fog.visible, motes: a.moteGfx.visible,
                        vig: a.vig.visible, lit: a.litCount } };
  });
  ck('lowFx sheds the haze, the ash and the vignette',
     !shed.off.fog && !shed.off.motes && !shed.off.vig &&
     shed.on.fog && shed.on.motes && shed.on.vig,
     JSON.stringify(shed.off) + ' shed, ' + JSON.stringify(shed.on) + ' restored');
  ck('and it keeps the light, which is not decoration', shed.off.lit > 0,
     shed.off.lit + ' lights still drawn with the mood off');

  // --- the governor --------------------------------------------------------
  // Directly, because both of its failure modes are invisible in a picture.
  const gov = await p.evaluate(() => {
    const G = window.__game.scene.getScene('delve').gov.constructor;
    const mk = () => new G({ events: { on() {} } }, 45);
    const feed = (g, ival, work) => {
      for (let i = 0; i < 60; i++) { g.periods.push(ival); g.ivals.push(ival); g.work.push(work); }
    };
    // A screen delivering nothing but 33ms frames. Learned from observation
    // alone the period would BE 33ms and the governor would call it perfect --
    // which is exactly what it did before the cap, sitting at 30fps reporting
    // headroom. No screen this runs on is slower than 60Hz.
    const slow = mk(); feed(slow, 33.3, 3);
    const capped = slow.period();
    const slowCall = slow.decide(false, 13, 8);

    // A 120Hz screen keeping up. The bar has to move with the screen, or the
    // canvas build's bug comes back: a fixed threshold of 11ms is 90fps, which
    // 60Hz hardware cannot reach by definition, so the mood never came back.
    const fast = mk(); feed(fast, 8.3, 3);
    const fastPeriod = fast.period();
    const fastCall = fast.decide(false, 13, 8);

    // CPU-bound: frames arriving on time, but the work over budget. A governor
    // watching only intervals would miss this one entirely.
    const busy = mk(); feed(busy, 16.7, 20);
    const busyCall = busy.decide(false, 13, 8);

    // Restoring: three good windows, and then a fourth is not asked for.
    const back = mk(); back.need = 3;
    let raised = null;
    for (let k = 0; k < 3; k++) { feed(back, 16.6, 2); raised = back.decide(true, 13, 8); }

    // Backing off: a drop that follows a restore closely raises the bar.
    const flappy = mk();
    feed(flappy, 33.3, 3); flappy.decide(false, 13, 8);
    const need1 = flappy.need;
    feed(flappy, 33.3, 3); flappy.decide(false, 13, 8);
    return { capped, slowCall, fastPeriod, fastCall, busyCall, raised,
             need1, need2: flappy.need };
  });
  ck('the display period is capped at 60Hz, not learned from a bad frame rate',
     gov.capped <= 17 && gov.slowCall === 'drop',
     'a screen delivering only 33ms frames reads as a ' + gov.capped +
     'ms period and is told to ' + gov.slowCall);
  ck('and a fast screen sets a faster bar', Math.abs(gov.fastPeriod - 8.3) < 0.2 &&
     gov.fastCall === null,
     '120Hz reads as ' + gov.fastPeriod + 'ms and is left alone');
  ck('work over budget sheds even when frames arrive on time',
     gov.busyCall === 'drop', '20ms of work at a steady 60fps');
  ck('and the mood comes back when there is room', gov.raised === 'raise',
     'restored after three good windows');
  ck('but a device that cannot afford it stops being asked so often',
     gov.need2 > gov.need1, 'the bar went from ' + gov.need1 + ' windows to ' + gov.need2);

  /* And the governor in situ, with nothing held off.
   *
   * The invariant holds on any hardware, which is the point: either this
   * device is keeping up, or the mood has been shed. What must never happen is
   * the state the port actually shipped -- frames being missed, every measure
   * saying so, and lowFx still false.
   */
  await p.goto('http://localhost:' + PORT + '/');
  for (let i = 0; i < 40; i++) {
    await sleep(250);
    const up = await p.evaluate(() => {
      const g = window.__game;
      return !!(g && g.scene.getScene('delve') && g.scene.getScene('delve').scene.isActive());
    }).catch(() => false);
    if (up) break;
  }
  await sleep(12000);
  const live = await p.evaluate(() => {
    const sc = window.__game.scene.getScene('delve');
    return { low: lowFx, stat: sc.gov.stat, need: sc.gov.need };
  });
  const keeping = live.stat && live.stat.p50 <= live.stat.period * 1.25;
  ck('a device that cannot hold the frame ends up with the mood off',
     !!live.stat && (keeping || live.low),
     live.stat ? live.stat.p50 + 'ms frames against a ' + live.stat.period +
       'ms display' + (keeping ? ', keeping up' : ', missing') +
       ' — lowFx ' + live.low : 'the governor never reached a decision');

  ck('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  await p.evaluate(() => { state = 'play'; });
  await p.screenshot({ path: path.join(__dirname, '..', 'air.png') });
  report();
  await b.close(); srv.kill();
  process.exit(fail.length ? 1 : 0);

  function report() {
    console.log('\nPASS ' + pass.length + '\n  ' + pass.join('\n  '));
    console.log('\nFAIL ' + fail.length + (fail.length ? '\n  ' + fail.join('\n  ') : ''));
  }
})();
