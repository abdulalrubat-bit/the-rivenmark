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
/* global walls, props, enemies, player, run, cam, view, state, stash,
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
    this.hero = this.add.sprite(this.stepping ? player.x : 200,
                               this.stepping ? player.y : 200, 'art', 'heroes/isaac-rest');
    this.hero.setScale(1 / SS).setDepth(1e5);

    if (this.stepping) this.cameras.main.startFollow(this.hero, true, 0.18, 0.18);

    this.log = new FrameLog(240);
    this.hud = this.add.text(8, 8, '', {
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

    this.log.tick(time);
    const st = this.log.stats();
    if (st && (time | 0) % 8 === 0) {
      this.hud.setText(
        LEVEL.name + '\n' +
        'slag ' + (run.tech | 0) + '/' + LEVEL.quota + '\n' +
        live.length + ' bodies, ' + (run.awake || 0) + ' awake\n' +
        'fps ' + st.fps + '   worst ' + st.worst.toFixed(0) + 'ms\n' +
        'over budget ' + st.overPct + '%');
    }
  }
}
