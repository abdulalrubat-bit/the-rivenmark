/* The delve, drawn by Phaser off the extracted core's state.
 *
 * The core owns everything that decides what happens: the world, the bodies,
 * the fight. It is stepped once a frame and then read. Nothing here writes to
 * it except the viewport, which it needs and cannot get for itself.
 *
 * The one rule worth stating up front is the gait. Bodies advance their walk
 * cycle by DISTANCE TRAVELLED, not on a clock, so anything slowed takes
 * shorter steps instead of moonwalking. Phaser's animation system runs on a
 * clock, so it is not used for bodies at all -- the frame is chosen from
 * e.gait and e.pace exactly as the canvas build chose a sprite.
 */
import Phaser from 'phaser';
import { FrameLog, FxGovernor, LayerProfiler, collect, asText, mountButton }
  from './diagnostics.js';
import { Hud } from './hud.js';
import { Effects } from './effects.js';
import { Screens } from './screens.js';
import { Overlay } from './overlay.js';
import { Atmosphere } from './atmosphere.js';

// The core's palette is CSS hex strings; Phaser wants numbers.
const hex = (css, fallback) => {
  if (typeof css !== 'string') return fallback;
  const n = parseInt(css.replace('#', ''), 16);
  return Number.isFinite(n) ? n : fallback;
};

const SS = 2;      // art/ is exported at 2x, which is native for it

/* The adaptive-effects thresholds, in milliseconds of WORK per frame. The
 * canvas build's numbers, kept: above FX_DROP a frame cannot hold 60Hz, below
 * FX_RAISE there is room to put the mood back, and FX_SAMPLE frames is about
 * three quarters of a second -- long enough not to react to one bad frame. */
const FX_DROP = 13, FX_RAISE = 8, FX_SAMPLE = 45;

/* Which scenery stands UP off the floor, and how tall it reads.
 *
 * This is a sorting fact, not decoration: a barrel is an object you walk
 * behind, so it has to sort against bodies by y like a body does. Rubble and
 * stains lie flat and always go under everything. Presentation data, so it
 * lives here rather than in the core -- but getting it wrong is visible
 * immediately, because the hero walks through a pillar.
 */
const STANDING = { pillar: 26, barrel: 12, crate: 11, urn: 10, banner: 16,
                   chain: 14, tomb: 22 };

/* The core's names are used bare, not through `window`.
 *
 * core.js is a classic script, and a top-level `const` or `let` there creates a
 * binding in the global LEXICAL environment -- it never becomes a property of
 * window. So `window.LEVELS` is undefined while `LEVELS` resolves perfectly,
 * and only the function declarations (update, startRun) appear on window at
 * all. Reaching through window.* looked tidier and failed on the first line
 * that touched a constant.
 *
 * esbuild leaves free identifiers alone, so these resolve up the scope chain
 * at run time exactly as they do in the canvas build.
 */
/* global walls, props, enemies, player, run, cam, view, state, stash, stick,
          arcs, particles, rings, floaters, bolts, slams, hazards, nulls,
          totems, ruptures, HEROES, TAU, FLOAT_STYLE, FLOAT_LIFE, BOLT_R,
          portal, stepThrough, LEVEL_BY_ID, blankStash, el, chests, loot,
          CHEST_KINDS, CHEST_OPEN, CHEST_DRAW, LIGHT,
          CELL_W, GW, GH, SOLID, cellAt, pitGrid, gi, edges,
          keys, stickStart, stickMove, stickEnd, STICK_MAX, castAbility,
          swapHero, swapBlocked, abilityBlock, ABILITIES, ABILITY_BY_ID,
          CHARGE_MAX, TENSION_MAX,
          WORLD, PAL, LEVEL, LEVELS, GAIT_N, GAIT_STEP, GAIT_STILL, lamps,
          lowFx,
          WALK_STEP, WALK_PACE, update, startRun, loadStash */

export class Delve extends Phaser.Scene {
  constructor() { super('delve'); }

  preload() {
    this.load.atlas('art', 'atlas.png', 'atlas.json');
  }

