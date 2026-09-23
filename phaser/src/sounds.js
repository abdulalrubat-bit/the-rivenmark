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

/* ---- the run ------------------------------------------------------------------
 * The things a delve is FOR -- slag, coffers, the gate -- are the few sounds
 * allowed a little light, because they are rewards. The ends of a delve are
 * the longest sounds in the game: they close something.
 */

// Slag picked up. A small crystal tick that climbs as the quota fills, so the
// pickups themselves say how close you are.
define('slag', { max: 3, gap: 0.03, vol: 0.5, make(ctx, out, t, mag) {
  const f = 294 * (1 + mag);
  tone(ctx, out, t, { wave: 'triangle', f0: f, f1: f * 0.98, a: 0.002, d: 0.09, peak: 0.1 });
  return tone(ctx, out, t, { wave: 'sine', f0: f * 2, f1: f * 1.96, a: 0.002, d: 0.05, peak: 0.03 });
} });

// The quota met. It is what calls the avatar, so it is not a fanfare: a low
// swell and a bell with a minor third in it.
define('quota', { max: 1, gap: 1, vol: 0.7, make(ctx, out, t) {
  tone(ctx, out, t, { f0: 98, f1: 96, a: 0.08, d: 1.1, peak: 0.3 });
  tone(ctx, out, t, { f0: 116.5, f1: 115, a: 0.1, d: 1.0, peak: 0.12 });
  return ring(ctx, out, t, { f: 147, d: 1.4, peak: 0.12, ratios: [1, 2.0, 2.4] });
} });

// A coffer: the lid, then the coin inside it.
define('coffer', { max: 2, gap: 0.1, vol: 0.6, make(ctx, out, t, mag, noise) {
  noiseBurst(ctx, out, t, noise, { type: 'bandpass', q: 3, f0: 420, f1: 240, a: 0.04, d: 0.18, peak: 0.16 });
  tone(ctx, out, t, { f0: 90, f1: 60, a: 0.01, d: 0.15, peak: 0.2 });
  let len = 0;
  [[0.16, 1800], [0.22, 2350], [0.29, 2050]].forEach(([dt, f]) => {
    len = Math.max(len, dt + ring(ctx, out, t + dt, { f, d: 0.12, peak: 0.05, ratios: [1, 2.7] }));
  });
  return len;
} });

// Gear into the bag. A worn piece is a soft knock; a rare one rings, and the
// rarer it is the brighter and longer.
define('gear', { max: 2, gap: 0.08, vol: 0.55, make(ctx, out, t, mag, noise) {
  noiseBurst(ctx, out, t, noise, { f0: 700, f1: 150, a: 0.003, d: 0.05, peak: 0.12 });
  if (mag < 0.15) return tone(ctx, out, t, { f0: 150, f1: 110, a: 0.003, d: 0.1, peak: 0.15 });
  return ring(ctx, out, t, { f: 262 * (1 + mag), d: 0.3 + 0.7 * mag, peak: 0.05 + 0.06 * mag,
                             ratios: [1, 1.5, 2.0, 3.0] });
} });

// A barrel or a husk going off: the biggest noise the floor makes.
define('blast', { max: 2, gap: 0.06, vol: 0.8, make(ctx, out, t, mag, noise) {
  noiseBurst(ctx, out, t, noise, { f0: 2800, f1: 70, a: 0.003, d: 0.4 + 0.25 * mag, peak: 0.42 });
  return tone(ctx, out, t, { f0: 64, f1: 28, a: 0.004, d: 0.5 + 0.2 * mag, peak: 0.4 + 0.15 * mag });
} });

// A pillar coming down: rubble, in several falls.
define('crumble', { max: 1, gap: 0.2, vol: 0.75, make(ctx, out, t, mag, noise) {
  let len = noiseBurst(ctx, out, t, noise, { f0: 1400, f1: 120, a: 0.01, d: 0.55, peak: 0.45 });
  tone(ctx, out, t, { f0: 70, f1: 34, a: 0.005, d: 0.4, peak: 0.45 });
  [0.12, 0.23, 0.31, 0.44].forEach((dt, i) => {
    len = Math.max(len, dt + noiseBurst(ctx, out, t + dt, noise,
      { type: 'bandpass', q: 1.8, f0: 900 - i * 120, f1: 250, a: 0.002, d: 0.06, peak: 0.18 }));
  });
  return len;
} });

