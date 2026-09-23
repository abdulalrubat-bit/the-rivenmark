/* Mood: light, fog, ash, the dark closing in, and the swap.
 *
 * Everything here is the part of the picture that carries no information. It
 * is also the part that costs the most, because nearly all of it is a
 * full-screen alpha blend -- the canvas build measured two fog layers at 20ms
 * a frame, more than the rest of the game put together -- so every piece of it
 * is behind `lowFx`, which the core turns on by itself when frames start
 * missing their budget.
 *
 * One exception, and it is not decoration: the light pass. Without it the
 * tunnels read as flat black and a torch on a wall is a sprite of a torch that
 * lights nothing. It is the cheapest thing here (a few dozen tinted quads,
 * culled to the view) and the most missed.
 *
 * Phaser has no gradients, so the three gradients this needs -- a light blob,
 * a fog tile, a vignette -- are baked ONCE into canvas textures at boot and
 * then drawn as ordinary images. A gradient rasterised once and reused is free;
 * a gradient built per frame is the thing that made the canvas build slow.
 */
import Phaser from 'phaser';
import { pinToScreen } from './screen.js';

/* global lamps, player, portal, loot, run, cam, view, PAL, PORTAL_R, TAU,
          lowFx, swapFlash, HEROES, GLOOM_TIME, GLOOM_DEPTH */

const hex = (css, fallback) => {
  if (typeof css !== 'string') return fallback;
  const n = parseInt(css.replace('#', ''), 16);
  return Number.isFinite(n) ? n : fallback;
};

const MOTES = 54;
const LIGHT_TEX = 128;    // the light blob is drawn scaled, so one size serves

export class Atmosphere {
  constructor(scene) {
    this.s = scene;
    this.on = !/noatmos/.test(location.search);
    // Per-piece switches, for ablation. Everything in here is a full-screen
    // blend or close to it, and "the atmosphere is slow" is not a finding --
    // which of the five is, is.
    const q = location.search;
    this.want = { fog: !/nofog/.test(q), motes: !/nomotes/.test(q),
                  vig: !/novig/.test(q), lights: !/nolights/.test(q) };
    this.bake();
    /* SCREEN SPACE IS CSS PIXELS.
     * scale.width is the game size, which is now the DEVICE resolution -- reading
     * it here would size this against the framebuffer while the DOM HUD beside it
     * is laid out in CSS pixels, and the two would disagree by the ratio. See the
     * note in main.js.
     */
    this.bakeScreen(scene.scale.displaySize.width, scene.scale.displaySize.height);

    // Fog, between the floor and the walls, exactly where the canvas build
    // puts it. A TileSprite is this drawing: one texture, wrapped, offset.
    this.fog = scene.add.tileSprite(0, 0, scene.scale.displaySize.width,
                                    scene.scale.displaySize.height, 'fogTile')
      .setOrigin(0, 0).setScrollFactor(0).setDepth(-2.5e5).setAlpha(0.9);
    // Drawn at twice its size, as the canvas build does: the tile is authored
    // at 256 and laid down over 512 world units, and at 1:1 the blobs read as
    // busy speckle rather than as haze.
    this.fog.tileScaleX = this.fog.tileScaleY = 2;

    // The light pass: pooled tinted blobs, additive. Sits between the sparks
    // and the numbers, because a number a glow has washed out is worse than no
    // number and that is the layer the player reads fastest.
    this.lights = [];
    this.lightDepth = 9.2e4;

    // Ash in the air, in front of the world. Screen-space with a parallax
    // nudge off the camera, so it belongs to the air and not to the floor.
    this.motes = [];
    for (let i = 0; i < MOTES; i++) {
      this.motes.push({
        x: Math.random(), y: Math.random(),
        z: 0.35 + Math.random() * 0.85,      // three depths, roughly
        s: 0.7 + Math.random() * 1.9,
        vy: 3 + Math.random() * 9,
        vx: -5 + Math.random() * 10,
        a: 0.12 + Math.random() * 0.3
      });
    }
    this.moteGfx = scene.add.graphics().setScrollFactor(0).setDepth(8.7e5);
    this.moteGfx.setBlendMode(Phaser.BlendModes.ADD);

    // The swap: the frame takes the colour of whoever just took the ground.
    this.flash = scene.add.image(0, 0, 'flat')
      .setOrigin(0, 0).setScrollFactor(0).setDepth(8.72e5).setVisible(false);
    this.flash.setBlendMode(Phaser.BlendModes.ADD);

    // The vignette is always there; the gloom is the Riftborn closing the room
    // down and only there while he does. Same texture, different weight.
    this.vig = scene.add.image(0, 0, 'vignette')
      .setOrigin(0, 0).setScrollFactor(0).setDepth(8.74e5);
    this.gloom = scene.add.image(0, 0, 'gloomTex')
      .setOrigin(0, 0).setScrollFactor(0).setDepth(8.75e5).setVisible(false);

    const fit = () => {
      const w = scene.scale.displaySize.width, h = scene.scale.displaySize.height;
      this.fog.setSize(w, h);
      this.flash.setDisplaySize(w, h);
      if (this.vig.width !== w || this.vig.height !== h) {
        this.bakeScreen(w, h);
        this.vig.setTexture('vignette');
        this.gloom.setTexture('gloomTex');
      }
      this.vig.setDisplaySize(w, h);
      this.gloom.setDisplaySize(w, h);
    };
    fit();
    scene.scale.on('resize', fit);
    if (!this.on) this.hideAll();
  }

