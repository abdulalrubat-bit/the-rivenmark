/* AMBIENCE AND MUSIC.
 *
 * Two layers under the effects, both on the engine's music bus:
 *
 *   THE BED. A continuous sound per place -- one for each of the five regions
 *   and one for the gate-house hearth. Looping noise through a filter that
 *   drifts on a slow LFO (wind, surf, a forge breathing), a low drone, and now
 *   and then a distant event: a creak, a drip, a far bell. It is what makes a
 *   delve sound like somewhere before anything in it has moved.
 *
 *   THE SCORE. Generative and sparse, written in one mode (D aeolian) so that
 *   nothing it plays can clash with anything else it plays. It follows the
 *   game rather than a timeline:
 *
 *     hearth   the gate-house: slow pad chords, a bell now and then
 *     delve    a lone bell every few seconds, and a pad barely there
 *     boss     a war-drum pulse, a tense pad, a bell on the bar
 *     hold     the gate held open: the pulse faster, a hat on the off-beat
 *     over     the delve's end: everything lets go
 *
 * Scheduled ahead on the audio clock (the usual Web Audio pattern: a timer
 * wakes every 200ms and books whatever falls in the next 600), so a busy frame
 * cannot put a drum beat late. While the context is suspended -- muted, or
 * the app in the background -- the timer finds nothing to do.
 */
import { tone, ring, noiseBurst } from './sound.js';

const LOOKAHEAD = 0.6;
const BED_FADE = 2.5;

// D aeolian. Degrees count up the scale; 7 is the octave.
const ROOT = 73.42;                      // D2
const SCALE = [0, 2, 3, 5, 7, 8, 10];
const hz = deg => {
  const o = Math.floor(deg / 7), s = SCALE[((deg % 7) + 7) % 7];
  return ROOT * Math.pow(2, (s + 12 * o) / 12);
};
const triad = deg => [hz(deg), hz(deg + 2), hz(deg + 4)];
const pick = a => a[(Math.random() * a.length) | 0];

/* ---- the beds --------------------------------------------------------------
 * noise: the air of the place. type/f/q is the filter; lfo is how fast and how
 * far its cutoff drifts; surf, if set, swells the level too (waves).
 * drone: two tones, a hair apart, so the drone beats slowly.
 * event: something distant, now and then (every `every` seconds, roughly).
 */
const BEDS = {
  // Dead ash around a weeping keep: dry wind, and embers ticking.
  slag: { noise: { type: 'lowpass', f: 420, q: 0.7, lfo: [0.05, 180], level: 0.16 },
          drone: [55, 55.4, 0.06], every: 6,
          event: (c, o, t, n) => noiseBurst(c, o, t, n, { type: 'bandpass', q: 3, f0: 2600, f1: 1800,
                                                          a: 0.001, d: 0.02, peak: 0.05 }) },
  // Split gorges and blue stone: wind whistling through a narrow place.
  vaelk: { noise: { type: 'bandpass', f: 1100, q: 3.5, lfo: [0.08, 500], level: 0.12 },
           drone: [73.42, 110.3, 0.04], every: 9,
           event: (c, o, t) => ring(c, o, t, { f: pick([1175, 1397, 1568]), d: 1.4, peak: 0.02,
                                               ratios: [1, 2.4] }) },
  // Volcanic, iron-toothed: a rumble underfoot, and the mountain settling.
  kraggen: { noise: { type: 'lowpass', f: 190, q: 1.2, lfo: [0.04, 90], level: 0.28 },
             drone: [41.2, 58.3, 0.07], every: 11,
             event: (c, o, t, n) => { noiseBurst(c, o, t, n, { f0: 500, f1: 60, a: 0.02, d: 0.8, peak: 0.08 });
                                      return tone(c, o, t, { f0: 50, f1: 32, a: 0.02, d: 0.9, peak: 0.1 }); } },
  // Rot in a southern forest: damp leaves moving, wood creaking, water.
  weald: { noise: { type: 'bandpass', f: 2100, q: 0.8, lfo: [0.11, 700], level: 0.07 },
           drone: [65.4, 65.9, 0.05], every: 5,
           event: (c, o, t, n) => Math.random() < 0.5
             ? noiseBurst(c, o, t, n, { type: 'bandpass', q: 9, f0: 260, f1: 380, a: 0.1, d: 0.35, peak: 0.05 })
             : tone(c, o, t, { f0: pick([1300, 1600, 1900]), f1: 700, a: 0.002, d: 0.08, peak: 0.02 }) },
  // A drained ocean, refilled with ash: slow waves, and a bell far out.
  firth: { noise: { type: 'lowpass', f: 650, q: 0.6, lfo: [0.06, 250], surf: [0.11, 0.07], level: 0.13 },
           drone: [58.3, 58.6, 0.05], every: 13,
           event: (c, o, t) => ring(c, o, t, { f: 196, d: 2.4, peak: 0.025, ratios: [1, 2.0, 2.76] }) },
  // The gate-house: a hearth. A low fire breathing, and it cracking.
  hearth: { noise: { type: 'lowpass', f: 700, q: 0.8, lfo: [0.2, 200], level: 0.07 },
            drone: null, every: 1.4,
            event: (c, o, t, n) => noiseBurst(c, o, t, n, { type: 'bandpass', q: 2, f0: 3000 + Math.random() * 2000,
                                                            f1: 1500, a: 0.001, d: 0.015, peak: 0.04 }) }
};

