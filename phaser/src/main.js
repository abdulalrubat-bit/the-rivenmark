/* The Rivenmark, on Phaser.
 *
 * WHAT THIS IS RIGHT NOW. Not the game -- a proving ground for the two things
 * the port rests on, so that neither is discovered to be wrong after nine
 * thousand lines have been moved:
 *
 *   1. that art/ can drive Phaser directly, gait and all, with no re-drawing;
 *   2. that a GPU renderer batches the horde the canvas build blits one body
 *      at a time.
 *
 * It reports its own frame cost, and it reports the WORST frame rather than
 * the average -- the canvas build's own HUD averaged, and an average is the
 * one statistic that cannot show a stutter.
 */
import Phaser from 'phaser';
import { FrameLog, collect, asText, mountButton } from './diagnostics.js';
import { Delve } from './delve.js';

const GAIT = 8;                    // poses per cycle, same as the canvas build
const SS   = 2;                    // art/ is exported at 2x, which is native

class Proving extends Phaser.Scene {
  constructor() { super('proving'); }

  preload() {
    this.load.atlas('art', 'atlas.png', 'atlas.json');
    this.load.json('manifest', 'manifest.json');
  }

  create() {
    document.getElementById('boot')?.remove();
    const man = this.cache.json.get('manifest');
    this.kinds = Object.keys(man.kinds || {});
    this.stats = man.kinds || {};

    // One animation per kind, built from the frames the exporter named. A kind
    // whose frames are missing is skipped rather than guessed at: a silent
    // fallback here would look like the art loaded when it did not.
    this.playable = [];
    for (const k of this.kinds) {
      const frames = [];
      for (let i = 0; i < GAIT; i++) {
        const key = 'bestiary/' + k + '-run-' + i;
        if (this.textures.getFrame('art', key)) frames.push({ key: 'art', frame: key });
      }
      if (frames.length !== GAIT) continue;
      this.anims.create({ key: k + '-run', frames, frameRate: 14, repeat: -1 });
      this.playable.push(k);
    }
    for (const h of ['isaac', 'zayd']) {
      const frames = [];
      for (let i = 0; i < GAIT; i++) {
        const key = 'heroes/' + h + '-run-' + i;
        if (this.textures.getFrame('art', key)) frames.push({ key: 'art', frame: key });
      }
      if (frames.length === GAIT)
        this.anims.create({ key: h + '-run', frames, frameRate: 16, repeat: -1 });
    }

    this.bodies = this.add.group();
    this.count = 0;
    this.spawn(60);

    this.hud = this.add.text(10, 10, '', {
      fontFamily: 'ui-monospace, monospace', fontSize: '13px', color: '#cebe9e'
    }).setScrollFactor(0).setDepth(1000);

    this.note = this.add.text(10, this.scale.displaySize.height - 46,
      'tap: +40 bodies    two fingers: reset to 60', {
      fontFamily: 'ui-monospace, monospace', fontSize: '11px', color: '#8c8168'
    }).setScrollFactor(0).setDepth(1000);

    this.input.on('pointerdown', p => {
      if (this.input.pointer2 && this.input.pointer2.isDown) this.reset();
      else this.spawn(40);
    });

    // Frame intervals, kept as a window. Same reasoning as the canvas build's
    // debug HUD: the worst frame is what a hand feels, and a mean hides it.
    this.log = new FrameLog(240);

    // The phone's way of telling the desk what happened. Mounted once, and
    // only in a browser -- the smoke test drives this headless.
    if (!this.game.__diagMounted) {
      this.game.__diagMounted = true;
      mountButton(() => asText(collect(this.game, this.log, {
        build: 'phaser proving ground',
        bodies: this.count
      })));
    }
  }

  spawn(n) {
    if (!this.playable.length) return;
    const W = this.scale.displaySize.width, H = this.scale.displaySize.height;
    for (let i = 0; i < n; i++) {
      const k = this.playable[(Math.random() * this.playable.length) | 0];
      const s = this.add.sprite(Math.random() * W, Math.random() * H, 'art');
      s.play(k + '-run');
      s.setScale(1 / SS);                       // 2x art down to CSS pixels
      s.vx = (Math.random() - 0.5) * 90;
      s.vy = (Math.random() - 0.5) * 90;
      s.setFlipX(s.vx < 0);
      this.bodies.add(s);
    }
    this.count = this.bodies.getLength();
  }

  reset() {
    this.bodies.clear(true, true);
    this.count = 0;
    this.spawn(60);
  }

  update(time, dt) {
    const W = this.scale.displaySize.width, H = this.scale.displaySize.height;
    const step = dt / 1000;
    for (const s of this.bodies.getChildren()) {
      s.x += s.vx * step; s.y += s.vy * step;
      if (s.x < 0 || s.x > W) { s.vx *= -1; s.setFlipX(s.vx < 0); }
      if (s.y < 0 || s.y > H) { s.vy *= -1; }
      s.setDepth(s.y);                          // the canvas build's y-sort
    }

    this.log.tick(time);
    const s = this.log.stats();
    if (s && (time | 0) % 8 === 0) {
      this.hud.setText(
        this.count + ' bodies\n' +
        'fps ' + s.fps + '\n' +
        'worst ' + s.worst.toFixed(0) + 'ms\n' +
        'over budget ' + s.overPct + '%\n' +
        'renderer ' + (this.game.renderer.type === Phaser.WEBGL ? 'WebGL' : 'Canvas'));
    }
  }
}

