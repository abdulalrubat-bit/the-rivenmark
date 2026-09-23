/* Screen-space overlays: the map, and the arrow to the way out.
 *
 * These are the only two things in the delve that are drawn in SCREEN space
 * rather than world space, and they are the two that answer "where am I" and
 * "which way is out". Without them a delve is a dark room you wander until the
 * timer runs down, which is what the port was before this file.
 *
 * Phaser Graphics rather than DOM, unlike the HUD. The map plots sixty-odd
 * walls, every awake body, the coffers and your own corpse every frame; that
 * is vector work, and vector work is what a Graphics is for. Text stays in the
 * DOM HUD where it is crisp.
 *
 * This file also owns minimapBox(), and the core calls it: the False Dawn
 * crystal is placed UNDER the map by reading the same box, and in the canvas
 * build the two drifted apart once and the crystal was drawn straight through
 * the map. One answer, one caller-visible function.
 */

/* global walls, enemies, player, run, view, portal, chests, WORLD, TAU, PAL,
          HUD_H, CHEST_KINDS, CORPSE_HUE, DAWN_MAX, dawnCrystalRect */

import { pinToScreen } from './screen.js';

const hex = (css, fallback) => {
  if (typeof css !== 'string') return fallback === undefined ? 0xffffff : fallback;
  const n = parseInt(css.replace('#', ''), 16);
  return Number.isFinite(n) ? n : (fallback === undefined ? 0xffffff : fallback);
};

/* Blend two packed colours. Phaser's Graphics takes one colour per fill, so
 * every gradient in here is banded, and this is what picks each band. */
const mix = (a, b2, f) => {
  const t = Math.max(0, Math.min(1, f));
  const r = ((a >> 16 & 255) * (1 - t) + (b2 >> 16 & 255) * t) | 0;
  const g = ((a >> 8 & 255) * (1 - t) + (b2 >> 8 & 255) * t) | 0;
  const b = ((a & 255) * (1 - t) + (b2 & 255) * t) | 0;
  return (r << 16) | (g << 8) | b;
};

const BOSS_BAR_H = 44;    // the canvas build's, so the map drops by the same

/* Which body owns the frame. An invader is the nearer problem: while one is
 * standing he is the thing about to kill you. */
export function bossShown() {
  if (typeof run === 'undefined' || !run) return null;
  if (run.invader && run.invader.hp > 0) return run.invader;
  if (run.boss && run.boss.hp > 0) return run.boss;
  return null;
}
export function bossBarDrop() { return bossShown() ? BOSS_BAR_H + 8 : 0; }

/* Where the map sits. Top-right and tucked under the HUD bar: the bottom
 * corners are where the thumbs live on a phone, and a map there is under a
 * hand for most of a run. At 94px the whole 2000-unit world came out too small
 * to read, so it is larger and its markers scale with it. */
export function minimapBox() {
  const s = Math.round(Math.min(132, Math.max(96, (view.w || 390) * 0.30)));
  const pad = 14;         // the stone surround overhangs the panel by 7px each side
  return { s, pad, over: 7,
           x: (view.w || 390) - s - pad - (view.safeR || 0),
           y: HUD_H + pad + (view.safeT || 0) + bossBarDrop() };
}

export class Overlay {
  constructor(scene) {
    this.s = scene;
    this.g = scene.add.graphics().setScrollFactor(0).setDepth(8.8e5);
    this.compass = scene.add.text(0, 0, 'S', {
      fontFamily: 'ui-monospace, Menlo, monospace', fontStyle: '600',
      fontSize: '9px', color: '#e2c48c'
    }).setOrigin(0.5, 0.5).setScrollFactor(0).setDepth(8.81e5);
    const label = (x, y, txt, size, ox) => scene.add.text(x, y, txt, {
      fontFamily: 'ui-monospace, Menlo, monospace', fontStyle: '600',
      fontSize: size, color: '#cebe9e'
    }).setOrigin(ox, 0.5).setScrollFactor(0).setDepth(8.81e5).setVisible(false);
    this.dawnLabel = label(0, 0, 'FALSE DAWN', '8px', 1);
    this.dawnPct = label(0, 0, '', '9px', 0.5);
    // The core places the False Dawn crystal by asking where the map is.
    window.minimapBox = minimapBox;
  }