  /* The three gradients, rasterised once. */
  bake() {
    const T = this.s.textures;
    if (!T.exists('lightBlob')) {
      const c = T.createCanvas('lightBlob', LIGHT_TEX, LIGHT_TEX);
      const g = c.getContext();
      const r = LIGHT_TEX / 2;
      const grd = g.createRadialGradient(r, r, 0, r, r, r);
      // White, so a tint can make it any colour. The stops are the canvas
      // build's lightFor(), which is what gives a torch its hot core and its
      // long soft fall-off rather than a flat disc.
      grd.addColorStop(0, 'rgba(255,255,255,.85)');
      grd.addColorStop(0.18, 'rgba(255,255,255,.42)');
      grd.addColorStop(0.45, 'rgba(255,255,255,.13)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.beginPath(); g.arc(r, r, r, 0, TAU); g.fill();
      c.refresh();
    }
    if (!T.exists('flat')) {
      // A flat white 4x4, tinted per use. A Shape (add.rectangle) was the
      // obvious thing and it never appeared: the shape pipeline does not carry
      // a blend mode, so an ADDITIVE full-screen flash drawn as one is simply
      // not drawn. An Image does.
      const c = T.createCanvas('flat', 4, 4);
      const g = c.getContext();
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, 4, 4);
      c.refresh();
    }
    if (!T.exists('fogTile')) {
      const S = 256;
      const c = T.createCanvas('fogTile', S, S);
      const g = c.getContext();
      for (let i = 0; i < 26; i++) {
        const x = Math.random() * S, y = Math.random() * S;
        const rr = 34 + Math.random() * 70;
        // Nine times, one per wrap. The canvas build draws each blob once and
        // gets away with it because it never really tiles; a TileSprite does,
        // and a blob clipped at the edge with nothing on the far side puts a
        // hard rectangular seam across the room. Drawing the same blob at all
        // nine offsets means whatever is cut off one edge arrives at the other.
        for (let ox = -1; ox <= 1; ox++) {
          for (let oy = -1; oy <= 1; oy++) {
            const bx = x + ox * S, by = y + oy * S;
            if (bx + rr < 0 || bx - rr > S || by + rr < 0 || by - rr > S) continue;
            const grd = g.createRadialGradient(bx, by, 0, bx, by, rr);
            grd.addColorStop(0, 'rgba(150,150,160,.055)');
            grd.addColorStop(1, 'rgba(150,150,160,0)');
            g.fillStyle = grd;
            g.beginPath(); g.arc(bx, by, rr, 0, TAU); g.fill();
          }
        }
      }
      c.refresh();
    }
  }

