#!/usr/bin/env node
/* Can authored art replace forged art, one frame at a time?
 *
 * That is the whole point of art-custom/: replacing 244 frames before anything
 * renders is not a project anyone finishes. Drop in one thrall and the delve
 * should have one authored thrall in it and 243 forged ones, still running.
 *
 * The trap this exists to catch is RESOLUTION. Everything forged is exported
 * at 2x and drawn at 1/2. Authored art has no reason to be at that resolution
 * -- a 4x thrall is a better thrall -- and if nothing accounts for it, that
 * thrall renders at twice the size of the one it replaced and stands a head
 * over the horde. So the test plants a deliberately 4x frame and asserts it
 * comes out the same size on screen as what it replaced.
 *
 * DESKTOP ONLY (Playwright). Run: npm run smoke:art
 */
const { chromium } = require('playwright');
const buildOnce = require('./build-once.cjs');
const { execFileSync } = require('child_process');
const { spawn } = require('child_process');
const { PNG } = require('pngjs');
const fs = require('fs');
const path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pass = [], fail = [];
const ck = (n, ok, note) => (ok ? pass : fail).push((ok ? '' : 'x ') + n + (note ? '  [' + note + ']' : ''));

const ROOT = path.join(__dirname, '..', '..');
const CUSTOM = path.join(ROOT, 'art-custom');
const KIND = 'thrall';
const NAMES = ['rest', 'run-0', 'run-1', 'run-2', 'run-3', 'run-4', 'run-5', 'run-6', 'run-7'];
// Two idle frames the forged bestiary does not have, cut from the rest pose so
// they are exactly 2x it. A pose with no forged counterpart is the case that
// used to fall through the scale table entirely, so the fixture has to include
// one or the check cannot see it.
const IDLES = ['idle-0', 'idle-1'];