/* THE DEVICE'S ACTUAL RESOLUTION.
 *
 * Measured, on an emulated phone at each ratio a phone actually has:
 *
 *   DPR 1   backing 390x844   css 390x844
 *   DPR 2   backing 390x844   css 390x844
 *   DPR 3   backing 390x844   css 390x844
 *
 * The backing store never moved. On a modern phone the game was rendering a
 * 390-wide frame and letting the browser stretch it across eleven hundred
 * physical pixels -- every pixel tripled, which is the whole of the fuzz. The
 * canvas build never had this: it has always set canvas.width to w * dpr and
 * pushed the ratio into the transform.
 *
 * RESIZE mode cannot fix it. Its updateScale sets gameSize FROM the parent's
 * CSS size and ignores zoom entirely, so there is no seam to put the ratio
 * through. NONE mode has one: gameSize is whatever we say, displaySize is
 * gameSize * zoom, and the canvas style is set from displaySize. So the game
 * is sized in DEVICE pixels and shown at CSS size, which is precisely the
 * pair of numbers that makes a crisp canvas.
 *
 * WHAT KEEPS THE REST OF THE GAME HONEST. Everything that lays out against
 * the screen -- the view the core reads, the fog sheet, the debug line -- must
 * stay in CSS pixels, or the HUD (which is DOM, and therefore always CSS
 * pixels) and the world would disagree by the ratio. Two rules, and they are
 * the whole of the discipline here:
 *
 *   screen space   read scale.displaySize, never scale.width
 *   world space    the camera carries a zoom of dpr, so a world unit is a CSS
 *                  pixel exactly as it was before
 *
 * Nothing in the core moves. It is handed the same numbers it always was.
 */
const DPR = () => Math.max(1, Math.min(3, window.devicePixelRatio || 1));

const game = new Phaser.Game({
  type: Phaser.AUTO,                 // WebGL where there is one, Canvas if not
  parent: document.body,
  backgroundColor: '#0b0908',
  /* NOT pixelArt. That sets NEAREST filtering, which was chosen when the 2x
   * art was being drawn at half size into a low-resolution frame -- and
   * point-sampling a 2:1 downscale throws away every other pixel, which is the
   * shimmer on top of the blur. With the frame at the device's real resolution
   * the art lands close to 1:1 on a DPR-2 phone, and LINEAR is what carries
   * the half-pixel offsets an animated body actually sits on.
   */
  pixelArt: false,
  antialias: true,
  roundPixels: false,
  scale: {
    // Driven by hand below: NONE is the only mode with a seam for the ratio.
    mode: Phaser.Scale.NONE,
    autoCenter: Phaser.Scale.NO_CENTER,
    width: Math.round(window.innerWidth * DPR()),
    height: Math.round(window.innerHeight * DPR()),
    zoom: 1 / DPR()
  },
  // Delve first: it is the game. Proving stays reachable as a benchmark --
  // it is the scene that settled whether the atlas and the GPU renderer
  // could carry this at all, and it is still the quickest way to ask.
  // ?scene=proving starts the benchmark instead of the game. Phaser starts the
  // first scene in the list, so the order is the switch.
  scene: /scene=proving/.test(location.search) ? [Proving, Delve] : [Delve, Proving]
});

/* Keep the pair current. The ratio can change under you -- a phone moved to an
 * external display, a desktop window dragged between monitors, a browser zoom
 * -- and a game that read it once at boot renders the rest of the session at
 * the wrong resolution with nothing to say so.
 */
function fitToScreen() {
  const dpr = DPR();
  const w = Math.round(window.innerWidth * dpr);
  const h = Math.round(window.innerHeight * dpr);
  if (game.scale.zoom !== 1 / dpr) game.scale.setZoom(1 / dpr);
  game.scale.resize(w, h);
  // The style is what the browser lays out against, and NONE mode only writes
  // it when the zoom itself changed -- so it is set here every time, or a
  // rotate leaves a correctly-sized buffer displayed at the old CSS size.
  game.canvas.style.width = window.innerWidth + 'px';
  game.canvas.style.height = window.innerHeight + 'px';
}
window.addEventListener('resize', fitToScreen);
window.addEventListener('orientationchange', fitToScreen);
game.events.once('ready', fitToScreen);

/* The camera zoom is NOT set from here, and the first version was: it ran at
 * the game's `ready` event, when no scene's camera exists yet, so the zoom
 * silently stayed at 1 and the delve rendered eleven hundred world units into
 * a frame meant to show three hundred and ninety. Everything was a third of
 * its size and nothing threw.
 *
 * A scene knows when its own camera exists, so each scene that draws a world
 * in CSS units sets its own -- see the call in Delve.create.
 */
window.__dpr = DPR;

// Handy from the console, and from a test harness.
window.__game = game;
window.__fit = fitToScreen;