  create() {
    document.getElementById('boot')?.remove();

    // The core reads the viewport to place spawns; give it a real one and keep
    // it current. Without this the spawn ring collapses and the delve sends a
    // fraction of what it should.
    const pushView = () => window.__setView(this.scale.width, this.scale.height,
                                       window.devicePixelRatio || 1);
    pushView();
    this.scale.on('resize', pushView);

    // ?norun leaves the world ungenerated, for isolating where a frame goes.
    this.stepping = !/norun/.test(location.search);
    if (this.stepping) {
      state = 'play';
      stash = loadStash();
      const t0 = performance.now();
      startRun('isaac', LEVELS[3].id, 'riven');
      run.banner = 0;
      console.log('startRun ' + (performance.now() - t0).toFixed(0) + 'ms');
    }

    this.cameras.main.setBackgroundColor(PAL.floor || '#1a1512');
    this.cameras.main.setBounds(0, 0, WORLD.w, WORLD.h);

    // ?nostatics skips the one-off bake, for isolating where a frame goes.
    if (!/nostatics/.test(location.search)) {
      const t0 = performance.now();
      this.paintStatics();
      console.log('paintStatics ' + (performance.now() - t0).toFixed(0) + 'ms, ' +
                  walls.length + ' walls, ' + props.length + ' props');
    }

    // Depth bands, so a body never sorts against a wall or the floor.
    this.pool = [];          // body sprites, grown to fit and never shrunk
    this.shadows = [];       // one under each, pooled the same way
    this.stickGfx = this.add.graphics().setScrollFactor(0).setDepth(9e5);
    this.hero = this.add.sprite(this.stepping ? player.x : 200,
                               this.stepping ? player.y : 200, 'art', 'heroes/isaac-rest');
    // Sorted with the crowd, not over it. At a fixed high depth the hero drew
    // through every body standing in front of him, which reads as him being
    // pasted on top of the scene rather than in it.
    this.hero.setScale(1 / SS).setDepth(this.stepping ? player.y : 1e5);
    this.heroShadow = this.add.image(0, 0, 'art', 'misc/shadow')
      .setDisplaySize(26, 14).setDepth(-400);
    this.lootImgs = [];

    if (this.stepping) this.cameras.main.startFollow(this.hero, true, 0.18, 0.18);

    this.fx = new Effects(this);
    this.overlay = new Overlay(this);
    this.air = new Atmosphere(this);
    // The loop around a delve. showScreen is the core's own way of saying
    // "the run is over" or "you are back at the gate-house", so it is routed
    // here rather than second-guessed.
    this.screens = new Screens((hero, level) => this.newRun(hero, level));
    window.showScreen = name => this.screens.show(name);
    this.wireInput();
    this.hud = new Hud();
    // Stepping through is a deliberate act, not something you do by walking
    // over the circle, so it needs a control -- and one that is only there
    // when it would do something.
    this.gateBtn = document.createElement('button');
    this.gateBtn.id = 'gateBtn';
    this.gateBtn.type = 'button';
    this.gateBtn.textContent = 'Step through';
    this.gateBtn.hidden = true;
    this.gateBtn.addEventListener('click', () => stepThrough());
    document.body.appendChild(this.gateBtn);
    const gs = document.createElement('style');
    gs.textContent = '#gateBtn{position:fixed;left:50%;transform:translateX(-50%);' +
      'bottom:160px;z-index:45;min-height:48px;padding:0 18px;border-radius:8px;' +
      'background:#2a2015;color:#f0e2c2;border:1px solid #d6b26e;' +
      'font:15px Georgia,serif}#gateBtn[hidden]{display:none!important}';
    document.head.appendChild(gs);

    this.log = new FrameLog(240);
    this.gov = new FxGovernor(this.game, FX_SAMPLE);
    this.prof = new LayerProfiler(this);
    // `dbg`, not `hud`: the DOM HUD is this.hud, and naming both the same
    // silently replaced one with the other.
    // Bottom-left, not top-left. The top strip belongs to the life bar, the
    // boss bar and the toast, and the readout sat under all three; the kit
    // owns bottom-right, so bottom-left is the only corner nothing wants.
    this.dbg = this.add.text(8, 0, '', {
      fontFamily: 'ui-monospace, monospace', fontSize: '12px', color: '#cebe9e'
    }).setOrigin(0, 1).setScrollFactor(0).setDepth(1e6);
    const placeDbg = () => this.dbg.setPosition(8, this.scale.height - 96);
    placeDbg();
    this.scale.on('resize', placeDbg);

    if (!this.game.__diagMounted) {
      this.game.__diagMounted = true;
      mountButton(() => {
        // The profile goes at the TOP of the dump when there is one. It is the
        // only part that says where the frame went; everything under it says
        // what the frame contained.
        const prof = this.prof.state && this.prof.state.text;
        return (prof ? prof + '\n\n' : '') +
          asText(collect(this.game, this.log, {
            build: 'phaser delve',
            // The single most important line in the dump after the frame rate:
            // 60fps with the mood on and 60fps with it already shed are
            // different findings about the same number.
            fx: (lowFx ? 'LOW (mood shed)' : 'full') +
                '   governor: ' + this.gov.drops + ' drop(s), ' +
                this.gov.raises + ' restore(s)' +
                (this.gov.stat ? '   last sample: work ' + this.gov.stat.work +
                  'ms, frames ' + this.gov.stat.p50 + 'ms against a ' +
                  this.gov.stat.period + 'ms display' : '   (no sample yet)'),
            bodies: this.pool.length,
            awake: run.awake || 0,
            delve: LEVEL.id
          }));
      }, () => this.prof.start(), () => this.prof.label());
    }
  }

