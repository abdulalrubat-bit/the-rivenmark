/* Everything the fight throws off, drawn from the core's own pools.
 *
 * The core owns all of it -- arcs, particles, rings, floaters, bolts, slams,
 * hazards, pools, totems, ruptures -- because most of them are not decoration:
 * a hazard burns, a Null-Zone slows, a slam telegraph is the only warning you
 * get. They are simulation with a picture attached, so the picture is drawn
 * from the simulation rather than kept alongside it.
 *
 * All the vector work goes into ONE Graphics, cleared and redrawn each frame.
 * That is a single object for the renderer to batch instead of hundreds, and
 * it is the shape of thing a GPU renderer is happy with -- unlike the canvas
 * build, where each of these was its own per-frame call.
 */

import Phaser from 'phaser';

/* global arcs, particles, rings, floaters, bolts, slams, hazards, nulls,
          totems, ruptures, player, cam, FLOAT_STYLE, FLOAT_LIFE, BOLT_R,
          TAU, HEROES, run, portal, drops, PORTAL_R, PAL, LEVEL, rarityOf,
          CORPSE_HUE */

const RIM = '#060403';   // the dark edge every ordinary number carries

/* How tall a drop's beacon stands, by rarity. A lozenge on the floor is a few
 * pixels in a dark room full of debris and goes straight past you; the shaft
 * is what carries across a chamber, and its height says what the thing is
 * worth before you have walked over to look. */
const BEACON_H = { worn: 54, tempered: 74, wrought: 98,
                   hallowed: 124, riven: 150, mythic: 190 };

/* Phaser's Graphics has no gradients, and the canvas build's beacons and light
 * pools are gradients. Both are faked with a few stacked shapes, which is what
 * a gradient is anyway once it is rasterised -- and at these sizes the banding
 * is invisible while the cost is a handful of quads instead of a texture
 * upload per drop per frame. */
const BEAM_STEPS = 5, POOL_STEPS = 4;

const hex = css => {
  if (typeof css !== 'string') return 0xffffff;
  const m = css.replace('#', '');
  const n = parseInt(m.length === 3 ? m.replace(/./g, c => c + c) : m, 16);
  return Number.isFinite(n) ? n : 0xffffff;
};

export class Effects {
  constructor(scene) {
    this.s = scene;
    // Under the scenery: the waygate, which is cut into the floor. The canvas
    // build draws it before the walls go down, and a barrel standing in front
    // of it has to stay in front of it.
    this.gateGfx = scene.add.graphics().setDepth(-1.2e5);
    // Beacon light. Its own layer because it is ADDITIVE: a shaft of light
    // over a lit floor has to brighten it, and the canvas build draws these
    // under `globalCompositeOperation = 'lighter'` for exactly that reason.
    // Drawn normally they read as solid orange wedges standing in the room.
    this.lightGfx = scene.add.graphics().setDepth(-450);
    this.lightGfx.setBlendMode(Phaser.BlendModes.ADD);
    // Under the bodies: ground work — hazards, pools, telegraphs, the arcs.
    this.below = scene.add.graphics().setDepth(-500);
    // Over them: sparks and rings, which read as light in the air.
    this.above = scene.add.graphics().setDepth(9e4);
    this.texts = [];        // pooled damage numbers, grown to fit
  }

  draw(t) {
    const b = this.below, a = this.above, gt = this.gateGfx, li = this.lightGfx;
    b.clear(); a.clear(); gt.clear(); li.clear();
    this.gate(gt, t);
    this.ground(b, t);
    this.beacons(b, li, t);
    this.crescents(b, t);
    this.spark(a);
    this.numbers();
  }