// A body's slam landing on the floor. A gorger's, which opens the ground
// (mag 1), is deeper and longer.
define('slam', { max: 2, gap: 0.08, vol: 0.75, make(ctx, out, t, mag, noise) {
  noiseBurst(ctx, out, t, noise, { f0: 900, f1: 60, a: 0.004, d: 0.25 + 0.2 * mag, peak: 0.45 });
  return tone(ctx, out, t, { f0: 75, f1: 30, a: 0.004, d: 0.35 + 0.25 * mag, peak: 0.5 + 0.2 * mag });
} });

// The gate waking. Heard across the delve (far), placed, and long: a deep
// fifth under a slow bell, so it reads as a place that is now open to you.
define('gate', { max: 1, gap: 1, vol: 0.7, far: 0.45, make(ctx, out, t) {
  tone(ctx, out, t, { f0: 55, f1: 55, a: 0.3, d: 1.6, peak: 0.3 });
  tone(ctx, out, t, { f0: 82.5, f1: 82, a: 0.35, d: 1.5, peak: 0.16 });
  return ring(ctx, out, t + 0.1, { f: 110, d: 1.8, peak: 0.1, ratios: [1, 2.0, 3.0, 4.1] });
} });

// Winding it open, in quarters: a low tick that climbs.
define('wind', { max: 1, gap: 0.2, vol: 0.5, make(ctx, out, t, mag) {
  const f = 110 * (1 + mag);
  return tone(ctx, out, t, { wave: 'triangle', f0: f, f1: f * 0.99, a: 0.01, d: 0.25, peak: 0.16 });
} });

// It stands open: a rush of air, and the fifth again, higher.
define('gateopen', { max: 1, gap: 1, vol: 0.75, make(ctx, out, t, mag, noise) {
  noiseBurst(ctx, out, t, noise, { type: 'bandpass', q: 0.9, f0: 250, f1: 2200, a: 0.3, d: 0.5, peak: 0.25 });
  tone(ctx, out, t + 0.25, { f0: 110, f1: 110, a: 0.05, d: 1.1, peak: 0.25 });
  return 0.25 + ring(ctx, out, t + 0.25, { f: 165, d: 1.2, peak: 0.1, ratios: [1, 2.0, 3.0] });
} });

// A surge outlasted, and paid: coin, and a low hit under it.
define('surge', { max: 1, gap: 0.5, vol: 0.6, make(ctx, out, t) {
  tone(ctx, out, t, { f0: 110, f1: 70, a: 0.005, d: 0.3, peak: 0.3 });
  let len = 0;
  [[0, 1700], [0.07, 2250], [0.13, 1950], [0.2, 2500]].forEach(([dt, f]) => {
    len = Math.max(len, dt + ring(ctx, out, t + dt, { f, d: 0.14, peak: 0.05, ratios: [1, 2.7] }));
  });
  return len;
} });

// Your own corpse, reclaimed -- and the champions it raises. A grim bell that
// beats against itself.
define('corpse', { max: 1, gap: 1, vol: 0.7, make(ctx, out, t) {
  tone(ctx, out, t, { f0: 65, f1: 60, a: 0.02, d: 1.2, peak: 0.35 });
  return ring(ctx, out, t, { f: 233, d: 1.3, peak: 0.11, ratios: [1, 1.06, 2.4] });
} });

// Out. The one sound that opens up rather than closing down: a rush, and a
// warm major chord.
define('extract', { max: 1, gap: 1, vol: 0.75, make(ctx, out, t, mag, noise) {
  noiseBurst(ctx, out, t, noise, { type: 'bandpass', q: 0.8, f0: 300, f1: 1800, a: 0.25, d: 0.5, peak: 0.2 });
  let len = 0;
  for (const [f, p] of [[131, 0.2], [196, 0.12], [262, 0.1], [330, 0.07], [392, 0.05]])
    len = Math.max(len, 0.2 + tone(ctx, out, t + 0.2, { f0: f, f1: f, a: 0.1, d: 1.5, peak: p }));
  return len;
} });