  /* A new delve. The world is regenerated by startRun, so everything drawn
   * from the old one has to go: the wall graphic, the scenery, and the body
   * sprites, which are pooled and would otherwise show the last delve's dead.
   */
  newRun(hero, levelId) {
    if (this.wallGfx) this.wallGfx.destroy();
    for (const im of this.propImgs || []) im.destroy();
    for (const im of this.wallImgs || []) im.destroy();
    for (const c of this.chestImgs || []) { c.img.destroy(); c.sh.destroy(); }
    for (const im of this.lootImgs || []) im.destroy();
    this.wallImgs = []; this.chestImgs = []; this.lootImgs = [];
    for (const sp of this.pool) sp.destroy();
    for (const sh of this.shadows || []) sh.destroy();
    this.propImgs = []; this.pool = []; this.shadows = [];
    this.fx.texts.forEach(t => t.destroy());
    this.fx.texts = [];

    state = 'play';
    startRun(hero, levelId, 'riven');
    run.banner = 0;
    this.paintStatics();
    this.hero.setPosition(player.x, player.y);
    this.culledAt = null;
    this.cameras.main.startFollow(this.hero, true, 0.18, 0.18);
  }

  /* Walls and scenery never move, so they go down once and are never touched
   * again.
   *
   * Not through a RenderTexture. Phaser 4 has one and it reports itself as
   * visible at full alpha and the right size, and it draws nothing -- filling
   * it flat red produced no red on screen. Rather than chase that, this uses
   * what a GPU renderer is actually good at: the walls are a single persistent
   * Graphics of sixty-odd rectangles, and the scenery is a few hundred static
   * Images out of one atlas, which is one batch.
   *
   * The canvas build could do neither. It blitted its wall tiles one at a time
   * every frame -- 158 drawImage calls measured at 4.5ms of per-call overhead
   * alone -- and that is most of the reason for the move.
   */
  paintStatics() {
    const gfx = this.add.graphics().setDepth(-2e5);
    // The shadow the mass throws, then the mass, as two passes over every wall
    // so a neighbour's shadow never lands on finished stone.
    gfx.fillStyle(0x060504, 0.58);
    for (const w of walls) if (!w.pit) gfx.fillRect(w.x + 5, w.y + 7, w.w, w.h);
    // The bed under the coursed ashlar. PAL.stoneLow is #0b0805 -- almost
    // black -- because in the canvas build it is only ever a bed, and what you
    // see is the tile work on top; drawing the bed alone made every wall read
    // as a hole. dressWalls() lays the courses over this, and stoneTop here
    // stops a gap in them from showing through as a chasm.
    gfx.fillStyle(hex(PAL.stoneTop, 0x241d16), 1);
    for (const w of walls) if (!w.pit) gfx.fillRect(w.x, w.y, w.w, w.h);
    gfx.fillStyle(hex(PAL.stoneLow, 0x0b0805), 1);
    for (const w of walls) if (!w.pit) gfx.fillRect(w.x, w.y + w.h - 6, w.w, 6);
    // A hairline of light along the north edge, which is where every shadow in
    // the game comes from, so the mass has a direction.
    gfx.fillStyle(hex(PAL.stoneMid, 0x16110b), 1);
    for (const w of walls) if (!w.pit) gfx.fillRect(w.x, w.y, w.w, 2);
    // A chasm is a hole, not a mass: black, with a lit near lip and nothing to
    // say how far down it goes.
    gfx.fillStyle(0x000000, 1);
    for (const w of walls) if (w.pit) gfx.fillRect(w.x, w.y, w.w, w.h);
    gfx.fillStyle(0xc6b28a, 0.20);
    for (const w of walls) if (w.pit) gfx.fillRect(w.x, w.y, w.w, 2);
    this.wallGfx = gfx;

    if (!/nodress/.test(location.search)) this.dressWalls();

    // Scenery. `q` is the variant the generator rolled; the exporter wrote
    // four of each. Depth by y so a body passes in front of a barrel it is
    // below and behind one it is above.
    this.propImgs = [];
    for (const p of props) {
      const key = this.pickProp(p.kind, p.q);
      if (!key) continue;
      // A barrel is something you walk behind, so it sorts against bodies by
      // y. Flat scenery -- rubble, stains, bones -- goes under all of it.
      const up = STANDING[p.kind];
      if (up) this.propImgs.push(this.shadowAt(p.x, p.y, up, 2));
      const img = this.add.image(p.x, p.y, 'art', key)
        .setScale(1 / SS).setDepth(up ? p.y : p.y - 1e4);
      this.propImgs.push(img);
    }

    // The coffers. Two states in the atlas rather than the canvas build's four
    // frames of lid, so a chest is shut or open; the four-frame lift is the
    // one thing here that is not a straight port, and it is worth having the
    // chest at all more than it is worth the animation.
    this.chestImgs = [];
    for (const ch of chests) {
      const sh = this.shadowAt(ch.x, ch.y + CHEST_DRAW * 0.34, CHEST_DRAW * 0.4, 0);
      const key = 'chests/' + ch.kind + '-shut';
      if (!this.textures.getFrame('art', key)) continue;
      const img = this.add.image(ch.x, ch.y, 'art', key)
        .setDisplaySize(CHEST_DRAW, CHEST_DRAW).setDepth(ch.y);
      this.chestImgs.push({ ch, img, sh });
    }
  }

