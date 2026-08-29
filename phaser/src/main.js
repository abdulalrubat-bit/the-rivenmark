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

    this.note = this.add.text(10, this.scale.height - 46,
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
    const W = this.scale.width, H = this.scale.height;
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
    const W = this.scale.width, H = this.scale.height;
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

const game = new Phaser.Game({
  type: Phaser.AUTO,                 // WebGL where there is one, Canvas if not
  parent: document.body,
  backgroundColor: '#0b0908',
  // The art is drawn at 2x and scaled down, so it wants smoothing OFF at the
  // sampler and no rounding at the transform -- the canvas build made the same
  // two choices for the same reason.
  pixelArt: true,
  roundPixels: false,
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.NO_CENTER,
    width: '100%', height: '100%'
  },
  scene: [Proving]
});

// Handy from the console, and from a test harness.
window.__game = game;
