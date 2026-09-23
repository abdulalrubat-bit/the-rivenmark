#!/usr/bin/env node
/* Screen space, at a phone's pixel ratio.
 *
 * The game is sized in device pixels and the camera zooms by the ratio, so a
 * world unit stays a CSS pixel. Two things that zoom does NOT take care of by
 * itself, and which every other in-delve suite could not see because they all
 * run at a ratio of 1:
 *
 *   - Phaser's pointer.x/y are game coordinates, i.e. device pixels. Fed to
 *     the core raw, the stick -- tuned in CSS pixels -- went to full throttle
 *     at a third of its throw on a DPR-3 phone.
 *   - scrollFactor(0) objects are still zoomed, about the MIDDLE of the frame.
 *     Laid out in CSS pixels with nothing else done, the minimap, the stick
 *     ring and the gate arrow were thrown clean off the edge of the phone.
 *
 * WHAT WOULD MAKE THIS VACUOUS. A check at one ratio only proves the numbers
 * agree with themselves, so every measurement is taken at 1 and at 3 and the
 * two are held against each other and against the thumb. Where a thing lands
 * on screen is projected with the camera's own origin, zoom and size, read
 * live -- and the premise the projection rests on (a CSS point P lands at P *
 * dpr) is the same one the fix is built on, so if Phaser ever stops zooming
 * scrollFactor(0) objects this suite fails loudly rather than passing on a
 * formula nobody re-checked.
 */
const { chromium } = require('playwright');
const buildOnce = require('./build-once.cjs');
const { spawn } = require('child_process');
const path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pass = [], fail = [];
const ck = (n, ok, note) => (ok ? pass : fail).push((ok ? '' : 'x ') + n + (note ? '  [' + note + ']' : ''));

const VIEW = { width: 390, height: 844 };
const THUMB = { x: 200, y: 600 }, THROW = 40;     // CSS pixels

/* Where a scrollFactor(0) object's local point lands, in DEVICE pixels, under
 * the main camera. Phaser scales it about the camera's origin. */
const probe = () => {
  const sc = __game.scene.getScene('delve');
  const c = sc.cameras.main;
  const ox = c.width * c.originX, oy = c.height * c.originY;
  const at = (obj, lx, ly) => ({ x: ox + (obj.x + lx - ox) * c.zoomX,
                                 y: oy + (obj.y + ly - oy) * c.zoomY });
  const box = minimapBox();
  const mid = at(sc.overlay.g, box.x + box.s / 2, box.y + box.s / 2);
  const ring = at(sc.stickGfx, stick.ox, stick.oy);
  const v = c.worldView;
  return { mag: stick.mag, active: stick.active, ox: stick.ox, oy: stick.oy,
           mid, box: { x: box.x + box.s / 2, y: box.y + box.s / 2 }, ring,
           w: c.width, h: c.height, view: { w: v.width, h: v.height } };
};

(async () => {
  buildOnce();
  const PORT = process.env.PORT || '8291';
  const srv = spawn(process.execPath, [path.join(__dirname, 'serve.js')],
                    { env: { ...process.env, PORT }, stdio: 'ignore' });
  await sleep(800);
  const b = await chromium.launch();
  const errs = [];
  const got = {};

  try {
    for (const dpr of [1, 3]) {
      const ctx = await b.newContext({ viewport: VIEW, deviceScaleFactor: dpr,
                                       isMobile: true, hasTouch: true });
      const p = await ctx.newPage();
      p.on('pageerror', e => errs.push(e.message));
      p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
      await p.goto('http://localhost:' + PORT + '/?nogate&nogov');
      await p.waitForFunction(() => window.__game && __game.scene.getScene('delve') &&
                              __game.scene.getScene('delve').overlay && state === 'play',
                              null, { timeout: 30000 });
      await sleep(600);
      await p.mouse.move(THUMB.x, THUMB.y); await p.mouse.down();
      await p.mouse.move(THUMB.x + THROW / 2, THUMB.y);
      await p.mouse.move(THUMB.x + THROW, THUMB.y);
      await sleep(150);
      got[dpr] = await p.evaluate(probe);
      await p.mouse.up();
      await ctx.close();
    }

    const one = got[1], three = got[3];
    ck('a drag takes the stick at DPR 3', three.active === true);
    ck('the stick is anchored where the thumb went down, in CSS pixels',
       Math.abs(three.ox - THUMB.x) < 1 && Math.abs(three.oy - THUMB.y) < 1,
       'origin ' + three.ox.toFixed(0) + ',' + three.oy.toFixed(0));
    ck('and the same throw is the same throttle at DPR 1 and DPR 3',
       one.mag > 0.1 && one.mag < 0.95 && Math.abs(one.mag - three.mag) < 0.02,
       'DPR 1 ' + one.mag.toFixed(2) + ', DPR 3 ' + three.mag.toFixed(2));

    for (const dpr of [1, 3]) {
      const g = got[dpr];
      const onPhone = pt => pt.x >= 0 && pt.x <= g.w && pt.y >= 0 && pt.y <= g.h;
      ck('DPR ' + dpr + ': the stick ring is drawn under the thumb',
         Math.abs(g.ring.x - THUMB.x * dpr) < 2 && Math.abs(g.ring.y - THUMB.y * dpr) < 2,
         'at ' + g.ring.x.toFixed(0) + ',' + g.ring.y.toFixed(0) + ' want ' +
         THUMB.x * dpr + ',' + THUMB.y * dpr);
      ck('DPR ' + dpr + ': the minimap is on the phone, where its CSS box says',
         onPhone(g.mid) && Math.abs(g.mid.x - g.box.x * dpr) < 2 &&
           Math.abs(g.mid.y - g.box.y * dpr) < 2,
         'centre ' + g.mid.x.toFixed(0) + ',' + g.mid.y.toFixed(0) + ' want ' +
         (g.box.x * dpr).toFixed(0) + ',' + (g.box.y * dpr).toFixed(0));
      // The gate arrow and the culling both measure the screen off worldView;
      // that is only right if it is the phone's CSS size.
      ck('DPR ' + dpr + ': the camera sees one phone of world, in CSS pixels',
         Math.abs(g.view.w - VIEW.width) < 2 && Math.abs(g.view.h - VIEW.height) < 2,
         g.view.w.toFixed(0) + 'x' + g.view.h.toFixed(0));
    }
    ck('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  } catch (e) {
    ck('the suite got all the way through', false, e.message.split('\n')[0]);
  }

  console.log('\nPASS ' + pass.length + '\n  ' + pass.join('\n  '));
  console.log('\nFAIL ' + fail.length + (fail.length ? '\n  ' + fail.join('\n  ') : ''));
  await b.close(); srv.kill();
  process.exit(fail.length ? 1 : 0);
})();
