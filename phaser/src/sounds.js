/* WHAT EVERYTHING SOUNDS LIKE.
 *
 * The recipes, kept apart from the engine (sound.js) so tuning how a kill
 * sounds never means reading how voices are counted. Each one is a few
 * building blocks -- filtered noise, a falling tone, struck metal -- and says
 * how many of itself may play at once.
 *
 * The brief is DARK AND WEIGHTY: low, soft-edged, nothing bright for long.
 * Pitch falls rather than rises, because a falling pitch reads as mass. High
 * frequencies are used only for the first few milliseconds of an impact,
 * where they make it land, and are filtered away before they can ring.
 *
 * Sizes: `mag` is 0..1, how big this instance is. The core passes the share of
 * a body a blow took, or how much of the hero's life went, so the same recipe
 * covers a scratch and a killing blow.
 */
import { define, noiseBurst, tone, ring } from './sound.js';

/* ---- combat ---------------------------------------------------------------- */

// The blade coming round: air, not metal. A band of noise sweeping up through
// the mids. A heavy swing is lower and longer, with a low body under it.
define('swing', { max: 3, gap: 0.05, vol: 0.55, make(ctx, out, t, mag, noise) {
  const heavy = mag > 0.75;
  let len = noiseBurst(ctx, out, t, noise, heavy
    ? { type: 'bandpass', q: 1.1, f0: 320, f1: 1500, a: 0.04, d: 0.2, peak: 0.45 }
    : { type: 'bandpass', q: 1.3, f0: 650, f1: 2400, a: 0.025, d: 0.11, peak: 0.35 });
  if (heavy) len = Math.max(len, tone(ctx, out, t, { f0: 95, f1: 55, a: 0.03, d: 0.2, peak: 0.25 }));
  return len;
} });

// The crescent leaving the edge: the magic, under the whoosh. Two soft tones a
// fifth apart, falling, with a breath of high air. More crescents at once is a
// thicker sound, not a louder one.
define('crescent', { max: 3, gap: 0.05, vol: 0.4, make(ctx, out, t, mag, noise) {
  const p = 0.06 + 0.05 * mag;
  let len = tone(ctx, out, t, { wave: 'triangle', f0: 520, f1: 330, a: 0.01, d: 0.16, peak: p });
  len = Math.max(len, tone(ctx, out, t, { wave: 'triangle', f0: 780, f1: 495, a: 0.01, d: 0.12, peak: p * 0.6 }));
  if (mag > 0.5) len = Math.max(len,
    tone(ctx, out, t + 0.02, { wave: 'sine', f0: 392, f1: 262, a: 0.01, d: 0.18, peak: p * 0.8 }));
  noiseBurst(ctx, out, t, noise, { type: 'highpass', f0: 4200, f1: 2600, d: 0.07, peak: 0.05 });
  return len;
} });

// A blow landing on a body. A click of bright noise that is filtered down
// almost at once, and a low thump whose size is the share of the body it took.
define('hit', { max: 5, gap: 0.025, vol: 0.7, make(ctx, out, t, mag, noise) {
  noiseBurst(ctx, out, t, noise, { f0: 2600, f1: 280, a: 0.002, d: 0.07, peak: 0.45 });
  return tone(ctx, out, t, { f0: 150 - 50 * mag, f1: 55, a: 0.003, d: 0.07 + 0.08 * mag,
                             peak: 0.3 + 0.4 * mag });
} });

// A body breaking. Lower and longer than a hit, with a short crackle on top --
// the thralls are crystal-shot, and they should sound like it. Bigger bodies
// (mag) break deeper.
define('kill', { max: 4, gap: 0.04, vol: 0.75, make(ctx, out, t, mag, noise) {
  noiseBurst(ctx, out, t, noise, { f0: 1600, f1: 110, a: 0.004, d: 0.18 + 0.12 * mag, peak: 0.45 });
  noiseBurst(ctx, out, t + 0.015, noise, { type: 'bandpass', q: 2, f0: 3200, f1: 1800,
                                           d: 0.05, peak: 0.12, rate: 1.7 });
  return tone(ctx, out, t, { f0: 120 - 40 * mag, f1: 38, a: 0.004, d: 0.22 + 0.15 * mag,
                             peak: 0.4 + 0.3 * mag });
} });

// The hero taking a blow: the one sound that must never be missed, so it is the
// lowest and heaviest here -- felt as much as heard -- with a dull slap on top.
define('hurt', { max: 2, gap: 0.08, vol: 0.9, make(ctx, out, t, mag, noise) {
  noiseBurst(ctx, out, t, noise, { f0: 1100, f1: 140, a: 0.003, d: 0.14, peak: 0.5 });
  tone(ctx, out, t, { wave: 'triangle', f0: 190, f1: 95, a: 0.004, d: 0.09, peak: 0.15 });
  return tone(ctx, out, t, { f0: 100, f1: 42, a: 0.005, d: 0.2 + 0.15 * mag, peak: 0.55 + 0.35 * mag });
} });

// A blow into a braced guard: metal on metal, and most of it turned away.
define('block', { max: 2, gap: 0.08, vol: 0.5, make(ctx, out, t, mag, noise) {
  noiseBurst(ctx, out, t, noise, { type: 'highpass', f0: 3000, f1: 1200, a: 0.002, d: 0.05, peak: 0.25 });
  return ring(ctx, out, t, { f: 410, d: 0.4, peak: 0.16 });
} });

// A blow on the Deceiver while his escort holds: glass, and nothing gets in.
define('tether', { max: 1, gap: 0.15, vol: 0.45, make(ctx, out, t) {
  return ring(ctx, out, t, { f: 620, d: 0.5, peak: 0.1, bend: 1.004, ratios: [1, 2.32, 4.25] });
} });