  /* The shadow every standing thing throws.
   *
   * One direction for the whole game -- LIGHT is the core's, and the walls,
   * the bodies and the scenery all read off it -- which is most of why a flat
   * top-down scene reads as having a floor at all. Offset by the light and
   * squashed, the way the canvas build's dropShadow does it.
   */
  shadowAt(x, y, r, lift) {
    const im = this.add.image(x + LIGHT.x * (LIGHT.body + (lift || 0)),
                              y + LIGHT.y * (LIGHT.body + (lift || 0)) + r * 0.42,
                              'art', 'misc/shadow')
      .setDisplaySize(r * 2.05, r * 1.05).setDepth(-400);
    return im;
  }

  /* The coursed ashlar and the lit top face.
   *
   * These make a wall read as built stone rather than a dark mass, and they
   * were the last thing still missing from the port: they live in their own
   * arrays in the canvas build rather than in the sprite atlas, so the
   * exporter had to learn to write them out.
   *
   * The placement is the canvas build's, kept deliberately: the same hash
   * chooses a cell's top, and the courses are stepped by each run's own length
   * divided evenly so they butt against each other rather than tiling at a
   * fixed pitch and leaving a ragged part-course at the end.
   *
   * Static images, one per cell and one per course. In the canvas build this
   * was 158 drawImage calls EVERY FRAME and cost 4.5ms of per-call overhead
   * alone. Here they go down once and batch out of the one atlas.
   */
  dressWalls() {
    const T = CELL_W;
    this.wallImgs = [];
    if (!this.textures.getFrame('art', 'walls/top-0')) return;

    for (let cy = 0; cy < GH; cy++) {
      for (let cx = 0; cx < GW; cx++) {
        if (cellAt(cx, cy) !== SOLID) continue;
        if (pitGrid && pitGrid[gi(cx, cy)]) continue;      // a hole gets no top
        const h = ((cx * 73856093) ^ (cy * 19349663)) >>> 0;
        const img = this.add.image(cx * T, cy * T, 'art', 'walls/top-' + (h % 6))
          .setOrigin(0, 0).setScale(1 / SS).setDepth(-1.5e5);
        this.wallImgs.push(img);
      }
    }

    // Masonry along every exposed face.
    const spans = (this.cache.json.get('manifest') || {}).wall_dressing || [];
    const spanOf = name => spans.find(s => s.name === name) || { spanW: 100, spanH: 30 };
    const L = spanOf('course-0-0').spanW;
    for (const e of edges) {
      const len = Math.hypot(e.x2 - e.x1, e.y2 - e.y1);
      if (!len) continue;
      const ux = (e.x2 - e.x1) / len, uy = (e.y2 - e.y1) / len;
      const q = ((Math.round((Math.atan2(e.ny, e.nx) + Math.PI / 2) / (Math.PI / 2)) % 4) + 4) % 4;
      const n = Math.max(1, Math.round(len / L));
      const step = len / n;
      for (let k = 0; k < n; k++) {
        const d = step * (k + 0.5);
        const cx = e.x1 + ux * d - e.nx * 7;
        const cy = e.y1 + uy * d - e.ny * 7;
        const v = (((cx * 7 + cy * 13) | 0) % 3 + 3) % 3;
        const name = 'course-' + v + '-' + q;
        if (!this.textures.getFrame('art', 'walls/' + name)) continue;
        const sp = spanOf(name);
        // Whichever dimension lies along the run is stretched to exactly one
        // step, so courses butt with no seam and no overlap. A run's normal
        // points across it: ny is set on a face that runs along x.
        const alongX = e.ny !== 0;
        const img = this.add.image(cx, cy, 'art', 'walls/' + name)
          .setDisplaySize(alongX ? step : sp.spanW, alongX ? sp.spanH : step)
          .setDepth(-1.4e5);
        this.wallImgs.push(img);
      }
    }
  }