// Dead. Everything falls: a drone sinking out, and a breath of air leaving.
// In Hardcore (mag 1) a bell tolls under it, because that one is final.
define('death', { max: 1, gap: 1, vol: 0.85, make(ctx, out, t, mag, noise) {
  noiseBurst(ctx, out, t, noise, { f0: 500, f1: 50, a: 0.02, d: 1.2, peak: 0.3 });
  tone(ctx, out, t, { wave: 'triangle', f0: 220, f1: 70, a: 0.01, d: 1.2, peak: 0.14 });
  let len = tone(ctx, out, t, { f0: 110, f1: 38, a: 0.01, d: 1.7, peak: 0.5 });
  if (mag > 0.75) len = Math.max(len, 0.3 + ring(ctx, out, t + 0.3, { f: 73.4, d: 2.2, peak: 0.2,
                                                                  ratios: [1, 2.0, 2.4, 3.0] }));
  return len;
} });

/* ---- the bosses ---------------------------------------------------------------
 * Each boss event is a warning or a verdict, so each is longer and lower than
 * anything the horde makes, and the ones the player must answer (the ring,
 * the Agony, the Breath) are heard wherever the player is standing.
 */

// An avatar arrives. A swell from underneath and a struck bell with a tritone
// in it. The Crucible (mag 1) is lowest; the uninvited Deceiver is shorter.
define('arrive', { max: 1, gap: 1, vol: 0.8, far: 0.5, make(ctx, out, t, mag, noise) {
  const base = 55 - 12 * mag;
  noiseBurst(ctx, out, t, noise, { f0: 200, f1: 900, a: 0.5, d: 0.6, peak: 0.12 });
  tone(ctx, out, t, { f0: base, f1: base * 0.94, a: 0.4, d: 1.4 * (0.6 + mag * 0.5), peak: 0.45 });
  return 0.3 + ring(ctx, out, t + 0.3, { f: base * 2, d: 1.8, peak: 0.14, ratios: [1, 1.414, 2.0, 2.83] });
} });

// The Deceiver stepping from one place to another: gold air, sucked in.
define('blink', { max: 1, gap: 0.3, vol: 0.55, make(ctx, out, t, mag, noise) {
  noiseBurst(ctx, out, t, noise, { type: 'bandpass', q: 2, f0: 3000, f1: 400, a: 0.02, d: 0.16, peak: 0.2 });
  return tone(ctx, out, t, { wave: 'triangle', f0: 660, f1: 220, a: 0.005, d: 0.18, peak: 0.08 });
} });

// His guard coming up: a closed metal note. Blows are wasted until it drops.
define('guard', { max: 1, gap: 0.5, vol: 0.55, make(ctx, out, t) {
  tone(ctx, out, t, { f0: 98, f1: 96, a: 0.01, d: 0.4, peak: 0.2 });
  return ring(ctx, out, t, { f: 294, d: 0.5, peak: 0.12, ratios: [1, 2.0, 2.76] });
} });

// The mirages: the same note three times, a little apart, a little out of tune.
define('mirage', { max: 1, gap: 0.5, vol: 0.5, make(ctx, out, t) {
  let len = 0;
  [[0, 523], [0.06, 530], [0.12, 516]].forEach(([dt, f]) => {
    len = Math.max(len, dt + tone(ctx, out, t + dt, { wave: 'triangle', f0: f, f1: f * 0.9, a: 0.01, d: 0.35, peak: 0.05 }));
  });
  return len;
} });

// Bodies called up: a low groan out of the ground.
define('summon', { max: 1, gap: 0.5, vol: 0.55, make(ctx, out, t, mag, noise) {
  noiseBurst(ctx, out, t, noise, { f0: 220, f1: 500, a: 0.2, d: 0.35, peak: 0.18 });
  return tone(ctx, out, t, { wave: 'triangle', f0: 70, f1: 90, a: 0.2, d: 0.45, peak: 0.2 });
} });

