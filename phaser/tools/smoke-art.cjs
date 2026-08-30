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

(async () => {
  const forgedDir = path.join(ROOT, 'art', 'bestiary');
  const outDir = path.join(CUSTOM, 'bestiary');
  const made = [];
  try {
    fs.mkdirSync(outDir, { recursive: true });
    // A stand-in for authored art: the forged frame at DOUBLE size, flat
    // magenta so it is unmistakable on screen and in a pixel count. Every
    // pose, or the body flickers between authored and forged as it walks.
    for (const n of NAMES) {
      const src = path.join(forgedDir, KIND + '-' + n + '.png');
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
    ck('authored frames can be dropped in', made.length >= 8,
       made.length + ' poses at 4x under art-custom/bestiary/');

    const packed = execFileSync(process.execPath, [path.join(__dirname, 'pack-atlas.js')],
                                { encoding: 'utf8' });
    ck('the packer takes them and says which are authored',
       /(\d+) authored/.test(packed) && /9 authored/.test(packed),
       packed.trim().split('\n')[0]);

    const man = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'manifest.json'), 'utf8'));
    const key = 'bestiary/' + KIND + '-rest';
    ck('and records what scale each was authored at',
       man.frame_scale && Math.abs(man.frame_scale[key] - 2) < 0.01,
       'frame_scale[' + key + '] = ' + (man.frame_scale || {})[key]);

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
        const sp = sc.pool.find(s => s.visible && s.frame.name === key);
        const forgedSp = other ? sc.pool.find(s => s.visible && /bestiary\//.test(s.frame.name) &&
                                              s.frame.name !== key) : null;
        const tex = window.__game.textures.getFrame('art', key);
        return {
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
         R.none ? '' : 'texture ' + R.texW + 'px at scale ' + R.scale +
                 ' = ' + R.shown + ' world units');
      ck('while forged frames are untouched',
         !R.none && (R.forgedScale === null || Math.abs(R.forgedScale - 0.5) < 0.001),
         R.forgedScale === null ? 'no other body on screen to compare'
           : 'forged texture ' + R.forgedTexW + 'px at scale ' + R.forgedScale);
      ck('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
    }
    await b.close(); srv.kill();
  } finally {
    // Leave the tree as it was found, or the next build ships magenta thralls.
    for (const f of made) fs.rmSync(f, { force: true });
    fs.rmSync(CUSTOM, { recursive: true, force: true });
    execFileSync(process.execPath, [path.join(__dirname, 'pack-atlas.js')], { stdio: 'ignore' });
  }

  const back = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'manifest.json'), 'utf8'));
  ck('and removing them puts the forged art back',
     Object.keys(back.frame_scale || {}).length === 0 &&
     (back.authored || []).length === 0,
     Object.keys(back.frame_scale || {}).length + ' scales, ' +
     (back.authored || []).length + ' authored after cleanup');

  console.log('\nPASS ' + pass.length + '\n  ' + pass.join('\n  '));
  console.log('\nFAIL ' + fail.length + (fail.length ? '\n  ' + fail.join('\n  ') : ''));
  process.exit(fail.length ? 1 : 0);
})();