  /* The vignette and the gloom, baked at the ACTUAL viewport size.
   *
   * Not baked square and stretched, which was the first attempt and is wrong:
   * the canvas build's outer radius is max(w,h) * k, so on a 390x844 phone the
   * corners land around three quarters of the way down the ramp and the side
   * edges around a third. Stretch a square texture over that and the ellipse
   * reaches full black at the middle of both long edges -- a letterbox rather
   * than a vignette. Re-baked on resize instead, which is a one-off and what
   * the canvas build does.
   *
   * Two textures, not one at two alphas: they are different gradients. The
   * vignette is pulled in tight and taken almost to black at the rim, because
   * the Vanguard carries the only light and the edge of the screen should read
   * as the edge of what that light reaches. The gloom is the Riftborn taking
   * that light away, and it closes from much further in.
   */
  bakeScreen(w, h) {
    const T = this.s.textures;
    for (const k of ['vignette', 'gloomTex']) if (T.exists(k)) T.remove(k);

    const vc = T.createCanvas('vignette', w, h);
    const vg = vc.getContext();
    let grd = vg.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.16,
                                      w / 2, h / 2, Math.max(w, h) * 0.70);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(0.42, 'rgba(8,5,3,.34)');
    grd.addColorStop(0.74, 'rgba(6,4,2,.72)');
    grd.addColorStop(1, 'rgba(2,1,1,.985)');
    vg.fillStyle = grd; vg.fillRect(0, 0, w, h);
    // Faint warmth up top, cold blue down low: torch above, something else below.
    const tg = vg.createLinearGradient(0, 0, 0, h);
    tg.addColorStop(0, 'rgba(255,150,60,.045)');
    tg.addColorStop(0.5, 'rgba(0,0,0,0)');
    tg.addColorStop(1, 'rgba(60,110,180,.05)');
    vg.fillStyle = tg; vg.fillRect(0, 0, w, h);
    vc.refresh();