  /* Ground work. Everything here is a circle on the floor that means something
   * in play: standing in it costs you, or it is about to. */
  ground(g, t) {
    for (const h of hazards) {                 // burning floor
      const f = Math.max(0, h.life / h.max);
      g.fillStyle(hex(h.hue), 0.16 * f + 0.06);
      g.fillCircle(h.x, h.y, h.r);
      g.lineStyle(2, hex(h.hue), 0.5 * f);
      g.strokeCircle(h.x, h.y, h.r);
    }
    for (const z of nulls) {                   // Zayd's pool
      const f = Math.min(1, z.life / Math.min(1.2, z.max));
      g.fillStyle(0x1a0a2e, 0.80 * f);
      g.fillCircle(z.x, z.y, z.r);
      g.lineStyle(2, 0xb07cff, 0.5 * f);
      g.strokeCircle(z.x, z.y, z.r);
    }
    for (const m of totems) {                  // the shaman's mend
      const f = Math.max(0, m.hp / m.maxHp);
      g.lineStyle(2, 0x8fe07a, 0.35);
      g.strokeCircle(m.x, m.y, m.r);
      g.fillStyle(0x8fe07a, 0.07);
      g.fillCircle(m.x, m.y, m.r);
      g.fillStyle(0x8fe07a, 0.9);
      g.fillRect(m.x - 3, m.y - 16 - 10 * f, 6, 16 + 10 * f);
    }
    for (const r of ruptures) {                // the Deceiver's ground
      const f = 1 - Math.max(0, r.t / r.max);
      g.fillStyle(0xe8c060, 0.10 + 0.26 * f);
      g.fillCircle(r.x, r.y, 96);
      g.lineStyle(2 + 2 * f, 0xffd870, 0.5 + 0.4 * f);
      g.strokeCircle(r.x, r.y, 96);
    }
    for (const s of slams) {                   // the blow with a wind-up
      const f = Math.min(1, s.t / s.wind);
      g.lineStyle(3, s.husk ? 0xc8d63a : 0xe0402c, 0.35 + 0.5 * f);
      g.strokeCircle(s.x, s.y, s.r);
      g.fillStyle(s.husk ? 0xc8d63a : 0xe0402c, 0.10 + 0.18 * f);
      g.fillCircle(s.x, s.y, s.r * f);         // the fill IS the timer
    }
  }

  /* The waygate.
   *
   * The one thing in a delve you have to find, so it is drawn whether or not
   * it is awake: a worked stone circle, dormant and grey until enough essence
   * is drawn, then turning and lit. The rune ring counter-rotates against the
   * sigil so the whole thing reads as machinery rather than a decal, and the
   * channel -- the seconds you stand in it to leave -- closes as a gold arc
   * around the kerb, because the only question at that moment is how much
   * longer.
   */
  gate(g, t) {
    if (!portal) return;
    const on = portal.active;
    const pulse = 0.5 + 0.5 * Math.sin(t * (on ? 2.4 : 0.9));
    const R = PORTAL_R, x = portal.x, y = portal.y;
    const glow = hex(on ? (PAL.arcane || '#5cb8ff') : '#6a6152');

    g.fillStyle(on ? 0x5cb8ff : 0x3c362c, on ? 0.07 : 0.22);
    g.fillCircle(x, y, R);
    g.lineStyle(9, 0x4a4137, 1); g.strokeCircle(x, y, R - 4);
    g.lineStyle(1.4, 0xceb48c, 0.4);
    g.strokeCircle(x, y, R - 8); g.strokeCircle(x, y, R);
    g.lineStyle(2, glow, on ? 0.85 : 0.34);
    g.strokeCircle(x, y, R * (0.42 + pulse * 0.3));

    // Ten bound runes on a slowly turning ring. Three shapes, cycled -- the
    // canvas build's, kept so the two gates are the same object.
    const spin = t * (on ? 0.5 : 0.08);
    g.lineStyle(2.4, glow, on ? 0.95 : 0.4);
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU + spin, rr = R - 20;
      const cx = x + Math.cos(a) * rr, cy = y + Math.sin(a) * rr;
      const ca = Math.cos(a + Math.PI / 2), sa = Math.sin(a + Math.PI / 2);
      const P = (ox, oy) => [cx + ox * ca - oy * sa, cy + ox * sa + oy * ca];
      const seg = pts => {
        g.beginPath();
        pts.forEach(([px, py], k) => (k ? g.lineTo(px, py) : g.moveTo(px, py)));
        g.strokePath();
      };
      if (i % 3 === 0)      seg([P(-3, -4), P(3, 0), P(-3, 4)]);
      else if (i % 3 === 1) { seg([P(-3, -4), P(-3, 4)]); seg([P(-3, 0), P(3, 0)]); }
      else                  seg([P(-3, 4), P(0, -4), P(3, 4)]);
    }

    // The sigil, turning the other way.
    const sp = -t * (on ? 0.3 : 0.05), rr = R * 0.26;
    g.lineStyle(1.6, on ? 0xc4e8ff : 0x786e5e, on ? 0.8 : 0.45);
    g.beginPath();
    for (let i = 0; i <= 3; i++) {
      const a = (i % 3 / 3) * TAU - Math.PI / 2 + sp;
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      i ? g.lineTo(px, py) : g.moveTo(px, py);
    }
    g.closePath(); g.strokePath();

