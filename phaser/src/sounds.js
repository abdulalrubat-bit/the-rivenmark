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
  return tone(ctx, out, t, { f0: 100, f1: 42, a: 0.005, d: 0.2 + 0.15 * mag, peak: 0.5 + 0.28 * mag });
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

/* ---- the kit ----------------------------------------------------------------
 * Each ability its own sound, so a player learns them by ear -- but all built
 * from the same few blocks as the fight, so they belong to it. Isaac's are
 * gold and metal (rings, a bell); Zayd's are the void (beating tones, glass).
 */

// Aegis: the ring of Sun-Gold going out. A low boom and a bell over it.
define('aegis', { max: 1, gap: 0.2, vol: 0.8, make(ctx, out, t, mag, noise) {
  noiseBurst(ctx, out, t, noise, { f0: 900, f1: 90, a: 0.004, d: 0.4, peak: 0.4 });
  tone(ctx, out, t, { f0: 72, f1: 40, a: 0.005, d: 0.5, peak: 0.6 });
  return ring(ctx, out, t + 0.01, { f: 196, d: 1.0, peak: 0.13, ratios: [1, 2.0, 3.01, 4.2] });
} });

// Guillotine: the blade coming down, then landing. On a Vulnerable body (mag 1)
// it rings on after the blow, because that one ends things.
define('guillotine', { max: 1, gap: 0.2, vol: 0.85, make(ctx, out, t, mag, noise) {
  noiseBurst(ctx, out, t, noise, { type: 'bandpass', q: 1.2, f0: 300, f1: 2000, a: 0.05, d: 0.06, peak: 0.3 });
  const hit = t + 0.08;
  noiseBurst(ctx, out, hit, noise, { f0: 3200, f1: 180, a: 0.002, d: 0.12, peak: 0.45 });
  let len = 0.08 + tone(ctx, out, hit, { f0: 95, f1: 34, a: 0.003, d: 0.4, peak: 0.6 });
  if (mag > 0.75) len = Math.max(len, 0.08 + ring(ctx, out, hit, { f: 150, d: 0.9, peak: 0.16 }));
  return len;
} });

// Purge: the channel beginning -- a slow gathering, the one sound here that
// rises, because it is something building rather than something landing.
define('purge', { max: 1, gap: 0.3, vol: 0.6, make(ctx, out, t, mag, noise) {
  noiseBurst(ctx, out, t, noise, { f0: 200, f1: 900, a: 0.35, d: 0.4, peak: 0.1 });
  return tone(ctx, out, t, { wave: 'triangle', f0: 110, f1: 196, a: 0.35, d: 0.5, peak: 0.16 });
} });

// The channel held to the end: a warm open chord, settling.
define('mend', { max: 1, gap: 0.3, vol: 0.6, make(ctx, out, t) {
  let len = 0;
  for (const [f, p] of [[131, 0.14], [196, 0.09], [262, 0.07], [392, 0.04]])
    len = Math.max(len, tone(ctx, out, t, { f0: f, f1: f * 0.99, a: 0.06, d: 0.8, peak: p }));
  return len;
} });

// The channel broken: the gathering collapsing.
define('lapse', { max: 1, gap: 0.3, vol: 0.55, make(ctx, out, t, mag, noise) {
  noiseBurst(ctx, out, t, noise, { type: 'bandpass', q: 1.5, f0: 1200, f1: 200, d: 0.2, peak: 0.12 });
  return tone(ctx, out, t, { wave: 'triangle', f0: 300, f1: 110, a: 0.005, d: 0.28, peak: 0.14 });
} });

// Null-Zone: the ground giving way to the void. A very low eruption, and two
// tones a hair apart so the pool beats as it opens.
define('nullzone', { max: 1, gap: 0.2, vol: 0.8, make(ctx, out, t, mag, noise) {
  noiseBurst(ctx, out, t, noise, { f0: 700, f1: 60, a: 0.01, d: 0.5, peak: 0.4 });
  tone(ctx, out, t, { f0: 62, f1: 30, a: 0.01, d: 0.6, peak: 0.6 });
  tone(ctx, out, t, { f0: 220, f1: 208, a: 0.05, d: 0.8, peak: 0.06 });
  return tone(ctx, out, t, { f0: 233, f1: 220, a: 0.05, d: 0.8, peak: 0.06 });
} });

