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
import { FrameLog, collect, asText, mountButton } from './diagnostics.js';
import { Hud } from './hud.js';
import { Effects } from './effects.js';
import { Screens } from './screens.js';

// The core's palette is CSS hex strings; Phaser wants numbers.
const hex = (css, fallback) => {
  if (typeof css !== 'string') return fallback;
  const n = parseInt(css.replace('#', ''), 16);
  return Number.isFinite(n) ? n : fallback;
};

const SS = 2;      // art/ is exported at 2x, which is native for it

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
          portal, stepThrough, LEVEL_BY_ID, blankStash, el,
          CELL_W, GW, GH, SOLID, cellAt, pitGrid, gi, edges,
          keys, stickStart, stickMove, stickEnd, STICK_MAX, castAbility,
          swapHero, swapBlocked, abilityBlock, ABILITIES, ABILITY_BY_ID,
          CHARGE_MAX, TENSION_MAX,
          WORLD, PAL, LEVEL, LEVELS, GAIT_N, GAIT_STEP, GAIT_STILL,
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
    this.stickGfx = this.add.graphics().setScrollFactor(0).setDepth(9e5);
    this.hero = this.add.sprite(this.stepping ? player.x : 200,
                               this.stepping ? player.y : 200, 'art', 'heroes/isaac-rest');
    this.hero.setScale(1 / SS).setDepth(1e5);

    if (this.stepping) this.cameras.main.startFollow(this.hero, true, 0.18, 0.18);

    this.fx = new Effects(this);
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
    // `dbg`, not `hud`: the DOM HUD is this.hud, and naming both the same
    // silently replaced one with the other.
    this.dbg = this.add.text(8, 62, '', {
      fontFamily: 'ui-monospace, monospace', fontSize: '12px', color: '#cebe9e'
    }).setScrollFactor(0).setDepth(1e6);

    if (!this.game.__diagMounted) {
      this.game.__diagMounted = true;
      mountButton(() => asText(collect(this.game, this.log, {
        build: 'phaser delve',
        bodies: this.pool.length,
        awake: run.awake || 0,
        delve: LEVEL.id
      })));
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
    this.wallImgs = [];
    for (const sp of this.pool) sp.destroy();
    this.propImgs = []; this.pool = [];
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
    // The mass. PAL.stoneLow is #0b0805 -- almost black -- because in the canvas
    // build it is only the bed UNDER the coursed ashlar, and what you actually
    // see is the tile work on top. That dressing is procedural canvas art and
    // is not ported yet, so drawing the bed alone made every wall read as a
    // hole. Until the courses are in the atlas, the lit top face stands in:
    // stoneTop for the mass, stoneLow for a foot that grounds it.
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
      const img = this.add.image(p.x, p.y, 'art', key)
        .setScale(1 / SS).setDepth(p.y - 1e4);
      this.propImgs.push(img);
    }
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

  update(time, dtMs) {
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
    this.hero.setPosition(player.x, player.y).setFlipX(player.face < 0);

    this.cullDressing();
    this.fx.draw(time);
    this.drawStick();
    this.hud.sync();
    const atGate = !!(run.gateOpen && portal && portal.inside && state === 'play');
    if (this.gateBtn.hidden === atGate) this.gateBtn.hidden = !atGate;

    this.log.tick(time);
    const st = this.log.stats();
    if (st && (time | 0) % 8 === 0) {
      this.dbg.setText(
        LEVEL.name + '\n' +
        'slag ' + (run.tech | 0) + '/' + LEVEL.quota + '\n' +
        live.length + ' bodies, ' + (run.awake || 0) + ' awake\n' +
        'fps ' + st.fps + '   worst ' + st.worst.toFixed(0) + 'ms\n' +
        'over budget ' + st.overPct + '%');
    }
  }
}