/* ---- the instruments -------------------------------------------------------- */

// A pad: each note two triangles a few cents apart, softened, swelling in and
// letting go slowly. `dur` is how long it holds before it starts to go.
function pad(c, out, t, freqs, dur, level) {
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; f.Q.value = 0.5;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(level, t + 1.6);
  g.gain.setValueAtTime(level, t + dur);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 2.2);
  f.connect(g); g.connect(out);
  for (const fr of freqs) for (const det of [-4, 4]) {
    const o = c.createOscillator(); o.type = 'triangle';
    o.frequency.value = fr; o.detune.value = det;
    o.connect(f); o.start(t); o.stop(t + dur + 2.4);
  }
  setTimeout(() => { try { g.disconnect(); } catch (e) {} }, (t - c.currentTime + dur + 3) * 1000);
}
const bell = (c, out, t, f, level) => ring(c, out, t, { f, d: 3, peak: level, ratios: [1, 2.0, 3.01, 4.2] });
const drum = (c, out, t, n, level) => {
  noiseBurst(c, out, t, n, { f0: 400, f1: 80, a: 0.002, d: 0.08, peak: level * 0.4 });
  return tone(c, out, t, { f0: 72, f1: 40, a: 0.003, d: 0.34, peak: level });
};
const hat = (c, out, t, n, level) =>
  noiseBurst(c, out, t, n, { type: 'highpass', f0: 7000, f1: 5000, a: 0.001, d: 0.03, peak: level });

/* ---- the score --------------------------------------------------------------- */
export class Score {
  constructor(engine) {
    this.e = engine;
    this.mode = null; this.place = null;
    this.bed = null;
    this.next = 0;          // audio-clock time of the next musical step
    this.step = 0;          // steps since this mode began
    this.eventAt = 0;       // audio-clock time of the bed's next distant event
    this.notes = 0;         // things the score has played, for the smoke suite
    this.timer = setInterval(() => this.tick(), 200);
  }

  ctx() { const c = this.e.ctx; return c && c.state === 'running' ? c : null; }

  /* What the game is doing now. Cheap when nothing changed, so the scene can
   * call it every frame. `place` is a region id, or 'hearth', or null. */
  set(mode, place) {
    if (mode === this.mode && place === this.place) return;
    const placeChanged = place !== this.place;
    this.mode = mode; this.place = place;
    this.step = 0; this.next = 0;
    if (placeChanged) this.dropBed();
  }

  dropBed() {
    const b = this.bed; this.bed = null;
    if (!b) return;
    const c = this.e.ctx;
    if (!c) return;
    b.out.gain.cancelScheduledValues(c.currentTime);
    b.out.gain.setTargetAtTime(0.0001, c.currentTime, BED_FADE / 4);
    setTimeout(() => { for (const s of b.stops) try { s.stop(); } catch (e) {}
                       try { b.out.disconnect(); } catch (e) {} }, BED_FADE * 1000 + 200);
  }