// Decrypt: a cast snapped. A crack of glass, off the beat and very short.
define('decrypt', { max: 1, gap: 0.15, vol: 0.7, make(ctx, out, t, mag, noise) {
  noiseBurst(ctx, out, t, noise, { type: 'highpass', f0: 5200, f1: 1800, a: 0.001, d: 0.035, peak: 0.35 });
  tone(ctx, out, t, { f0: 210, f1: 80, a: 0.002, d: 0.12, peak: 0.25 });
  return ring(ctx, out, t, { f: 880, d: 0.3, peak: 0.08, ratios: [1, 2.4, 3.9] });
} });

// The Jars: a clink of glass, then warmth.
define('jars', { max: 1, gap: 0.2, vol: 0.65, make(ctx, out, t) {
  ring(ctx, out, t, { f: 1250, d: 0.16, peak: 0.07, ratios: [1, 2.7] });
  tone(ctx, out, t + 0.07, { f0: 180, f1: 120, a: 0.01, d: 0.1, peak: 0.12 });
  return 0.1 + tone(ctx, out, t + 0.1, { f0: 262, f1: 259, a: 0.08, d: 0.5, peak: 0.1 });
} });

// A press that goes nowhere -- on cooldown, not enough charge. Dull and short,
// so it says "not yet" without sounding like an error.
define('deny', { max: 1, gap: 0.12, vol: 0.5, make(ctx, out, t, mag, noise) {
  noiseBurst(ctx, out, t, noise, { f0: 450, f1: 110, a: 0.002, d: 0.04, peak: 0.15 });
  return tone(ctx, out, t, { wave: 'triangle', f0: 118, f1: 92, a: 0.003, d: 0.07, peak: 0.2 });
} });

// An ability used on nothing: the power going out of it.
define('fizzle', { max: 1, gap: 0.2, vol: 0.5, make(ctx, out, t, mag, noise) {
  noiseBurst(ctx, out, t, noise, { type: 'bandpass', q: 1.4, f0: 1800, f1: 280, d: 0.25, peak: 0.15 });
  return tone(ctx, out, t, { wave: 'triangle', f0: 200, f1: 90, a: 0.005, d: 0.2, peak: 0.1 });
} });

// A charge gained, or another Null-Zone's worth of Tension. A small tick that
// climbs as the meter fills, so it can be counted without looking.
define('charge', { max: 2, gap: 0.06, vol: 0.45, make(ctx, out, t, mag, noise) {
  const f = 294 + 196 * mag;
  noiseBurst(ctx, out, t, noise, { type: 'highpass', f0: 3000, f1: 2000, a: 0.001, d: 0.02, peak: 0.06 });
  return tone(ctx, out, t, { wave: 'triangle', f0: f, f1: f * 0.97, a: 0.003, d: 0.1, peak: 0.12 });
} });

// Full. The meter's last tick is a chord rather than a tick.
define('charged', { max: 1, gap: 0.25, vol: 0.55, make(ctx, out, t) {
  tone(ctx, out, t, { wave: 'triangle', f0: 165, f1: 163, a: 0.005, d: 0.4, peak: 0.14 });
  return ring(ctx, out, t, { f: 330, d: 0.55, peak: 0.1, ratios: [1, 1.5, 2.0] });
} });

// A cooldown come round: a soft chime, low enough to sit under a fight.
define('ready', { max: 1, gap: 0.2, vol: 0.4, make(ctx, out, t) {
  return ring(ctx, out, t, { f: 392, d: 0.4, peak: 0.08, ratios: [1, 2.0, 3.0] });
} });