  /* Culling the dressing.
   *
   * A delve wears about 1700 wall images and Phaser submits every one of them
   * every frame -- it does not cull ordinary game objects against the camera.
   * Measured: p90 went from 16.7ms to 33.3ms and a quarter of frames missed
   * the budget, purely on quads that were nowhere near the screen.
   *
   * So visibility is set by hand, and only when the camera has actually moved
   * far enough to change the answer. The margin is generous because the test
   * is cheap and a wall popping in at the edge of the screen is not.
   */
  cullDressing(force) {
    const c = this.cameras.main;
    if (!force && this.culledAt &&
        Math.abs(c.scrollX - this.culledAt.x) < 96 &&
        Math.abs(c.scrollY - this.culledAt.y) < 96) return;
    this.culledAt = { x: c.scrollX, y: c.scrollY };
    const M = 160;
    const x0 = c.scrollX - M, y0 = c.scrollY - M;
    const x1 = c.scrollX + c.width + M, y1 = c.scrollY + c.height + M;
    for (const list of [this.wallImgs, this.propImgs]) {
      if (!list) continue;
      for (const im of list) {
        const on = im.x > x0 - im.displayWidth && im.x < x1 &&
                   im.y > y0 - im.displayHeight && im.y < y1;
        if (im.visible !== on) im.setVisible(on);
      }
    }
  }

  pickProp(kind, q) {
    const v = 'props/' + kind + '-' + ((q | 0) % 4);
    if (this.textures.getFrame('art', v)) return v;
    return this.textures.getFrame('art', 'props/' + kind) ? 'props/' + kind : null;
  }
  frameW(key) { const f = this.textures.getFrame('art', key); return f ? f.width : 0; }
  frameH(key) { const f = this.textures.getFrame('art', key); return f ? f.height : 0; }

  /* Which frame a body wears. The canvas build's bodyFrame/heroFrame, reading
   * the same gait state the core computes, resolved to atlas frames instead of
   * forged canvases.
   */
  bodyFrame(e) {
    if (e.pace < GAIT_STILL || e.braced) return 'bestiary/' + e.kind + '-rest';
    const f = ((e.gait / GAIT_STEP) | 0) % GAIT_N;
    return 'bestiary/' + e.kind + '-run-' + f;
  }
  heroFrame(p) {
    if (p.pace < GAIT_STILL) return 'heroes/' + p.hero + '-rest';
    const run = p.pace >= WALK_PACE;
    const f = ((p.gait / (run ? GAIT_STEP : WALK_STEP)) | 0) % GAIT_N;
    return 'heroes/' + p.hero + (run ? '-run-' : '-walk-') + f;
  }