  /* `o` is where the screen's CSS origin sits under the zoomed camera (see
   * screen.js). The Graphics is pinned to it, so everything drawn into it stays
   * in CSS pixels; the labels are separate objects and carry it themselves. */
  draw(t, o) {
    this.o = o || { x: 0, y: 0 };
    const g = this.g;
    pinToScreen(g, this.o);
    g.clear();
    this.map(g);
    this.crystal(g, t);
    this.arrow(g, t);
  }

  /* The False Dawn.
   *
   * A column of light in a flawed crystal, under the map -- placed by the
   * CORE's dawnCrystalRect(), which reads minimapBox(). The canvas build wrote
   * that arithmetic out a second time here once and drew the crystal straight
   * through the map, with its label clipped by the screen edge on top of that.
   *
   * It is the fight's second clock and the only one that matters: full is a
   * wipe. So it pops when it climbs, its surface is restless so a meter that
   * is moving looks like it is moving, and past four-fifths the rim stops
   * being trim and starts flashing.
   */
  crystal(g, t) {
    const hide = () => { this.dawnLabel.setVisible(false); this.dawnPct.setVisible(false); };
    const bs = bossShown();
    if (!bs || bs.invader || !run || run.dawn === undefined) return hide();
    const f = Math.max(0, Math.min(1, (run.dawn || 0) / DAWN_MAX));
    if (f <= 0 && !((run.breath || 0) > 0)) return hide();

    const r = dawnCrystalRect();
    // The pop is a scale about the crystal's own centre.
    const k = 1 + (run.dawnPop || 0) * 0.06;
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    const P = (px, py) => [cx + (px - cx) * k, cy + (py - cy) * k];
    // One outline, used for the body and the rim, so the two can never
    // disagree about where the edge is.
    const face = [[0.5, 0], [1, 0.17], [0.82, 0.55], [1, 0.78],
                  [0.5, 1], [0, 0.78], [0.18, 0.55], [0, 0.17]]
      .map(([u, v]) => P(r.x + r.w * u, r.y + r.h * v));
    const trace = () => {
      g.beginPath();
      face.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py)));
      g.closePath();
    };
    trace(); g.fillStyle(0x08070a, 0.86); g.fillPath();

    // The light in it, rising from the bottom. Clipped to the crystal by
    // drawing it as bands inside the body's own width at each height -- a
    // Graphics mask for one shape every frame costs more than the shape does.
    const fy = r.y + r.h * (1 - f);
    const BANDS = 14;
    const halfAt = v => {                       // the body's half-width at 0..1
      // The tip is a POINT, not a half-width bar: the outline runs from
      // (0.5w, 0) to (w, 0.17h), so the body is zero wide at the very top.
      const u = v < 0.17 ? v / 0.17
              : v < 0.55 ? 1 - ((v - 0.17) / 0.38) * 0.18
              : v < 0.78 ? 0.82 + ((v - 0.55) / 0.23) * 0.18
              : 1 - ((v - 0.78) / 0.22);
        return u * (r.w / 2);
    };
    for (let i = 0; i < BANDS; i++) {
      const y0 = fy + (r.y + r.h - fy) * (i / BANDS);
      const y1 = fy + (r.y + r.h - fy) * ((i + 1) / BANDS);
      const v = (y0 - r.y) / r.h;
      const q = (y0 - fy) / Math.max(1, r.h - (fy - r.y));   // 0 at the surface
      // Pale at the surface, gold in the body, dark at the base: the canvas
      // build's three gradient stops, banded.
      const col = q < 0.45 ? mix(0xfff2c8, 0xe8c060, q / 0.45)
                           : mix(0xe8c060, 0xa0681c, (q - 0.45) / 0.55);
      const hw = halfAt(Math.max(0, Math.min(1, v))) * k;
      const [ax, ay] = P(cx, y0), [, by2] = P(cx, y1);
      g.fillStyle(col, 0.92);
      g.fillRect(ax - hw, ay, hw * 2, Math.max(1, by2 - ay) + 1);
    }
    // A restless surface, so a meter that is climbing looks like it is.
    const sy = fy + Math.sin(t * 5) * 1.6;
    const shw = halfAt(Math.max(0, Math.min(1, (sy - r.y) / r.h))) * k;
    const [sx, syp] = P(cx, sy);
    g.fillStyle(0xfff8dc, 0.75); g.fillRect(sx - shw, syp, shw * 2, 2);

    const hot = f > 0.8;
    g.lineStyle(hot ? 2.4 : 1.6,
                hot ? mix(0xff9670, 0xffd870, 0.5 + 0.5 * Math.sin(t * 12)) : 0xd6b26e,
                hot ? 0.95 : 0.85);
    trace(); g.strokePath();

    // Right-aligned to the crystal's own edge: centred on a 34px column the
    // words ran off the side of the phone.
    this.dawnLabel.setPosition(this.o.x + r.x + r.w, this.o.y + r.y - 9)
                  .setColor(hot ? '#ffbe8c' : '#cebe9e').setVisible(true);
    this.dawnPct.setPosition(this.o.x + r.x + r.w / 2, this.o.y + r.y + r.h + 9)
                .setText(Math.round(run.dawn || 0) + '%')
                .setColor(hot ? '#ffbe8c' : '#cebe9e').setVisible(true);
  }

  /* The stone plate everything on this layer is cut from: a slate face inside
   * a bronze band. The canvas build's framePlate, without the texture fill --
   * the band and the two rules are what make it read as set into stone. */
  plate(g, x, y, w, h) {
    const o = 7;
    g.fillStyle(0x2a2620, 1);
    g.fillRect(x - o, y - o, w + o * 2, h + o * 2);
    g.lineStyle(2, 0x8c6830, 0.85);
    g.strokeRect(x - o + 1, y - o + 1, w + o * 2 - 2, h + o * 2 - 2);
    g.lineStyle(1, 0x0a0805, 0.7);
    g.strokeRect(x - 1, y - 1, w + 2, h + 2);
  }

  /* The map.
   *
   * Only what has NOTICED you is plotted. Every dormant body on the map would
   * hand the player the location of every pack in the delve before they set
   * out, which is the whole thing the packs exist to avoid. Coffers are
   * plotted until they are opened -- a coffer you cannot find is not a reason
   * to explore, it is a reason to be annoyed -- and your own corpse always is:
   * finding it is not meant to be the challenge, getting to it and back out
   * is.
   */
  map(g) {
    const box = minimapBox();
    const S = box.s, x = box.x, y = box.y;
    const k = S / WORLD.w;
    const mk = S / 108;             // markers grow with the frame

    this.plate(g, x, y, S, S);
    g.fillStyle(0x090c11, 0.88);
    g.fillRect(x, y, S, S);

    // Rock. Pale, because at the panel's own value a corridor was unreadable.
    g.fillStyle(0x968462, 0.42);
    for (let i = 4; i < walls.length; i++) {
      const w = walls[i];
      g.fillRect(x + w.x * k, y + w.y * k, Math.max(1, w.w * k), Math.max(1, w.h * k));
    }

    g.fillStyle(0xd66040, 0.9);
    const es = Math.max(1.7, 2.2 * mk);
    for (const e of enemies) {
      if (!e.awake || e.hp <= 0) continue;
      g.fillRect(x + e.x * k - es / 2, y + e.y * k - es / 2, es, es);
    }

    if (portal) {
      g.fillStyle(portal.active ? hex(PAL.arcane, 0x5cb8ff) : 0x7a6e58, 1);
      g.fillCircle(x + portal.x * k, y + portal.y * k, 4 * mk);
    }

    // The invader is plotted whatever else is hidden: losing him is a decision
    // you make, not a thing that happens because you could not find him.
    const inv = run && run.invader;
    if (inv && inv.hp > 0) {
      const ix = x + inv.x * k, iy = y + inv.y * k;
      g.fillStyle(0xe8c060, 0.95); g.fillCircle(ix, iy, 3.4 * mk);
      g.lineStyle(1.4 * mk, 0xe2782c, 0.8); g.strokeCircle(ix, iy, 6.4 * mk);
    }

    for (const ch of chests) {
      if (ch.open) continue;
      const K = CHEST_KINDS[ch.kind] || {};
      const bx = x + ch.x * k, by = y + ch.y * k, r = 2.6 * mk;
      g.fillStyle(hex(K.colour, 0xc9a24a), 1);
      g.fillRect(bx - r, by - r * 0.8, r * 2, r * 1.6);
      g.lineStyle(1, 0x000000, 0.7);
      g.strokeRect(bx - r, by - r * 0.8, r * 2, r * 1.6);
    }

    const c = run && run.corpse;
    if (c && !c.taken) {
      const cx = x + c.x * k, cy = y + c.y * k, r = 4 * mk;
      g.lineStyle(1.6 * mk, hex(CORPSE_HUE, 0x9fc2d8), 1);
      g.beginPath();
      g.moveTo(cx - r, cy - r); g.lineTo(cx + r, cy + r);
      g.moveTo(cx + r, cy - r); g.lineTo(cx - r, cy + r);
      g.strokePath();
    }

    // The player pip carries a dark ring so it stays readable over pale rock.
    const px = x + player.x * k, py = y + player.y * k;
    g.fillStyle(0xffffff, 1); g.fillCircle(px, py, 3.2 * mk);
    g.lineStyle(1.6 * mk, 0x000000, 0.75); g.strokeCircle(px, py, 3.2 * mk);

    // Compasses point south now. The needle is drawn as it reads, not as it
    // ought to -- one of the Final Signs, and a standing reminder of it.
    const nx = x + S - 15 * mk, ny = y + 15 * mk;
    g.lineStyle(1, 0xe2c48c, 0.55); g.strokeCircle(nx, ny, 8.5 * mk);
    g.fillStyle(0xe07850, 0.95);
    g.beginPath();
    g.moveTo(nx, ny + 8 * mk); g.lineTo(nx - 3 * mk, ny); g.lineTo(nx + 3 * mk, ny);
    g.closePath(); g.fillPath();
    this.compass.setPosition(this.o.x + nx, this.o.y + ny - 11 * mk)
                .setFontSize(Math.round(8 * mk))
                .setVisible(true);
  }

  /* The arrow to the way out, when the gate is off screen. It rides the edge
   * of the play area rather than the edge of the window: the HUD owns the top
   * strip and the kit owns the bottom, and an arrow under a thumb is an arrow
   * nobody sees. Bright and beating once the gate is awake, dim before.
   */
  arrow(g, t) {
    if (!portal) return;
    // All in CSS pixels. worldView is the part of the world actually on
    // screen, in world units, which ARE CSS pixels; scrollX with the camera's
    // own width mixed world units with device pixels and put the arrow
    // somewhere off the phone at any ratio above 1.
    const v = this.s.cameras.main.worldView;
    const W = v.width, H = v.height;
    const sx = portal.x - v.x, sy = portal.y - v.y;
    const m = 48, mTop = 96;
    if (sx > m && sx < W - m && sy > mTop && sy < H - m) return;

    const cx = W / 2, cy = (mTop + (H - m)) / 2;
    const a = Math.atan2(sy - cy, sx - cx);
    const dx = Math.cos(a), dy = Math.sin(a);
    const k = Math.min((cx - m) / Math.max(1e-6, Math.abs(dx)),
                       ((H - m - mTop) / 2) / Math.max(1e-6, Math.abs(dy)));
    const px = cx + dx * k, py = cy + dy * k;
    const col = portal.active ? hex(PAL.arcane, 0x5cb8ff) : 0x7a6e58;
    const al = 0.55 + (portal.active ? 0.4 * Math.abs(Math.sin(t * 3)) : 0.1);

    g.fillStyle(0x0e0a07, 0.8 * al); g.fillCircle(px, py, 15);
    g.lineStyle(1.2, col, al); g.strokeCircle(px, py, 15);
    const P = (ox, oy) => [px + ox * dx - oy * dy, py + ox * dy + oy * dx];
    g.fillStyle(col, al);
    g.beginPath();
    [P(9, 0), P(-5, 6), P(-2, 0), P(-5, -6)].forEach(([qx, qy], i) =>
      i ? g.lineTo(qx, qy) : g.moveTo(qx, qy));
    g.closePath(); g.fillPath();
  }
}