// The Furnace thrown: a roar that rises into the ring before it lands. The
// only boss sound that climbs, because it is a warning that something is
// coming down, and it is heard wherever you are.
define('furnace', { max: 1, gap: 1, vol: 0.75, far: 0.55, make(ctx, out, t, mag, noise) {
  noiseBurst(ctx, out, t, noise, { f0: 180, f1: 1400, a: 0.45, d: 0.35, peak: 0.35 });
  return tone(ctx, out, t, { f0: 60, f1: 120, a: 0.45, d: 0.4, peak: 0.35 });
} });

// Synchronized Agony, winding: three blades drawn at once.
define('agonywind', { max: 1, gap: 1, vol: 0.6, far: 0.5, make(ctx, out, t, mag, noise) {
  let len = 0;
  [0, 0.05, 0.1].forEach((dt, i) => {
    len = Math.max(len, dt + noiseBurst(ctx, out, t + dt, noise,
      { type: 'bandpass', q: 3, f0: 1800 + i * 300, f1: 4200, a: 0.12, d: 0.12, peak: 0.1 }));
  });
  return Math.max(len, tone(ctx, out, t, { wave: 'triangle', f0: 147, f1: 139, a: 0.2, d: 0.5, peak: 0.1 }));
} });

// And landing: one blow, the three summed. Quieter when it found nobody.
define('agony', { max: 1, gap: 0.5, vol: 0.85, make(ctx, out, t, mag, noise) {
  noiseBurst(ctx, out, t, noise, { f0: 3000, f1: 120, a: 0.002, d: 0.3, peak: 0.3 + 0.25 * mag });
  return tone(ctx, out, t, { f0: 82, f1: 30, a: 0.003, d: 0.55, peak: 0.3 + 0.3 * mag });
} });

// The Breath of the Void: a long inhale the whole room hears. It must be
// answered, so it is the most insistent sound the Deceiver has.
define('breath', { max: 1, gap: 2, vol: 0.75, far: 0.6, make(ctx, out, t, mag, noise) {
  noiseBurst(ctx, out, t, noise, { f0: 150, f1: 1200, a: 1.4, d: 0.4, peak: 0.22 });
  tone(ctx, out, t, { f0: 49, f1: 49, a: 0.6, d: 1.4, peak: 0.3 });
  tone(ctx, out, t, { f0: 233, f1: 247, a: 1.2, d: 0.6, peak: 0.06 });
  return tone(ctx, out, t, { f0: 220, f1: 262, a: 1.2, d: 0.6, peak: 0.06 });
} });

// The Breath snuffed by a Null-Zone: the void closing over the light.
define('nullified', { max: 1, gap: 1, vol: 0.75, make(ctx, out, t, mag, noise) {
  noiseBurst(ctx, out, t, noise, { f0: 2400, f1: 80, a: 0.003, d: 0.5, peak: 0.35 });
  tone(ctx, out, t, { f0: 62, f1: 28, a: 0.005, d: 0.8, peak: 0.5 });
  return ring(ctx, out, t, { f: 196, d: 0.9, peak: 0.08, bend: 0.97, ratios: [1, 1.5] });
} });

// False Dawn: the light coming up, and everything in it.
define('dawn', { max: 1, gap: 2, vol: 0.9, far: 0.9, make(ctx, out, t, mag, noise) {
  noiseBurst(ctx, out, t, noise, { f0: 6000, f1: 200, a: 0.02, d: 1.6, peak: 0.4 });
  tone(ctx, out, t, { f0: 40, f1: 25, a: 0.01, d: 1.8, peak: 0.6 });
  let len = 0;
  for (const f of [262, 330, 392, 523])
    len = Math.max(len, tone(ctx, out, t, { f0: f, f1: f * 1.01, a: 0.05, d: 1.8, peak: 0.05 }));
  return len;
} });