  /* The stick.
   *
   * The core already owns the whole state machine -- stickStart, stickMove,
   * stickEnd and moveVector, with its own dead zone and throttle curve -- so
   * this only feeds it pointer positions. Phaser's pointer.x/y are already in
   * game space, which is what those functions expect.
   *
   * Only pointers that land on the canvas get here: the HUD is DOM above it
   * and swallows its own events, so a thumb on an ability button can never
   * drag the hero as well.
   */
  wireInput() {
    this.input.addPointer(2);          // a thumb to move, a thumb for the kit
    this.input.on('pointerdown', pt => {
      if (state !== 'play') return;
      if (stick.active) return;        // one finger owns the stick at a time
      stickStart(pt.id, pt.x, pt.y);
    });
    this.input.on('pointermove', pt => {
      if (stick.active && pt.id === stick.id) stickMove(pt.x, pt.y);
    });
    const release = pt => { if (stick.active && pt.id === stick.id) stickEnd(); };
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);
    this.input.on('gameout', () => stickEnd());

    // Desktop: the same keys the canvas build takes, into the same Set.
    this.input.keyboard?.on('keydown', e => keys.add(e.key.toLowerCase()));
    this.input.keyboard?.on('keyup',   e => keys.delete(e.key.toLowerCase()));
    // A window that loses focus mid-delve must not leave a key held down.
    window.addEventListener('blur', () => { keys.clear(); stickEnd(); });
  }

  /* The stick, drawn where the thumb put it. Two rings: where the finger went
   * down, and where it is now. Screen space, so it does not scroll with the
   * world.
   */
  drawStick() {
    const gfx = this.stickGfx;
    gfx.clear();
    if (!stick.active) return;
    gfx.lineStyle(2, 0xd6b26e, 0.45);
    gfx.strokeCircle(stick.ox, stick.oy, STICK_MAX);
    gfx.fillStyle(0xd6b26e, 0.30);
    gfx.fillCircle(stick.x, stick.y, 18);
  }

  /* A coffer opens. The only thing that changes about a chest once it is
   * placed, so it is the only thing looked at. */
  syncChests() {
    for (const c of this.chestImgs || []) {
      const want = 'chests/' + c.ch.kind + (c.ch.open ? '-open' : '-shut');
      if (c.img.frame.name !== want && this.textures.getFrame('art', want)) {
        c.img.setFrame(want);
        c.img.setDisplaySize(CHEST_DRAW, CHEST_DRAW);
      }
      // A shut one breathes, so it catches the eye across a dark room without
      // needing a marker drawn over the top of it.
      if (c.ch.open) { c.img.setTint(0xffffff); continue; }
      const p = 0.5 + 0.5 * Math.sin(c.ch.pulse * 1.7);
      c.img.setTint(p > 0.55 ? 0xfff0cc : 0xffffff);
    }
  }

  /* Slag on the floor -- the quota, and the only reason to be down here.
   * Pooled, because a cleared room drops a lot of it at once and the count
   * falls again as fast as you can walk over it. */
  syncLoot(time) {
    const pool = this.lootImgs;
    while (pool.length < loot.length) {
      pool.push(this.add.image(0, 0, 'art', 'misc/loot').setScale(1 / SS).setDepth(-380));
    }
    for (let i = 0; i < pool.length; i++) {
      const im = pool[i], l = loot[i];
      if (!l) { im.setVisible(false); continue; }
      const key = l.value > 1 ? 'misc/loot-big' : 'misc/loot';
      if (im.frame.name !== key && this.textures.getFrame('art', key)) im.setFrame(key);
      im.setVisible(true).setPosition(l.x, l.y).setRotation(l.spin || 0);
    }
  }

  /* Adaptive effects: shed the mood before the frame rate goes, and put it
   * back when there is room again.
   *
   * The port had none of this. The core's `lowFx` is read all over -- by the
   * atmosphere here, and by the core's own spark budgets -- and nothing ever
   * set it, so a device that could not hold the frame simply did not hold it.
   * Measured on this box: the atmosphere alone took 60fps to 30 and lowFx
   * stayed false the whole time.
   *
   * The decision itself lives in FxGovernor, with the reasoning for its two
   * measures. All that happens here is setting the core's flag -- `lowFx` is a
   * top-level `let` in the core, and esbuild leaves free identifiers alone, so
   * this assignment lands on the core's own binding exactly as reading it bare
   * reads the core's own value.
   */
  adaptFx(time) {
    // ?nogov holds the governor off. Anything that measures the mood on screen
    // has to, or it races it: the atmosphere is what makes the frame expensive,
    // so the governor sheds it halfway through the measurement and the picture
    // under test stops existing.
    if (/nogov/.test(location.search)) return;
    const call = this.gov.decide(lowFx, FX_DROP, FX_RAISE);
    if (call === 'drop') lowFx = true;
    else if (call === 'raise') lowFx = false;
    this.gov.begin(time);
  }

  update(time, dtMs) {
    this.adaptFx(time);
    const dt = Math.min(0.05, dtMs / 1000);      // the core's own MAX_DT clamp
    if (this.stepping && state === 'play') update(dt);

    // Bodies: one sprite each, pooled. Sorted by y, which is what makes a
    // crowd read as standing on a floor rather than floating over it.
    //
    // The pool is a plain array of our own. Growing it by testing
    // group.getChildren().length against the body count and calling group.add()
    // assumes add() appends to the very array getChildren() handed back -- and
    // when it does not, the loop never terminates and the page simply stops,
    // which is a hang with no error and nothing in the log.
    const live = this.stepping ? enemies.filter(e => e.hp > 0) : [];
    const pool = this.pool;
    while (pool.length < live.length) {
      const s = this.add.sprite(0, 0, 'art', 'bestiary/thrall-rest').setScale(1 / SS);
      pool.push(s);
    }
    while (this.shadows.length < live.length) {
      this.shadows.push(this.add.image(0, 0, 'art', 'misc/shadow').setDepth(-400));
    }
    for (let i = 0; i < this.shadows.length; i++) {
      const sh = this.shadows[i], e = live[i];
      if (!e) { sh.setVisible(false); continue; }
      const r = e.r || 13;
      sh.setVisible(true)
        .setDisplaySize(r * 2.05, r * 1.05)
        .setPosition(e.x + LIGHT.x * LIGHT.body,
                     e.y + LIGHT.y * LIGHT.body + r * 0.42);
    }
    for (let i = 0; i < pool.length; i++) {
      const s = pool[i], e = live[i];
      if (!e) { s.setVisible(false); continue; }
      const key = this.bodyFrame(e);
      s.setVisible(true).setPosition(e.x, e.y).setDepth(e.y);
      if (s.frame.name !== key && this.textures.getFrame('art', key)) s.setFrame(key);
      s.setFlipX(e.face < 0);
      // Struck bodies flash, calcifying ones sit under a shell of light.
      s.setTint(e.hitFlash > 0 ? 0xffffff : (e.calcify > 0 ? 0x9fd8e8 : 0xffffff));
      s.setAlpha(e.calcify > 0 ? 0.85 : 1);
    }

    if (!this.stepping) return;
    const hk = this.heroFrame(player);
    if (this.hero.frame.name !== hk && this.textures.getFrame('art', hk)) this.hero.setFrame(hk);
    this.hero.setPosition(player.x, player.y).setFlipX(player.face < 0)
        .setDepth(player.y);
    this.heroShadow.setPosition(player.x + LIGHT.x * LIGHT.body,
                                player.y + LIGHT.y * LIGHT.body + 13 * 0.42);

    this.syncChests(time);
    this.syncLoot(time);
    this.cullDressing();
    this.fx.draw(time);
    this.overlay.draw(time);
    this.air.draw(time);
    this.drawStick();
    this.hud.sync();
    const atGate = !!(run.gateOpen && portal && portal.inside && state === 'play');
    if (this.gateBtn.hidden === atGate) this.gateBtn.hidden = !atGate;

    this.log.tick(time);
    // One delivered interval per frame into the profiler, from the same source
    // the FrameLog reads. Delivered, because that is the only measure that
    // includes work no clock in this process can see.
    if (this.profLast) this.prof.tick(time - this.profLast);
    this.profLast = time;
    const st = this.log.stats();
    if (st && (time | 0) % 8 === 0) {
      this.dbg.setText(
        LEVEL.name + '\n' +
        'slag ' + (run.tech | 0) + '/' + LEVEL.quota + '\n' +
        live.length + ' bodies, ' + (run.awake || 0) + ' awake\n' +
        'fps ' + st.fps + '   worst ' + st.worst.toFixed(0) + 'ms\n' +
        'over budget ' + st.overPct + '%' +
        (this.gov.stat ? '   work ' + this.gov.stat.work + 'ms, ' +
          this.gov.stat.p50 + '/' + this.gov.stat.period + 'ms' : '') +
        (lowFx ? '   LOW FX' : '') +
        (this.prof.state && !this.prof.state.done
          ? '\nprofiling ' + this.prof.label() : ''));
    }
  }
}