  buildBed(c, spec) {
    const out = c.createGain();
    out.gain.setValueAtTime(0.0001, c.currentTime);
    out.gain.exponentialRampToValueAtTime(1, c.currentTime + BED_FADE);
    out.connect(this.e.music);
    const stops = [];
    // The air: four seconds of noise, looped.
    if (!this.loopNoise) {
      const len = c.sampleRate * 4, b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.loopNoise = b;
    }
    const N = spec.noise, src = c.createBufferSource();
    src.buffer = this.loopNoise; src.loop = true;
    const f = c.createBiquadFilter(); f.type = N.type; f.frequency.value = N.f; f.Q.value = N.q;
    const amp = c.createGain(); amp.gain.value = N.level;
    src.connect(f); f.connect(amp); amp.connect(out);
    src.start(); stops.push(src);
    const lfo = c.createOscillator(), depth = c.createGain();
    lfo.frequency.value = N.lfo[0]; depth.gain.value = N.lfo[1];
    lfo.connect(depth); depth.connect(f.frequency); lfo.start(); stops.push(lfo);
    if (N.surf) {
      const w = c.createOscillator(), wd = c.createGain();
      w.frequency.value = N.surf[0]; wd.gain.value = N.surf[1];
      w.connect(wd); wd.connect(amp.gain); w.start(); stops.push(w);
    }
    if (spec.drone) {
      const [a, b, lv] = spec.drone, dg = c.createGain();
      dg.gain.value = lv; dg.connect(out);
      for (const fr of [a, b]) {
        const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = fr;
        o.connect(dg); o.start(); stops.push(o);
      }
    }
    return { out, stops, spec };
  }

  tick() {
    const c = this.ctx();
    if (!c || !this.mode) return;
    const now = c.currentTime;

    // The bed, for places that have one.
    const spec = this.place && BEDS[this.place];
    if (spec && !this.bed) { this.bed = this.buildBed(c, spec); this.eventAt = now + 1.5; }
    if (!spec && this.bed) this.dropBed();
    if (this.bed && now + LOOKAHEAD >= this.eventAt) {
      this.bed.spec.event(c, this.bed.out, Math.max(now, this.eventAt), this.e.noise);
      this.eventAt += this.bed.spec.every * (0.5 + Math.random());
    }

    // The score.
    if (this.next < now) this.next = now + 0.1;
    while (this.next < now + LOOKAHEAD) {
      const len = this.play(c, this.next);
      if (!len) { this.next = now + 1; break; }     // a mode with nothing to play
      this.next += len; this.step++;
    }
  }

  /* One step of the current mode, at time t. Returns the step's length. */
  play(c, t) {
    const out = this.e.music, n = this.e.noise, s = this.step;
    switch (this.mode) {
      case 'hearth': {
        // A slow i - VI - III - VII, a chord every two steps, a bell between.
        const prog = [0, 5, 2, 6];
        if (s % 2 === 0) { pad(c, out, t, triad(prog[(s / 2) % 4]), 5, 0.035); this.notes++; }
        else if (Math.random() < 0.6) { bell(c, out, t + 0.5, hz(pick([7, 9, 11, 14])), 0.02); this.notes++; }
        return 4;
      }
      case 'delve': {
        // Mostly silence. A lone bell, low, and a pad now and then under it.
        if (Math.random() < 0.45) { bell(c, out, t, hz(pick([0, 2, 4, 5, 7])), 0.025); this.notes++; }
        if (s % 4 === 0) { pad(c, out, t, [hz(0), hz(4)], 6, 0.018); this.notes++; }
        return 6 + Math.random() * 4;
      }
      case 'boss': {
        // 76 to the minute. A drum on every beat, heavier on the one; the pad
        // leans on the flat second, which is what makes it uneasy.
        const beat = 60 / 76;
        drum(c, out, t, n, s % 4 === 0 ? 0.22 : 0.12); this.notes++;
        if (s % 8 === 0) pad(c, out, t, [hz(0), hz(1), hz(4)], beat * 6, 0.03);
        if (s % 8 === 4) bell(c, out, t, hz(pick([7, 8, 11])), 0.022);
        return beat;
      }
      case 'hold': {
        // The gate held: faster, with a hat between the beats, climbing.
        const beat = 60 / 96;
        drum(c, out, t, n, s % 4 === 0 ? 0.22 : 0.13); this.notes++;
        hat(c, out, t + beat / 2, n, 0.03);
        if (s % 8 === 0) pad(c, out, t, triad(pick([2, 4, 6])), beat * 6, 0.03);
        return beat;
      }
      default:
        return 0;           // 'over' and anything else: silence
    }
  }

  stats() {
    return { mode: this.mode, place: this.place, bed: !!this.bed, notes: this.notes };
  }
}
