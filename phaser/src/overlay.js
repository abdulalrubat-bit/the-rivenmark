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
 * the map. One answer, one caller-visible function, both builds.
 */

/* global walls, enemies, player, run, view, portal, chests, WORLD, TAU, PAL,
          HUD_H, CHEST_KINDS, CORPSE_HUE */

const hex = (css, fallback) => {
  if (typeof css !== 'string') return fallback === undefined ? 0xffffff : fallback;
  const n = parseInt(css.replace('#', ''), 16);
  return Number.isFinite(n) ? n : (fallback === undefined ? 0xffffff : fallback);
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
    // The core places the False Dawn crystal by asking where the map is.
    window.minimapBox = minimapBox;
  }

  draw(t) {
    const g = this.g;
    g.clear();
    this.map(g);
    this.arrow(g, t);
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
    this.compass.setPosition(nx, ny - 11 * mk)
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
    const c = this.s.cameras.main;
    const sx = portal.x - c.scrollX, sy = portal.y - c.scrollY;
    const m = 48, mTop = 96;
    if (sx > m && sx < c.width - m && sy > mTop && sy < c.height - m) return;

    const cx = c.width / 2, cy = (mTop + (c.height - m)) / 2;
    const a = Math.atan2(sy - cy, sx - cx);
    const dx = Math.cos(a), dy = Math.sin(a);
    const k = Math.min((cx - m) / Math.max(1e-6, Math.abs(dx)),
                       ((c.height - m - mTop) / 2) / Math.max(1e-6, Math.abs(dy)));
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