// An avatar falling. The arrival's bell again, cracked, falling away -- the
// same voice, so the fall answers the arrival.
define('fall', { max: 1, gap: 1, vol: 0.85, far: 0.6, make(ctx, out, t, mag, noise) {
  noiseBurst(ctx, out, t, noise, { f0: 2400, f1: 60, a: 0.004, d: 0.9, peak: 0.4 });
  tone(ctx, out, t, { f0: 70, f1: 26, a: 0.005, d: 1.6 * (0.6 + 0.4 * mag), peak: 0.55 });
  return 0.1 + ring(ctx, out, t + 0.1, { f: 98, d: 2.0 * (0.6 + 0.4 * mag), peak: 0.13, bend: 0.93,
                                         ratios: [1, 1.414, 2.0, 2.83] });
} });

/* ---- the menus ------------------------------------------------------------------
 * Short and quiet: the menus are where a player reads, so nothing here should
 * be louder than a page turning. The results of a tap (bought, built, worn)
 * are a little fuller than the tap, so the ear knows the tap did something.
 */

// Any button: a soft wooden click.
define('tap', { max: 2, gap: 0.04, vol: 0.4, make(ctx, out, t, mag, noise) {
  noiseBurst(ctx, out, t, noise, { type: 'bandpass', q: 2.5, f0: 1300, f1: 700, a: 0.001, d: 0.025, peak: 0.12 });
  return tone(ctx, out, t, { wave: 'triangle', f0: 240, f1: 180, a: 0.002, d: 0.04, peak: 0.08 });
} });

// Coin changing hands.
define('buy', { max: 1, gap: 0.1, vol: 0.55, make(ctx, out, t) {
  let len = 0;
  [[0, 1900], [0.05, 2450], [0.1, 2150]].forEach(([dt, f]) => {
    len = Math.max(len, dt + ring(ctx, out, t + dt, { f, d: 0.14, peak: 0.05, ratios: [1, 2.7] }));
  });
  return Math.max(len, tone(ctx, out, t, { f0: 130, f1: 110, a: 0.005, d: 0.18, peak: 0.12 }));
} });

// Stone set on stone: a Hall station raised.
define('build', { max: 1, gap: 0.2, vol: 0.6, make(ctx, out, t, mag, noise) {
  noiseBurst(ctx, out, t, noise, { f0: 1200, f1: 140, a: 0.003, d: 0.2, peak: 0.3 });
  tone(ctx, out, t, { f0: 90, f1: 55, a: 0.004, d: 0.3, peak: 0.35 });
  return 0.12 + ring(ctx, out, t + 0.12, { f: 196, d: 0.6, peak: 0.07, ratios: [1, 2.0, 3.0] });
} });

// A piece put on: metal settling into place.
define('equip', { max: 1, gap: 0.08, vol: 0.55, make(ctx, out, t, mag, noise) {
  noiseBurst(ctx, out, t, noise, { type: 'highpass', f0: 2500, f1: 1200, a: 0.002, d: 0.05, peak: 0.12 });
  tone(ctx, out, t, { f0: 140, f1: 100, a: 0.003, d: 0.1, peak: 0.18 });
  return ring(ctx, out, t + 0.02, { f: 520, d: 0.25, peak: 0.05, ratios: [1, 2.76] });
} });

// And taken off: the same, lower and duller.
define('unequip', { max: 1, gap: 0.08, vol: 0.5, make(ctx, out, t, mag, noise) {
  noiseBurst(ctx, out, t, noise, { f0: 1500, f1: 400, a: 0.002, d: 0.05, peak: 0.1 });
  return tone(ctx, out, t, { f0: 120, f1: 85, a: 0.003, d: 0.12, peak: 0.16 });
} });

// A piece thrown out, for good: a falling scrape.
define('discard', { max: 1, gap: 0.1, vol: 0.5, make(ctx, out, t, mag, noise) {
  noiseBurst(ctx, out, t, noise, { type: 'bandpass', q: 1.5, f0: 1600, f1: 250, a: 0.005, d: 0.22, peak: 0.16 });
  return tone(ctx, out, t, { wave: 'triangle', f0: 180, f1: 70, a: 0.004, d: 0.22, peak: 0.1 });
} });