    const gc = T.createCanvas('gloomTex', w, h);
    const gg = gc.getContext();
    grd = gg.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.05,
                                  w / 2, h / 2, Math.max(w, h) * 0.42);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(0.5, 'rgba(4,2,1,.45)');
    grd.addColorStop(1, 'rgba(2,1,0,.96)');
    gg.fillStyle = grd; gg.fillRect(0, 0, w, h);
    gc.refresh();
  }

  hideAll() {
    this.fog.setVisible(false);
    this.moteGfx.clear().setVisible(false);
    this.vig.setVisible(false);
    this.gloom.setVisible(false);
    this.flash.setVisible(false);
    for (const im of this.lights) im.setVisible(false);
  }

  /* `o` is where the screen's CSS origin sits under the zoomed camera (see
   * screen.js). Every screen-space layer here is laid out from 0,0 in CSS
   * pixels, so pinning them to it is all any of them needs. */
  draw(t, o) {
    if (!this.on) return;
    o = o || { x: 0, y: 0 };
    for (const im of [this.fog, this.moteGfx, this.flash, this.vig, this.gloom])
      pinToScreen(im, o);
    if (this.want.lights) this.lightPass(t);
    // Everything below this line is mood, and mood is the first thing to go
    // when the frame is under pressure. lowFx is the core's own answer to
    // "are we missing the budget", so it is not second-guessed here.
    if (lowFx) {
      this.fog.setVisible(false);
      this.moteGfx.clear().setVisible(false);
      this.vig.setVisible(false);
      this.gloom.setVisible(false);
      this.flash.setVisible(false);
      return;
    }
    if (this.want.fog) this.fogPass(t); else this.fog.setVisible(false);
    if (this.want.motes) this.motePass(t); else this.moteGfx.clear().setVisible(false);
    this.vig.setVisible(this.want.vig);
    this.gloomPass();
    this.swapPass();
  }

  /* What actually lights the room. Pooled tinted blobs under ADD, culled to
   * the view, so a big cave costs no more than a small one. */
  lightPass(t) {
    let n = 0;
    const take = (x, y, span, colour, alpha) => {
      let im = this.lights[n];
      if (!im) {
        im = this.s.add.image(0, 0, 'lightBlob').setDepth(this.lightDepth);
        im.setBlendMode(Phaser.BlendModes.ADD);
        this.lights.push(im);
      }
      im.setVisible(true).setPosition(x, y).setDisplaySize(span, span)
        .setTint(colour).setAlpha(alpha);
      n++;
    };

    if (portal) {
      const pulse = portal.active ? 0.55 + 0.2 * Math.sin(t * 2.4) : 0.14;
      take(portal.x, portal.y, PORTAL_R * 3.2,
           hex(portal.active ? PAL.arcane : '#5a5244', 0x5a5244), pulse);
    }
    take(player.x, player.y, 108, hex(PAL.arcane, 0x5cb8ff), 0.3);
    const lit = Math.min(loot.length, 14);
    for (let i = 0; i < lit; i++) {
      take(loot[i].x, loot[i].y, 38, hex(PAL.gold, 0xffc24d), 0.34);
    }

    // Wall lamps, and the guttering that stops a torch reading as a decal.
    // worldView, not scrollX + width: see cullDressing in delve.js.
    const v = this.s.cameras.main.worldView;
    const vx0 = v.x - 80, vy0 = v.y - 80;
    const vx1 = v.right + 80, vy1 = v.bottom + 80;
    const flick = 0.78 + 0.22 * Math.sin(t * 7.3) * Math.sin(t * 3.1);
    for (const L of lamps) {
      if (L.x < vx0 || L.x > vx1 || L.y < vy0 || L.y > vy1) continue;
      const ember = L.color === PAL.ember;
      take(L.x, L.y, ember ? 138 : 112, hex(L.color, 0xffc24d),
           (ember ? 0.6 : 0.42) * flick);
    }
    for (let i = n; i < this.lights.length; i++) this.lights[i].setVisible(false);
    this.litCount = n;
  }

  /* Fog. ONE layer, source-over. Two layers under `lighter` measured 20ms a
   * frame on a software rasteriser -- more than the rest of the game put
   * together -- because it is two full-viewport alpha blends. This is the same
   * picture for a fraction of it: the second pass and the additive blend were
   * what cost, not the texture. */
  fogPass(t) {
    this.fog.setVisible(true);
    this.fog.tilePositionX = cam.x * 0.9 - t * 6;
    this.fog.tilePositionY = cam.y * 0.9 - t * 3;
  }

  motePass(t) {
    const g = this.moteGfx;
    g.clear().setVisible(true);
    const w = this.s.scale.displaySize.width, h = this.s.scale.displaySize.height;
    for (const m of this.motes) {
      let x = m.x * w + m.vx * t - cam.x * (1 - m.z) * 0.25;
      let y = m.y * h + m.vy * t - cam.y * (1 - m.z) * 0.25;
      x = ((x % w) + w) % w;
      y = ((y % h) + h) % h;
      const sz = m.s * m.z;
      g.fillStyle(0xd6c6a4, m.a * m.z);
      g.fillRect(x, y, sz, sz);
    }
  }

  /* The Riftborn closing the room down. In fast, hold, out -- and the hold is
   * the part that matters, because it is the only time you cannot see him. */
  gloomPass() {
    if (!run || !(run.gloom > 0)) { this.gloom.setVisible(false); return; }
    const f = run.gloom / GLOOM_TIME;
    const a = Math.min(1, f < 0.18 ? f / 0.18 : Math.min(1, (1 - f) / 0.22 + 0.35));
    this.gloom.setVisible(true).setAlpha(Math.max(0, GLOOM_DEPTH * a));
  }

  swapPass() {
    const sf = typeof swapFlash === 'number' ? swapFlash : 0;
    if (sf <= 0) { this.flash.setVisible(false); return; }
    const H = HEROES[player.hero] || {};
    this.flash.setVisible(true)
      .setTint(hex(H.magic, 0xffc24d))
      .setAlpha(sf * 0.5);
  }
}
