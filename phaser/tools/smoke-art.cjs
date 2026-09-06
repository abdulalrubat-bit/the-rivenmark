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
/* Idle cycles the forged bestiary does not have.
 *
 * A pose with no forged counterpart is the case that used to fall through the
 * scale table entirely, so the fixture has to contain one or the check cannot
 * see it. Three frames rather than two, because a two-frame cycle plays the
 * same forwards and backwards and so cannot exercise the there-and-back
 * decision at all.
 *
 * The frames are the rest silhouette slid sideways by a set number of pixels,
 * which is what makes this a test rather than a hope: pairwise difference then
 * follows from the shifts, so the class of each cycle is KNOWN rather than
 * whatever the forged run poses happen to work out to.
 *
 *   thrall  0, 5, 10 -- walks away and never comes back. The wrap is the
 *                       largest step in it: an open path, to be played there
 *                       and back.
 *   breaker 0, 9, 5  -- goes out and most of the way home. The wrap is not the
 *                       largest step: a ring, to be played round.
 */
const CYCLES = [{ kind: 'thrall', shifts: [0, 5, 10], open: true },
                { kind: 'breaker', shifts: [0, 9, 5], open: false }];
// A wind-up is not a loop: it runs once, driven by how far through the cast
// the body is. Four frames so the quarters of a cast map to distinct frames
// and an off-by-one in the mapping cannot hide.
const CAST_N = 4;
// And a death, on a kind that has one, so the fixture can watch a body fall
// over and then go. Three frames: enough for a start, a middle and a last one
// that has to be held rather than wrapped round.
const DIE_N = 3;
// A cycle long enough for the pacing rule to clamp, planted rather than hoped
// for: it used to measure whatever authored art happened to be in the tree,
// and reported "nothing to measure" the day that art was dropped.
const LONG = { kind: 'gorger', n: 10 };

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
    // The forged frame at DOUBLE size, flat magenta so it is unmistakable on
    // screen and in a pixel count, slid `shift` pixels right.
    const plant = (kind, pose, from, shift) => {
      const src = path.join(forgedDir, kind + '-' + from + '.png');
      if (!fs.existsSync(src)) return;
      const f = PNG.sync.read(fs.readFileSync(src));
      const big = new PNG({ width: f.width * 2, height: f.height * 2 });
      for (let y = 0; y < big.height; y++) {
        for (let x = 0; x < big.width; x++) {
          const sx = x - (shift || 0);
          const d = ((big.width * y) + x) << 2;
          big.data[d] = 255; big.data[d + 1] = 0; big.data[d + 2] = 255;
          if (sx < 0 || sx >= big.width) { big.data[d + 3] = 0; continue; }
          const s = ((f.width * (y >> 1)) + (sx >> 1)) << 2;
          big.data[d + 3] = f.data[s + 3];       // keep the silhouette
        }
      }
      const to = path.join(outDir, kind + '-' + pose + '.png');
      fs.writeFileSync(to, PNG.sync.write(big));
      made.push(to);
    };
    for (const n of NAMES) plant(KIND, n, n, 0);
    for (const c of CYCLES) {
      c.shifts.forEach((sh, i) => plant(c.kind, 'idle-' + i, 'rest', sh));
    }
    for (let i = 0; i < CAST_N; i++) plant(KIND, 'cast-' + i, 'rest', 0);
    for (let i = 0; i < DIE_N; i++) plant(KIND, 'die-' + i, 'rest', i * 4);
    for (let i = 0; i < LONG.n; i++) plant(LONG.kind, 'idle-' + i, 'rest', i);
    ck('authored frames can be dropped in', made.length >= 32,
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
      /* Frame 0 of a cycle, and any frame that is not part of one.
       *
       * A cycle registers on its FIRST frame -- the one standing in for the
       * pose the body was already in -- and the frames after it move because
       * the artist moved them. A death topple sinks as it falls and a takeoff
       * leaves the ground entirely; holding every frame to the foot line would
       * either fail on honest art or, worse, pass by forcing the importer to
       * flatten the motion out of it.
       */
      if (/-[1-9]\d*$/.test(nm)) continue;
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
    // The classifier, on two cycles whose class was built in rather than hoped
    // for. Getting this wrong either way is visible every time a body stands
    // still: a ring played there-and-back runs the motion backwards, and an
    // open path played round snaps at the wrap once a cycle.
    const pong = new Set(man.idle_pingpong || []);
    for (const c of CYCLES) {
      ck('a ' + (c.open ? 'breath is played there and back' : 'true loop is played round'),
         pong.has('bestiary/' + c.kind) === c.open,
         'bestiary/' + c.kind + ' shifts ' + c.shifts.join(',') + ' -> ' +
         (pong.has('bestiary/' + c.kind) ? 'there and back' : 'looping'));
    }

    ck('and every authored cycle starts the size of the forged one, on its feet',
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
        // scaleY, not scaleX: a standing body breathes by widening, so scaleX
        // carries a few per cent of breath on top of the draw scale and is not
        // the number this is about. scaleY is the draw scale, untouched.

        // "Forged" means the packer recorded no scale for it -- not merely
        // "some other kind". There is real authored art in the tree now, and
        // comparing against it proves nothing about frames nobody replaced.
        //
        // Falling back to a named frame rather than reporting "nothing on
        // screen to compare": which kinds a delve happens to spawn is not
        // this suite's subject, and a check that quietly stops checking on
        // some seeds is worse than no check.
        let forgedSp = sc.pool.find(s => s.visible && /^bestiary\//.test(s.frame.name) &&
                                    !mine.test(s.frame.name) &&
                                    sc.frameScale[s.frame.name] === undefined);
        let forgedName = forgedSp && forgedSp.frame.name;
        let forgedScale = forgedSp && +forgedSp.scaleY.toFixed(4);
        if (!forgedName) {
          forgedName = Object.keys(sc.textures.get('art').frames)
                             .find(n => /^bestiary\/.*-rest$/.test(n) &&
                                        sc.frameScale[n] === undefined);
          forgedScale = forgedName ? +sc.artScale(forgedName).toFixed(4) : null;
        }
        const tex = sp ? window.__game.textures.getFrame('art', sp.frame.name) : null;
        return {
          worn: sp ? sp.frame.name : null,
          scale: sp ? +sp.scaleY.toFixed(4) : null,
          shown: sp ? Math.round(sp.frame.width * sp.scaleY) : null,
          texW: tex ? tex.width : null,
          forgedScale,
          forgedName,
          forgedTexW: forgedName ? window.__game.textures.getFrame('art', forgedName).width : null,
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
         !R.none && R.forgedScale !== null && Math.abs(R.forgedScale - 0.5) < 0.001,
         R.forgedScale === null ? 'no unreplaced frame in the atlas at all'
           : R.forgedName + ', ' + R.forgedTexW + 'px at scale ' + R.forgedScale);
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
        /* Sample the real thing finely and watch what it does.
         *
         * Every number below -- which frame comes next, how long each is held,
         * how long a full cycle takes -- is READ OFF idleFrame rather than
         * recomputed from the same formula it uses. A test that recalculates
         * the implementation's arithmetic only proves the arithmetic was typed
         * twice.
         */
        const runs = base => {
          const e = body('x');
          e.idlePhase = 0;                 // or the walk starts mid-stride
          const out = [];
          for (let t = 0; t <= 14000; t += 5) {
            const i = +sc.idleFrame(base, e, t).replace(/^.*-/, '');
            if (out.length && out[out.length - 1].i === i) out[out.length - 1].ms += 5;
            else out.push({ i, ms: 5 });
          }
          return out;
        };
        const r = runs('bestiary/' + kind);
        const walk = r.slice(0, 8).map(x => x.i);
        // A cycle long enough to be clamped by the pacing rule, which the
        // planted three-frame ones are not. Whatever real art has one.
        // cycleN is keyed by name-and-pose ('bestiary/shaman-idle'); idleFrame
        // takes the name and appends the pose itself.
        const longKey = Object.keys(sc.cycleN).find(b => /-idle$/.test(b) && sc.cycleN[b] >= 10);
        const longBase = longKey ? longKey.replace(/-idle$/, '') : null;
        const lr = longBase ? runs(longBase) : null;
        // Held time per frame, off the middle of the sampling window so a
        // clipped first or last run cannot skew it.
        const mid = lr ? lr.slice(1, -1).map(x => x.ms).sort((a, b) => a - b) : null;
        // One full cycle: how many frames before the index sequence repeats.
        let longPeriod = 0;
        if (lr) {
          const seq = lr.slice(1).map(x => x.i);
          for (let p = 2; p <= seq.length / 2; p++) {
            let ok = true;
            for (let i = 0; i + p < seq.length && ok; i++) ok = seq[i] === seq[i + p];
            if (ok) { longPeriod = p; break; }
          }
        }
        /* The wind-up, walked from its start to the blow.
         *
         * chanting counts DOWN from CHANT_WIND, so this is a body getting
         * closer to casting, and the frame it wears has to move with it. The
         * last frame must land ON the blow -- the tell is the whole point of a
         * 1.15s wind-up you are meant to see coming and interrupt.
         */
        const wind = body(kind);
        wind.pace = 0;
        const castWalk = [];
        for (let i = 0; i < 8; i++) {
          wind.chanting = CHANT_WIND * (1 - i / 8);
          castWalk.push(sc.bodyFrame(wind, 0));
        }
        // A hair before the blow, not on it: the core fires the spell as
        // chanting reaches zero, so zero is already the far side of the cast.
        // This is the sample that pins the LAST frame to the moment it lands --
        // a cast whose final pose never reaches the screen is a tell that
        // tells you nothing.
        wind.chanting = 0.0001;
        const atTheBlow = sc.bodyFrame(wind, 0);
        // A body wound BACK UP past its own start (what a null zone does)
        // must not run off the front of the cycle.
        wind.chanting = CHANT_WIND * 1.6;
        const overwound = sc.bodyFrame(wind, 0);
        // And a body not casting at all is back to standing.
        wind.chanting = 0;
        const notCasting = sc.bodyFrame(wind, 0);
        /* Dying, watched from the killing blow.
         *
         * The core has no death event and never removes a dead body from
         * `enemies` -- it just stops treating it as alive -- so the renderer
         * notices, times the fall itself, and then drops the body. Sampled
         * through the whole fall and past the end of it.
         */
        /* Dying, watched from the killing blow.
         *
         * deathPose runs off the wall clock rather than a passed-in time, so
         * the walk is sampled by moving the body's OWN start time backwards --
         * which is what the renderer sees when a body has been dead for that
         * long, and avoids waiting half a second in a test.
         */
        const dead = body(kind);
        dead.hp = 0;
        sc.showBody(dead);                       // stamps dieAt
        const born = dead.dieAt;
        const dieWalk = [], dieShown = [];
        for (let i = 0; i <= 6; i++) {
          dead.dieAt = born - 480 * (i / 6) - (i === 6 ? 2 : 0);
          const d = deathPose(dead);
          dieShown.push(sc.showBody(dead));
          dieWalk.push(d && !d.done
            ? [+d.rot.toFixed(3), +d.alpha.toFixed(2)] : null);
        }
        // A kind with no die ART still falls over -- the topple is a
        // transform, so it needs nothing drawn for it.
        const plain = body('nosuchkind');
        plain.hp = 0;
        const plainShown = sc.showBody(plain);
        const plainFrame = sc.bodyFrame(plain, 0);
        // And a body that comes back does not inherit a stale clock.
        dead.hp = 10;
        const revived = sc.showBody(dead);
        const restKey = 'bestiary/' + kind + '-rest';
        const idleKey = 'bestiary/' + kind + '-idle-0';
        const wF = k => { const f = sc.textures.getFrame('art', k); return f ? f.width : 0; };
        return {
          table: sc.cycleN['bestiary/' + kind + '-idle'] || 0,
          walk,
          castWalk: castWalk.map(n => n.replace('bestiary/' + kind + '-', '')),
          atTheBlow: atTheBlow.replace('bestiary/' + kind + '-', ''),
          overwound: overwound.replace('bestiary/' + kind + '-', ''),
          notCasting: notCasting.replace('bestiary/' + kind + '-', ''),
          castN: sc.cycleN['bestiary/' + kind + '-cast'] || 0,
          dieN: sc.cycleN['bestiary/' + kind + '-die'] || 0,
          dieWalk, dieShown, plainShown, revived,
          plainFrame: plainFrame.replace('bestiary/', ''),
          revivedClock: dead.dieAt === undefined,
          longBase, longPeriod,
          longMs: mid && mid.length ? mid[mid.length >> 1] : null,
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
         D.table === 3, 'cycleN[bestiary/' + KIND + '-idle] = ' + D.table);
      ck('a standing body with idle art cycles instead of freezing',
         D.idle.length === 3 && D.idle.every(n => /-idle-\d+$/.test(n)),
         D.idle.join(' '));
      // 0,1,2,1 -- not 0,1,2,0. The frame after the far end is the one before
      // it, which is what "there and back" means and what a plain modulo does
      // not do.
      ck('and a breath comes back the way it went',
         D.walk.join(' ') === '0 1 2 1 0 1 2 1',
         'frame indices over one period: ' + D.walk.join(' '));
      // A ten-frame breath at a two-frame breath's pace is seven and a half
      // seconds long. The cycle duration is what is held constant, not the
      // frame duration, so more frames buy smoothness rather than torpor.
      ck('and a long cycle runs faster so the breath stays a breath',
         D.longMs !== null && D.longPeriod > 0 &&
         D.longPeriod * D.longMs > 2000 && D.longPeriod * D.longMs < 3600,
         D.longMs === null ? 'no ten-frame cycle in the tree to measure'
           : D.longBase + ': a period of ' + D.longPeriod + ' frames held ' +
             D.longMs + 'ms each = ' +
             (D.longPeriod * D.longMs / 1000).toFixed(1) + 's a breath');
      ck('the scene counts a wind-up like any other cycle',
         D.castN === 4, 'cycleN[bestiary/' + KIND + '-cast] = ' + D.castN);
      // Nine samples across a four-frame cast: 0,0,1,1,2,2,3,3 and the last
      // one exactly on the blow. Not a clock -- move the timer and the frame
      // moves with it, which is what makes the animation the tell.
      ck('a wind-up plays by how far through the cast it is',
         D.castWalk.join(' ') === 'cast-0 cast-0 cast-1 cast-1 cast-2 cast-2 cast-3 cast-3',
         D.castWalk.join(' '));
      ck('and the last frame is still on screen as the blow lands',
         D.atTheBlow === 'cast-3', D.atTheBlow);
      ck('and a caster wound back up does not run off the front of it',
         D.overwound === 'cast-0', D.overwound);
      ck('while a body that is not casting is back to standing',
         /^idle-\d+$/.test(D.notCasting), D.notCasting);

      // It topples, monotonically, and comes to rest short of flat.
      const rots = D.dieWalk.filter(Boolean).map(w => w[0]);
      ck('a body falls over instead of being deleted',
         rots.length >= 6 && rots[0] === 0 &&
         rots.every((r, i) => i === 0 || r > rots[i - 1]) &&
         rots[rots.length - 1] > 0.9 && rots[rots.length - 1] <= 1.15,
         'tilt over the fall: ' + rots.join(' '));
      // And fades late: a body dissolving as it starts to fall reads as a
      // summon being dismissed, not as something being killed.
      const alphas = D.dieWalk.filter(Boolean).map(w => w[1]);
      ck('and holds its colour until it is most of the way down',
         alphas[0] === 1 && alphas[2] === 1 && alphas[alphas.length - 1] < 0.5,
         'alpha over the fall: ' + alphas.join(' '));
      // Drawn for exactly as long as the fall, then gone -- a floor of corpses
      // is a different game.
      ck('and is drawn until it lands, then not after',
         D.dieShown.slice(0, 6).every(Boolean) && D.dieShown[6] === false,
         'shown at each sample: ' + D.dieShown.join(' '));
      ck('while a kind with no death art falls over all the same',
         D.plainShown === true && /-rest$/.test(D.plainFrame),
         'shown ' + D.plainShown + ' wearing ' + D.plainFrame);
      ck('and a body brought back does not carry a stale death clock',
         D.revived === true && D.revivedClock,
         'shown ' + D.revived + ', clock cleared ' + D.revivedClock);

      /* Flinching. A struck body should be shoved AWAY from what hit it, out
       * fast and back slower, and the FLINCH itself must never move the body --
       * a renderer that quietly moved things would put a hitbox somewhere the
       * player cannot see.
       *
       * The recoil is a different thing and is not the renderer's: the weight
       * pass gives every unbraced hit a real knock through damageEnemy, so a
       * struck body genuinely does end up somewhere else. This fixture used to
       * assert the opposite -- that damageEnemy left the body where it stood --
       * which was true when it was written and has been false since the weight
       * pass shipped, so it failed on every build for reasons that had nothing
       * to do with art. Both halves are checked now, separately, because they
       * are separate claims: the offset is a drawing, the knock is the world.
       */
      const D2 = await p.evaluate(() => {
        const e = { x: 100, y: 100, r: 20, hitFlash: 0.12, hitX: 1, hitY: 0 };
        const walk = [1, 0.66, 0.4, 0.1, 0].map(f => {
          e.hitFlash = 0.12 * f;
          const o = flinchOffset(e);
          return o ? +o.x.toFixed(2) : 0;
        });
        // Away from the blow, whichever side it came from -- sampled AT THE
        // PEAK. Sampled at the start it is zero on both sides, which is true
        // and says nothing.
        const back = { x: 100, y: 100, r: 20, hitFlash: 0.12 * 0.66, hitX: -1, hitY: 0 };
        // A blow with no recorded source flashes but does not flinch.
        const none = { x: 100, y: 100, r: 20, hitFlash: 0.12 };
        // Read through a guard, not straight off the result. A flinchOffset
        // that returns null when it should not is exactly the regression this
        // exists to catch, and reading .x off it throws -- which aborts the
        // run and diagnoses nothing instead of failing the one wrong check.
        const bo = flinchOffset(back);

        /* And the whole way through, from a blow landing to a body flinching.
         *
         * Everything above builds its own body with hitX already set, which
         * tests the flinch and nothing about how a body comes to know which
         * way it was hit. damageEnemy is what records that, and it takes the
         * source from six different call sites -- so drive it.
         */
        const live = enemies.find(x => x.hp > 0 && x.kind !== 'deceiver' && !x.braced);
        let landed = null;
        if (live) {
          delete live.hitX; delete live.hitY;
          // Stood on open ground first: the knock below is a real move through
          // moveEntity, and a body already against rock cannot take one, which
          // would fail the recoil check on the map rather than on the code.
          for (let k = 0; k < 60; k++) {
            const nx = 300 + Math.random() * (WORLD.w - 600);
            const ny = 300 + Math.random() * (WORLD.h - 600);
            if (pointInWalls(nx, ny, live.r + 40)) continue;
            live.x = nx; live.y = ny; break;
          }
          const was = { x: live.x, y: live.y, hp: live.hp };
          // A full-weight blow, so the recoil is unambiguous: knock scales on
          // the SHARE of the body a hit took, and one point off a live thrall
          // is a nudge of a couple of units that rounding can swallow.
          damageEnemy(live, live.maxHp * 0.9, live.x - 50, live.y);
          landed = { hx: live.hitX, hy: live.hitY, flash: live.hitFlash,
                     shoved: +(live.x - was.x).toFixed(2),
                     sideways: +Math.abs(live.y - was.y).toFixed(2) };
          live.hp = was.hp;
        }
        return { walk, backX: bo ? bo.x : null, landed,
                 none: flinchOffset(none), moved: [e.x, e.y] };
      });
      ck('a struck body flinches away from the blow',
         D2.walk[0] === 0 && D2.walk[1] > 3 && D2.walk[4] === 0 &&
         D2.walk[2] < D2.walk[1] && D2.walk[3] < D2.walk[2],
         'offset over the flinch: ' + D2.walk.join(' '));
      ck('and flinches the other way from the other side',
         D2.backX !== null && D2.backX < -3 && Math.abs(D2.backX + D2.walk[1]) < 0.01,
         D2.backX === null ? 'no flinch at all from the left'
           : 'peak going left ' + D2.backX.toFixed(2) +
             ' against ' + D2.walk[1] + ' going right');
      ck('and a blow that lands records which way it came from',
         !!D2.landed && D2.landed.hx === 1 && D2.landed.hy === 0 &&
         D2.landed.flash > 0,
         !D2.landed ? 'no body to hit'
           : 'struck from the left -> ' + D2.landed.hx + ',' + D2.landed.hy +
             ', flash ' + D2.landed.flash);
      // The world half. Struck from its left, it goes right -- and only right,
      // because a recoil that wanders is a body being pushed by something else.
      ck('and the weight pass shoves it away from the blow',
         !!D2.landed && D2.landed.shoved > 1 && D2.landed.sideways < 1,
         !D2.landed ? 'no body to hit'
           : 'moved ' + D2.landed.shoved + ' units right, ' +
             D2.landed.sideways + ' sideways');

      ck('while a blow with no source flashes but does not shove',
         D2.none === null, 'offset: ' + JSON.stringify(D2.none));
      ck('and it never moves the body itself',
         D2.moved[0] === 100 && D2.moved[1] === 100, 'body at ' + D2.moved.join(','));

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