(async () => {
  const forgedDir = path.join(ROOT, 'art', 'bestiary');
  const outDir = path.join(CUSTOM, 'bestiary');
  const made = [];

  /* What the tree looked like before this suite touched it.
   *
   * The cleanup used to be `rm -rf art-custom` on the assumption that only
   * this suite ever put anything there. That assumption expired the moment
   * real authored art landed, and the failure mode is a test run silently
   * deleting the artist's work with no diff to notice it by. So: record the
   * baseline, delete only the files this suite wrote, and assert we came back
   * to the baseline rather than to empty.
   */
  const existed = fs.existsSync(CUSTOM);
  const before = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'manifest.json'), 'utf8'));
  const wasScales = Object.keys(before.frame_scale || {}).length;
  const wasAuthored = (before.authored || []).length;

  try {
    fs.mkdirSync(outDir, { recursive: true });
    // A stand-in for authored art: the forged frame at DOUBLE size, flat
    // magenta so it is unmistakable on screen and in a pixel count. Every
    // pose, or the body flickers between authored and forged as it walks.
    for (const n of NAMES.concat(IDLES)) {
      const src = path.join(forgedDir, KIND + '-' +
                            (IDLES.includes(n) ? 'rest' : n) + '.png');
      if (!fs.existsSync(src)) continue;
      const f = PNG.sync.read(fs.readFileSync(src));
      const big = new PNG({ width: f.width * 2, height: f.height * 2 });
      for (let y = 0; y < big.height; y++) {
        for (let x = 0; x < big.width; x++) {
          const s = ((f.width * (y >> 1)) + (x >> 1)) << 2;
          const d = ((big.width * y) + x) << 2;
          big.data[d] = 255; big.data[d + 1] = 0; big.data[d + 2] = 255;
          big.data[d + 3] = f.data[s + 3];       // keep the silhouette
        }
      }
      const to = path.join(outDir, KIND + '-' + n + '.png');
      fs.writeFileSync(to, PNG.sync.write(big));
      made.push(to);
    }
    ck('authored frames can be dropped in', made.length >= 10,
       made.length + ' poses at 4x under art-custom/bestiary/');

    const packed = execFileSync(process.execPath, [path.join(__dirname, 'pack-atlas.js')],
                                { encoding: 'utf8' });
    const nAuth = (/(\d+) authored/.exec(packed) || [])[1];
    ck('the packer takes them and says which are authored',
       nAuth !== undefined && +nAuth === wasAuthored + made.length,
       packed.trim().split('\n')[0] + ' (' + wasAuthored + ' before + ' + made.length + ' planted)');

    const man = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'manifest.json'), 'utf8'));
    const key = 'bestiary/' + KIND + '-rest';
    ck('and records what scale each was authored at',
       man.frame_scale && Math.abs(man.frame_scale[key] - 2) < 0.01,
       'frame_scale[' + key + '] = ' + (man.frame_scale || {})[key]);

    /* Every authored frame stands where the forged one stood.
     *
     * Not a repeat of the scale check above: that one asks whether a 4x
     * texture is DRAWN at a quarter size, which it was, all along. This asks
     * where the figure inside it ends up, and the answer used to be: taller
     * and lower. Measured on the imported art, the husk stood 27% taller than
     * the husk that walks and its feet fell 3.5 world units -- so it grew and
     * sank every time it stopped moving, and shrank and rose when it charged.
     *
     * Both come from the same mistake, fitting the import to the forged
     * CANVAS. A forged body fills 47-83% of its square frame; the rest is
     * margin, and matching the margin is not matching the body. So the figure
     * is measured, not the frame it sits in.
     */
    const bbox = png => {
      let x0 = png.width, y0 = png.height, x1 = -1, y1 = -1;
      for (let y = 0; y < png.height; y++) {
        for (let x = 0; x < png.width; x++) {
          if (png.data[((png.width * y) + x) * 4 + 3] > 8) {
            if (x < x0) x0 = x; if (x > x1) x1 = x;
            if (y < y0) y0 = y; if (y > y1) y1 = y;
          }
        }
      }
      return { y1, h: y1 - y0 + 1, empty: x1 < 0 };
    };
    const off = [];
    let checked = 0;
    for (const nm of (man.authored || [])) {
      const dir = nm.slice(0, nm.indexOf('/')), base = nm.slice(nm.indexOf('/') + 1);
      const custom = path.join(CUSTOM, dir, base + '.png');
      // The same pose when the forged art has one, else the kind's rest pose --
      // which is the importer's own rule, so the two agree by construction.
      const same = path.join(ROOT, 'art', dir, base + '.png');
      const rest = path.join(ROOT, 'art', dir, base.split('-')[0] + '-rest.png');
      const ref = fs.existsSync(same) ? same : fs.existsSync(rest) ? rest : null;
      if (!ref || !fs.existsSync(custom)) continue;
      const F = PNG.sync.read(fs.readFileSync(ref));
      const A = PNG.sync.read(fs.readFileSync(custom));
      const fb = bbox(F), ab = bbox(A);
      if (fb.empty || ab.empty) continue;
      const k = (man.frame_scale || {})[nm] || 1;
      // World units: forged is drawn at 1/2, authored at 1/(2k). Feet measured
      // from the sprite's centre, since that is what the game positions by.
      const fFeet = (fb.y1 + 1) / 2 - F.height / 4;
      const aFeet = (ab.y1 + 1) / (2 * k) - A.height / (4 * k);
      const fH = fb.h / 2, aH = ab.h / (2 * k);
      checked++;
      if (Math.abs(aFeet - fFeet) > 1) {
        off.push(nm + ': feet at ' + aFeet.toFixed(1) + ' against ' + fFeet.toFixed(1));
      } else if (Math.abs(aH - fH) > Math.max(1.5, fH * 0.08)) {
        off.push(nm + ': stands ' + aH.toFixed(0) + ' tall against ' + fH.toFixed(0));
      }
    }
    ck('and every authored figure is the size of the forged one, on the same feet',
       checked > 0 && off.length === 0,
       checked ? checked + ' checked' + (off.length ? ': ' + off.slice(0, 4).join('; ') : '')
               : 'nothing authored to check — the fixture should have planted some');

    // src/ is the thing under test; public/bundle.js is a souvenir of it.
    buildOnce();
    const PORT = process.env.PORT || '8220';
    const srv = spawn(process.execPath, [path.join(__dirname, 'serve.js')],
                      { env: { ...process.env, PORT }, stdio: 'ignore' });
    await sleep(800);
    const b = await chromium.launch();
    const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.goto('http://localhost:' + PORT + '/?nogov');
    let booted = false;
    for (let i = 0; i < 40 && !booted; i++) {
      await sleep(250);
      booted = await p.evaluate(() => {
        const g = window.__game;
        return !!(g && g.scene.getScene('delve') && g.scene.getScene('delve').scene.isActive());
      }).catch(() => false);
    }
    ck('the delve still boots with mixed art', booted);
    if (booted) {
      await sleep(1500);
      const R = await p.evaluate(async ([kind, key]) => {
        const sc = window.__game.scene.getScene('delve');
        state = 'over';
        const live = enemies.filter(e => e.hp > 0);
        const one = live.find(e => e.kind === kind);
        const other = live.find(e => e.kind !== kind);
        if (!one) return { none: true, kinds: [...new Set(live.map(e => e.kind))] };
        // Park them side by side so the comparison is of art, not of pose.
        one.pace = 0; one.braced = false;
        for (let i = 0; i < 8; i++) await new Promise(r => requestAnimationFrame(r));
        // Matched on the KIND, not on one frame name: a parked body wears
        // whichever pose the scene picks for standing still, and every pose of
        // this kind is planted at the same scale, so any of them answers the
        // question. Pinning it to '-rest' quietly stopped matching anything at
        // all the day standing still started animating.
        const mine = new RegExp('^bestiary/' + kind + '-');
        const sp = sc.pool.find(s => s.visible && mine.test(s.frame.name));
        // "Forged" means the packer recorded no scale for it -- not merely
        // "some other kind". There is real authored art in the tree now, and
        // comparing against it proves nothing about frames nobody replaced.
        const forgedSp = sc.pool.find(s => s.visible && /^bestiary\//.test(s.frame.name) &&
                                      !mine.test(s.frame.name) &&
                                      sc.frameScale[s.frame.name] === undefined);
        const tex = sp ? window.__game.textures.getFrame('art', sp.frame.name) : null;
        return {
          worn: sp ? sp.frame.name : null,
          scale: sp ? +sp.scaleX.toFixed(4) : null,
          shown: sp ? Math.round(sp.displayWidth) : null,
          texW: tex ? tex.width : null,
          forgedScale: forgedSp ? +forgedSp.scaleX.toFixed(4) : null,
          forgedShown: forgedSp ? Math.round(forgedSp.displayWidth) : null,
          forgedTexW: forgedSp ? window.__game.textures.getFrame('art', forgedSp.frame.name).width : null,
          table: sc.frameScale[key]
        };
      }, [KIND, key]);
      ck('the game reads the scale table', !R.none && R.table === 2,
         R.none ? 'no ' + KIND + ' alive (' + (R.kinds || []).join(',') + ')'
                : 'frameScale = ' + R.table);
      // The point of the whole mechanism: a 4x frame is drawn at 1/4, so it
      // occupies the same world space as the 2x frame it replaced.
      ck('and a 4x frame draws at the size of the 2x one it replaced',
         !R.none && R.scale !== null && Math.abs(R.scale - 0.25) < 0.001 &&
         Math.abs(R.shown - R.texW / 4) < 2,
         R.none ? '' : (R.worn || '?') + ': texture ' + R.texW + 'px at scale ' +
                 R.scale + ' = ' + R.shown + ' world units');
      ck('while frames nobody replaced are untouched',
         !R.none && (R.forgedScale === null || Math.abs(R.forgedScale - 0.5) < 0.001),
         R.forgedScale === null ? 'no unreplaced body on screen to compare'
           : 'forged texture ' + R.forgedTexW + 'px at scale ' + R.forgedScale);
      /* Idle: does a body that has stopped moving still move?
       *
       * The gait runs off DISTANCE TRAVELLED, so a standing body has nothing
       * advancing it and every stopped body in a room held one frozen frame.
       * Sampled across time with the same body object each call, because the
       * per-body phase is memoised on the body -- a fresh object every sample
       * would draw a fresh phase and the cycle would look like noise.
       */
      const D = await p.evaluate(async ([kind]) => {
        const sc = window.__game.scene.getScene('delve');
        // The core is not stepping (state is 'over'), so nothing puts these
        // back: park every body of the kind and let the draw loop run.
        for (const e of enemies) {
          if (e.kind === kind && e.hp > 0) { e.pace = 0; e.braced = false; e.calcify = 0; }
        }
        for (let i = 0; i < 6; i++) await new Promise(r => requestAnimationFrame(r));
        const body = k => ({ kind: k, pace: 0, braced: false, calcify: 0, gait: 0 });
        // Eight samples over two full loops of a two-frame cycle.
        const across = (e, mut) => {
          if (mut) Object.assign(e, mut);
          const out = [];
          for (let i = 0; i < 8; i++) out.push(sc.bodyFrame(e, i * 420 * 0.5));
          return [...new Set(out)];
        };
        const restKey = 'bestiary/' + kind + '-rest';
        const idleKey = 'bestiary/' + kind + '-idle-0';
        const wF = k => { const f = sc.textures.getFrame('art', k); return f ? f.width : 0; };
        return {
          table: sc.idleN['bestiary/' + kind] || 0,
          idle: across(body(kind)),
          none: across(body('nosuchkind')),
          stone: across(body(kind), { calcify: 1 }),
          moving: across(body(kind), { calcify: 0, pace: 1, gait: 0 }),
          restW: wF(restKey) * sc.artScale(restKey),
          idleW: wF(idleKey) * sc.artScale(idleKey),
          live: (() => {
            const s = sc.pool.find(sp => sp.visible && /-idle-\d+$/.test(sp.frame.name));
            return s ? s.frame.name : null;
          })()
        };
      }, [KIND]);

      ck('the scene counts the idle frames it has',
         D.table === 2, 'idleN[bestiary/' + KIND + '] = ' + D.table);
      ck('a standing body with idle art cycles instead of freezing',
         D.idle.length === 2 && D.idle.every(n => /-idle-\d+$/.test(n)),
         D.idle.join(' '));
      ck('a kind with no idle art still holds its one rest frame',
         D.none.length === 1 && D.none[0] === 'bestiary/nosuchkind-rest',
         D.none.join(' '));
      ck('a calcifying body is held still, because stone does not breathe',
         D.stone.length === 1 && /-rest$/.test(D.stone[0]), D.stone.join(' '));
      ck('and moving still walks off the gait, not the clock',
         D.moving.length === 1 && /-run-\d+$/.test(D.moving[0]), D.moving.join(' '));
      // The regression this pair exists for: a wholly new pose has no forged
      // frame of the same name, so it used to miss the scale table entirely
      // and stand at twice the height of the body it belongs to -- but only
      // while stopped, so it grew when it stood and shrank when it charged.
      ck('an idle frame draws at the size of the body it belongs to',
         D.restW > 0 && Math.abs(D.idleW - D.restW) < 1.5,
         'rest ' + D.restW + ' world units, idle ' + D.idleW);
      ck('and the draw loop actually puts one on screen',
         !!D.live, D.live || 'no body on screen wearing an idle frame');

      ck('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
    }
    await b.close(); srv.kill();
  } finally {
    // Leave the tree as it was found, or the next build ships magenta thralls.
    // Only what this suite wrote: anything else under art-custom/ is somebody's
    // actual art and is none of this test's business.
    for (const f of made) fs.rmSync(f, { force: true });
    if (!existed) fs.rmSync(CUSTOM, { recursive: true, force: true });
    execFileSync(process.execPath, [path.join(__dirname, 'pack-atlas.js')], { stdio: 'ignore' });
  }

  const back = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'manifest.json'), 'utf8'));
  ck('and removing them puts the tree back as it was found',
     Object.keys(back.frame_scale || {}).length === wasScales &&
     (back.authored || []).length === wasAuthored,
     Object.keys(back.frame_scale || {}).length + '/' + wasScales + ' scales, ' +
     (back.authored || []).length + '/' + wasAuthored + ' authored after cleanup');

  console.log('\nPASS ' + pass.length + '\n  ' + pass.join('\n  '));
  console.log('\nFAIL ' + fail.length + (fail.length ? '\n  ' + fail.join('\n  ') : ''));
  process.exit(fail.length ? 1 : 0);
})();