    if (portal.channel > 0) {
      const f = portal.channel / (LEVEL.channel || 1);
      g.lineStyle(9, 0xffc24d, 0.25);
      g.beginPath(); g.arc(x, y, R + 10, -Math.PI / 2, -Math.PI / 2 + TAU * f, false);
      g.strokePath();
      g.lineStyle(3.4, hex(PAL.gold || '#ffc24d'), 1);
      g.beginPath(); g.arc(x, y, R + 10, -Math.PI / 2, -Math.PI / 2 + TAU * f, false);
      g.strokePath();
    }
  }

  /* Beacons: gear on the floor, and where you died.
   *
   * Both are shafts of light because both are things you have to be able to
   * see from across a room. They are deliberately different colours of light:
   * a drop wears its rarity, the corpse a cold pale that belongs to no rarity
   * at all, so your own body is never mistaken for loot at a glance.
   */
  beacons(g, li, t) {
    for (const d of drops) {
      const r = rarityOf(d.item);
      const c = hex(r.colour);
      const h = BEACON_H[r.id] || 60;
      const pulse = 0.72 + 0.28 * Math.sin(t * 2.6 + d.x * 0.03);
      const bob = Math.sin(t * 3 + d.x * 0.05) * 2.2;
      this.shaft(li, d.x, d.y, h, 15, 7, c, 0.34 * pulse);
      this.pool(li, d.x, d.y + 4, 26, 12, c, 0.30 * pulse);
      g.fillStyle(0x060504, 0.6);
      g.fillEllipse(d.x, d.y + 9, 16, 6.8);
      const y = d.y + bob;                      // the lozenge itself
      g.fillStyle(c, 1);
      g.beginPath();
      g.moveTo(d.x, y - 8); g.lineTo(d.x + 5.5, y);
      g.lineTo(d.x, y + 8);  g.lineTo(d.x - 5.5, y);
      g.closePath(); g.fillPath();
      g.lineStyle(1, 0xfffaf0, 0.85); g.strokePath();
    }

    const c = run && run.corpse;
    if (!c || c.taken) return;
    const pulse = 0.66 + 0.34 * Math.sin(t * 1.7);
    const hue = hex(CORPSE_HUE);
    this.shaft(li, c.x, c.y, 108, 20, 9, hue, 0.58 * pulse);
    this.pool(li, c.x, c.y + 5, 40, 18, hue, 0.52 * pulse);

    // The cairn: stacked stones with your own blade driven into them, canted
    // off vertical and broken short. Upright and symmetrical it read as a
    // crucifix, which is the one thing this marker must not look like.
    g.fillStyle(0x060504, 0.62); g.fillEllipse(c.x, c.y + 10, 38, 14);
    g.fillStyle(0x494540, 1);    g.fillEllipse(c.x, c.y + 5, 32, 13);
    g.fillStyle(0x5c574e, 1);    g.fillEllipse(c.x - 2, c.y - 2, 22, 9.2);
    g.fillStyle(0x6a6459, 1);    g.fillEllipse(c.x + 3, c.y - 7, 13, 6);
    const ox = c.x + 2, oy = c.y - 8, ca = Math.cos(-0.22), sa = Math.sin(-0.22);
    const P = (px, py) => [ox + px * ca - py * sa, oy + px * sa + py * ca];
    const poly = (pts, col, al) => {
      g.fillStyle(col, al);
      g.beginPath();
      pts.forEach(([px, py], k) => (k ? g.lineTo(px, py) : g.moveTo(px, py)));
      g.closePath(); g.fillPath();
    };
    poly([P(-2.6, 2), P(-2.0, -26), P(2.0, -26), P(2.6, 2)], hue, 0.92);
    poly([P(-9, -1), P(9, -3), P(9, 0.4), P(-9, 2.4)], 0x8d8577, 1);
    const [bx, by] = P(0, 5.5);
    g.fillStyle(0xa49a86, 1); g.fillCircle(bx, by, 2.6);
  }

  /* A shaft of light: brightest at the floor, gone by the top. Stacked bands
   * standing in for the gradient Graphics cannot draw. */
  shaft(g, x, y, h, wTop, wBot, colour, alpha) {
    for (let i = 0; i < BEAM_STEPS; i++) {
      const a = i / BEAM_STEPS, b = (i + 1) / BEAM_STEPS;   // 0 = top
      const wa = wTop + (wBot - wTop) * a, wb = wTop + (wBot - wTop) * b;
      const ya = y + 4 - h * (1 - a), yb = y + 4 - h * (1 - b);
      g.fillStyle(colour, alpha * b * b * (1 / BEAM_STEPS) * 2.2);
      g.beginPath();
      g.moveTo(x - wa, ya); g.lineTo(x + wa, ya);
      g.lineTo(x + wb, yb); g.lineTo(x - wb, yb);
      g.closePath(); g.fillPath();
    }
  }

  /* The pool of light it throws on the floor. */
  pool(g, x, y, rw, rh, colour, alpha) {
    for (let i = POOL_STEPS; i >= 1; i--) {
      const f = i / POOL_STEPS;
      g.fillStyle(colour, alpha * (1 - f) * (0.9 / POOL_STEPS) * 2.4 + alpha * 0.04);
      g.fillEllipse(x, y, rw * 2 * f, rh * 2 * f);
    }
  }

  /* The crescent. It is the whole attack -- the blade's swing is animation and
   * carries no damage -- so if this is not drawn the fight looks like nothing
   * is happening, which is exactly how the port looked before it existed.
   *
   * Drawn as a band along the arc the blade scribes: `bow` is the radius,
   * `half` how far around it reaches, `band` its thickness.
   */
  crescents(g, t) {
    const colour = hex((HEROES[player.hero] || {}).magic || '#ffc24d');
    for (const c of arcs) {
      if (c.delay > 0) continue;
      const f = Math.max(0, Math.min(1, c.life / c.maxLife));
      // Behind the crescent's leading point sits the centre of its arc.
      const cx = c.x - c.dx * c.bow, cy = c.y - c.dy * c.bow;
      const span = Math.atan2(c.half, c.bow);
      g.lineStyle(c.band, colour, 0.35 + 0.5 * f);
      g.beginPath();
      g.arc(cx, cy, c.bow, c.a - span, c.a + span, false);
      g.strokePath();
      // A brighter inner edge, so it reads as an edge rather than a smear.
      g.lineStyle(Math.max(1, c.band * 0.35), 0xfff2c8, 0.5 * f);
      g.beginPath();
      g.arc(cx, cy, c.bow, c.a - span * 0.7, c.a + span * 0.7, false);
      g.strokePath();
    }
    for (const bo of bolts) {                  // what the back rank throws
      g.fillStyle(hex(bo.colour), 0.9);
      g.fillCircle(bo.x, bo.y, BOLT_R * 0.6);
      g.lineStyle(1.5, 0xffffff, 0.35);
      g.strokeCircle(bo.x, bo.y, BOLT_R * 0.6);
    }
  }

  /* Sparks and rings: the light, over the bodies. */
  spark(g) {
    for (const p of particles) {
      const f = Math.max(0, p.life / p.max);
      g.fillStyle(hex(p.color), Math.min(1, f + 0.15));
      g.fillCircle(p.x, p.y, p.size * (0.5 + f * 0.5));
    }
    for (const r of rings) {
      const f = 1 - Math.max(0, r.life / r.max);
      g.lineStyle(2, hex(r.color), Math.max(0, 1 - f) * 0.8);
      g.strokeCircle(r.x, r.y, r.r0 + (r.r1 - r.r0) * f);
    }
  }

  /* The numbers.
   *
   * Ranked rather than uniform, which is the whole point of the hierarchy in
   * FLOAT_STYLE: a scratch is small and dim, a heavy landing is large and
   * bright and rimmed in its own colour, a soaked one shrinks and greys. Read
   * straight off the core's style table so the two builds cannot disagree
   * about what a hit looks like.
   *
   * Pooled Text objects. There are never many -- the core caps and merges them
   * -- and a Text that is reused costs nothing to keep around.
   */
  numbers() {
    while (this.texts.length < floaters.length) {
      this.texts.push(this.s.add.text(0, 0, '', {
        fontFamily: 'ui-monospace, "SF Mono", monospace', fontStyle: 'bold'
      }).setOrigin(0.5, 0.5).setDepth(9.5e4));
    }
    for (let i = 0; i < this.texts.length; i++) {
      const o = this.texts[i], f = floaters[i];
      if (!f) { o.setVisible(false); continue; }
      const st = FLOAT_STYLE[f.kind] || FLOAT_STYLE.hit;
      const t = 1 - f.life / FLOAT_LIFE;
      // In quickly, then hold, then out -- the same easing the canvas build
      // uses, so a number does not simply appear and vanish.
      const alpha = t < 0.1 ? t / 0.1 : Math.min(1, (1 - t) / 0.45);
      const px = st.px * (1 + (st.pop || 0.2) * (f.pop || 0));
      const txt = f.word || ((f.kind === 'taken' ? '-' : '') + f.n);
      if (o.text !== txt) o.setText(txt);
      o.setVisible(true)
       .setPosition(f.x, f.y)
       .setAlpha(Math.max(0, alpha))
       .setColor(st.c)
       .setFontSize(Math.round(px))
       // A heavy landing rims itself in its own colour, which is what makes it
       // glow; everything else takes a dark edge so it stays legible over a
       // lit floor, a body and a wall alike.
       .setStroke(st.glow ? st.c : RIM, st.w);
    }
  }
}