// Descending: the gate-house door, and a long fall into the dark.
define('descend', { max: 1, gap: 1, vol: 0.7, make(ctx, out, t, mag, noise) {
  noiseBurst(ctx, out, t, noise, { f0: 900, f1: 90, a: 0.02, d: 0.9, peak: 0.25 });
  tone(ctx, out, t, { f0: 110, f1: 41, a: 0.05, d: 1.1, peak: 0.35 });
  return ring(ctx, out, t, { f: 147, d: 1.2, peak: 0.08, bend: 0.9, ratios: [1, 2.0] });
} });

/* ---- the Silent Choir ---------------------------------------------------------
 * The one boss that is heard more than seen: every event in the fight is a
 * voice. Built from a vowel -- two formant bands over a sung pitch with a slow
 * vibrato -- so it reads as singing, not as an instrument.
 */
function sung(ctx, out, t, f, dur, level) {
  const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
  const vib = ctx.createOscillator(), vd = ctx.createGain();
  vib.frequency.value = 5.2; vd.gain.value = f * 0.012;
  vib.connect(vd); vd.connect(o.frequency);
  const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 520; f1.Q.value = 6;
  const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 900; f2.Q.value = 8;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(level, t + Math.min(0.4, dur * 0.3));
  g.gain.setValueAtTime(level, t + dur * 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(f1); o.connect(f2); f1.connect(g); f2.connect(g); g.connect(out);
  o.start(t); vib.start(t); o.stop(t + dur + 0.05); vib.stop(t + dur + 0.05);
  return dur;
}

// A singer drawing breath: the warning. Heard across the room -- this is the
// moment to act.
define('choirwind', { max: 2, gap: 0.3, vol: 0.6, far: 0.55, make(ctx, out, t, mag, noise) {
  noiseBurst(ctx, out, t, noise, { type: 'bandpass', q: 1.2, f0: 600, f1: 2200, a: 0.9, d: 0.5, peak: 0.12 });
  return 0.6 + sung(ctx, out, t + 0.6, 196, 1.3, 0.06);
} });

// A note landing: the sung pitch rising a step with each one, so the chord
// is heard climbing toward the fifth.
define('choirnote', { max: 1, gap: 0.5, vol: 0.8, far: 0.7, make(ctx, out, t, mag) {
  const steps = [0, 3, 5, 7, 10];
  const k = Math.max(0, Math.min(4, Math.round((mag || 0) * 5) - 1));   // which note of five
  const f = 220 * Math.pow(2, steps[k] / 12);
  sung(ctx, out, t, f, 1.6, 0.12);
  return sung(ctx, out, t, f * 1.5, 1.6, 0.05);
} });

// A singer falling: the voice cut off mid-vowel.
define('choirfall', { max: 2, gap: 0.2, vol: 0.6, make(ctx, out, t, mag, noise) {
  sung(ctx, out, t, 262, 0.35, 0.08);
  return noiseBurst(ctx, out, t + 0.25, noise, { f0: 1400, f1: 120, a: 0.004, d: 0.4, peak: 0.25 });
} });

// ...and rising again: the vowel coming back, up from nothing.
define('choirrise', { max: 2, gap: 0.3, vol: 0.55, make(ctx, out, t) {
  return sung(ctx, out, t, 175, 1.0, 0.07);
} });

// Stilled for good: a bell, and no voice after it.
define('stilled', { max: 1, gap: 0.3, vol: 0.7, make(ctx, out, t, mag, noise) {
  noiseBurst(ctx, out, t, noise, { f0: 900, f1: 80, a: 0.004, d: 0.6, peak: 0.3 });
  return ring(ctx, out, t, { f: 147, d: 1.6, peak: 0.14, bend: 0.97, ratios: [1, 2.0, 2.4, 3.0] });
} });

// The whole chord: every voice at once, and then nothing.
define('chord', { max: 1, gap: 2, vol: 0.9, far: 0.9, make(ctx, out, t, mag, noise) {
  noiseBurst(ctx, out, t, noise, { f0: 5000, f1: 200, a: 0.02, d: 1.6, peak: 0.3 });
  tone(ctx, out, t, { f0: 44, f1: 30, a: 0.02, d: 1.8, peak: 0.5 });
  let len = 0;
  for (const f of [220, 262, 330, 392, 440]) len = Math.max(len, sung(ctx, out, t, f, 1.9, 0.045));
  return len;
} });
