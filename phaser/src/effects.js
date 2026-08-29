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

/* global arcs, particles, rings, floaters, bolts, slams, hazards, nulls,
          totems, ruptures, player, cam, FLOAT_STYLE, FLOAT_LIFE, BOLT_R,
          TAU, HEROES, run */

const RIM = '#060403';   // the dark edge every ordinary number carries

const hex = css => {
  if (typeof css !== 'string') return 0xffffff;
  const m = css.replace('#', '');
  const n = parseInt(m.length === 3 ? m.replace(/./g, c => c + c) : m, 16);
  return Number.isFinite(n) ? n : 0xffffff;
};

export class Effects {
  constructor(scene) {
    this.s = scene;
    // Under the bodies: ground work — hazards, pools, telegraphs, the arcs.
    this.below = scene.add.graphics().setDepth(-500);
    // Over them: sparks and rings, which read as light in the air.
    this.above = scene.add.graphics().setDepth(9e4);
    this.texts = [];        // pooled damage numbers, grown to fit
  }

  draw(t) {
    const b = this.below, a = this.above;
    b.clear(); a.clear();
    this.ground(b, t);
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
