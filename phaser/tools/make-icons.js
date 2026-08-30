#!/usr/bin/env node
/* The app icons, drawn in arithmetic.
 *
 * Pure pngjs and maths rather than a canvas, for the same reason everything
 * else in this folder is: it has to run under Termux on the phone, where there
 * is no browser to render into and nothing that compiles. Playwright would
 * have been easier and would have made the icons a desktop-only artefact.
 *
 * The mark is the crescent -- the whole of the hero's attack, and the one
 * shape a player of this game would recognise at 48 pixels. Cut as the
 * difference of two circles, over the delve's own stone, with the Sun-Gold
 * the blade actually throws.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, '..', 'public');

const GOLD = [255, 194, 77];      // PAL.gold — what the crescent is
const PALE = [255, 242, 200];     // its lit inner edge
const STONE = [36, 29, 22];       // PAL.stoneTop
const DARK = [12, 9, 7];

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * Math.max(0, Math.min(1, t))));

/* `pad` leaves room for the maskable safe zone: Android may crop an icon to a
 * circle and anything in the outer tenth can be cut. The mark sits inside 80%
 * of the frame so it survives every mask shape.
 *
 * The mark itself is the crescent AS THE GAME DRAWS IT: a thin band along the
 * arc the blade scribes, tapering to points at both horns. The first version
 * cut it as the difference of two circles, which is a lune -- a fat moon, and
 * the comment above it said in as many words that a flat disc reads as a moon
 * rather than a sweep. It did.
 */
function draw(size, maskable) {
  const png = new PNG({ width: size, height: size });
  const c = size / 2;
  const pad = maskable ? 0.30 : 0.16;
  const R = c * (1 - pad);
  const rim = c * (1 - pad * 0.34);

  // The arc: a band of radius `bow`, half-span `span`, thickest at its middle
  // and coming to a point at each horn. Swept from lower-left to upper-right,
  // which is the direction the hero's blade actually travels.
  const bow = R * 0.74;
  const span = 1.28;                       // radians either side of centre
  const band = R * 0.30;                   // its thickness at the belly
  const aim = -Math.PI * 0.18;             // where the belly points
  // Pushed back along the aim so the whole sweep sits centred in the frame.
  const ax = c - Math.cos(aim) * bow * 0.42;
  const ay = c - Math.sin(aim) * bow * 0.42;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (size * y + x) << 2;
      const px = x + 0.5, py = y + 0.5;
      const d = Math.hypot(px - c, py - c);

      // Ground: stone, falling off towards the edges so it reads as lit from
      // the north like everything else in the game.
      let col = mix(STONE, DARK, Math.max(0, (d / c) * 0.9 - 0.15 + (py - c) / size * 0.5));
      let a = 255;
      if (!maskable && d > rim) {
        // A round badge on a transparent field for the plain icon; the
        // maskable one fills the square and lets the launcher cut it.
        a = Math.max(0, Math.round(255 * (1 - (d - rim) / Math.max(1, c - rim) * 3)));
      }

      const dr = Math.hypot(px - ax, py - ay);
      let off = Math.atan2(py - ay, px - ax) - aim;
      while (off > Math.PI) off -= Math.PI * 2;
      while (off < -Math.PI) off += Math.PI * 2;
      const t = Math.abs(off) / span;
      if (t < 1) {
        // The taper. Squared falloff, so it holds its weight through the belly
        // and then goes quickly to a point rather than thinning all the way.
        const half = (band / 2) * Math.pow(1 - t * t, 0.62);
        const edge = half - Math.abs(dr - bow);
        if (edge > -1.2) {
          const cov = Math.max(0, Math.min(1, edge + 0.6));
          // Brightest along the leading (outer) edge, as the game draws it:
          // a uniform band reads as a ring rather than as an edge.
          const lead = Math.max(0, Math.min(1, (dr - (bow - half)) / Math.max(1, half * 2)));
          col = mix(col, mix(GOLD, PALE, lead * 0.85), cov);
        }
      }
      png.data[i] = col[0]; png.data[i + 1] = col[1]; png.data[i + 2] = col[2];
      png.data[i + 3] = a;
    }
  }
  return png;
}

const wrote = [];
for (const [name, size, maskable] of [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-mask-512.png', 512, true]
]) {
  const file = path.join(OUT, name);
  fs.writeFileSync(file, PNG.sync.write(draw(size, maskable)));
  wrote.push(name + ' ' + (fs.statSync(file).size / 1024).toFixed(1) + 'kB');
}
console.log('icons: ' + wrote.join(', '));
