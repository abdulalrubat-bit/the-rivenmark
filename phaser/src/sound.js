/* THE SOUND ENGINE.
 *
 * Every sound in the game is synthesised here, with Web Audio, the same way
 * every sprite is drawn in code: no files, nothing to license, nothing to
 * download. The core says WHAT happened -- sfx('kill', x, y) -- and never how
 * it sounds; this file owns the how.
 *
 * The chain is short on purpose:
 *
 *   voice -> panner -> gain --+-> fx ----\
 *   voice -> panner -> gain --/           +-> master -> limiter -> speakers
 *   ambience and music (music.js) -> music --/
 *
 * Two buses, so a player can turn the music down without losing the fight,
 * or the other way round. Both volumes are remembered with the mute.
 *
 * THE LIMITER is a compressor set hard (ratio 12, fast attack). A hundred
 * thralls dying in one frame is a real event in this game, and without it the
 * sum of a hundred kill sounds clips into a crackle on a phone speaker.
 *
 * AND THE LIMITER IS NOT ENOUGH, which is why every sound also has a voice cap
 * and a minimum gap. A limiter keeps the level down but not the mud: forty
 * overlapping thuds are a roar with no thud in it. So each recipe says how
 * many of itself may sound at once (`max`) and how soon after the last one the
 * next may start (`gap`), and the whole engine stops at VOICE_CAP. Over any
 * of those a sound is DROPPED, not queued -- a late kill sound is worse than
 * none, because it no longer lines up with the kill.
 *
 * WHERE. A sound with a place is panned by where it is relative to the hero
 * and quietened with distance, so a fight off-screen is heard as off-screen.
 * One with no place (the UI, the hero's own blows) plays centred.
 *
 * WHEN IT MAY START. Browsers refuse to make a sound before the page has been
 * touched. The context is created on the first tap or key, never before, and
 * a sound asked for before then is simply not played.
 *
 * WHEN IT STOPS. Muting, or the app going to the background, suspends the
 * context rather than only zeroing the gain: a suspended context costs no
 * battery, a silent running one does.
 */

const MUTE_KEY = 'rivenmark.sound.v1';
const VOICE_CAP = 24;       // everything sounding at once, across all recipes
const MASTER = 0.8;
const LIMIT = { threshold: -14, knee: 6, ratio: 12, attack: 0.003, release: 0.25 };
const HEAR_FULL = 260;      // world units: inside this, full volume
const HEAR_EDGE = 1100;     // past this, not played at all
const PAN_SPAN = 520;       // this far to one side is hard left or right

/* ---- recipes ---------------------------------------------------------------
 * A recipe is { max, gap, vol, far, make(ctx, out, t, mag, noise) }. `far`,
 * if set, is the quietest it may get with distance -- and it is never dropped
 * for being too far, because it is something the whole delve should hear. make() builds
 * its nodes, connects them to `out`, starts them at `t`, and returns how long
 * it lasts in seconds, so the engine knows when the voice is free again.
 * `mag` is 0..1 and optional: how big this instance is (a heavy hit, a big
 * kill). Recipes are registered with define(); the game's own are all in
 * src/sounds.js.
 */
const RECIPES = Object.create(null);
export function define(name, recipe) {
  RECIPES[name] = Object.assign({ max: 4, gap: 0.03, vol: 1 }, recipe);
}

/* ---- building blocks -------------------------------------------------------
 * The palette for "dark and weighty": filtered noise for air and impact, sine
 * and triangle bodies that sweep DOWN (a falling pitch reads as mass), and a
 * few inharmonic partials for struck metal. Each returns its own length.
 */

// An envelope on a gain node: silent, up to `peak` in `a`, down over `d`.
function env(g, t, a, d, peak) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  return a + d;
}

// Noise through a filter whose cutoff moves from f0 to f1: a whoosh when it
// rises, a thud's air when it falls.
export function noiseBurst(ctx, out, t, noise, o) {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.playbackRate.value = o.rate || 1;
  const f = ctx.createBiquadFilter();
  f.type = o.type || 'lowpass';
  f.Q.value = o.q || 0.7;
  f.frequency.setValueAtTime(o.f0, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(o.f1, 20), t + (o.a || 0.005) + o.d);
  const g = ctx.createGain();
  const len = env(g, t, o.a || 0.005, o.d, o.peak);
  src.connect(f); f.connect(g); g.connect(out);
  // A random start inside the buffer, so two bursts in a row are not the same
  // bytes -- the ear hears a repeated noise sample as a machine.
  src.start(t, Math.random() * 0.5, len + 0.05);
  return len;
}

// A pitched body falling from f0 to f1.
export function tone(ctx, out, t, o) {
  const osc = ctx.createOscillator();
  osc.type = o.wave || 'sine';
  osc.frequency.setValueAtTime(o.f0, t);
  osc.frequency.exponentialRampToValueAtTime(Math.max(o.f1 || o.f0, 20), t + (o.a || 0.004) + o.d);
  const g = ctx.createGain();
  const len = env(g, t, o.a || 0.004, o.d, o.peak);
  osc.connect(g); g.connect(out);
  osc.start(t); osc.stop(t + len + 0.05);
  return len;
}

// Struck metal: partials at inharmonic ratios, the high ones dying first.
export function ring(ctx, out, t, o) {
  const ratios = o.ratios || [1, 2.76, 5.4, 8.93];
  let len = 0;
  ratios.forEach((r, i) => {
    len = Math.max(len, tone(ctx, out, t, {
      wave: 'sine', f0: o.f * r, f1: o.f * r * (o.bend || 0.995),
      a: 0.002, d: o.d / (1 + i * 0.8), peak: o.peak / (1 + i * 1.4)
    }));
  });
  return len;
}

/* The hard limiter at the end of the chain, made the same way wherever it is
 * needed -- the game, and the suite that renders the chain offline. */
export function limiter(ctx) {
  const lim = ctx.createDynamicsCompressor();
  for (const k in LIMIT) lim[k].value = LIMIT[k];
  return lim;
}

/* ---- the engine ----------------------------------------------------------- */
class Engine {
  constructor() {
    this.ctx = null;
    const pr = readPrefs();
    this.muted = pr.muted;
    this.vol = { fx: pr.fx, music: pr.music };
    this.hidden = typeof document !== 'undefined' && document.hidden;
    this.voices = [];            // { name, end } for everything still sounding
    this.last = Object.create(null);
    this.played = 0; this.dropped = 0;
    this.log = [];               // the last few plays, for the smoke suite
    this.watchers = [];          // told when mute changes, so every switch agrees
  }

  // A watcher that returns false is finished with (its button is gone) and
  // is dropped, so a screen rebuilt every time it opens does not pile them up.
  onMute(f) {
    this.watchers = this.watchers.filter(w => w(this.muted) !== false);
    if (f(this.muted) !== false) this.watchers.push(f);
  }

  /* Called from the first gesture. Safe to call again: it only resumes. */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = this.ctx = new AC({ latencyHint: 'interactive' });
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : MASTER;
      const lim = limiter(ctx);
      this.master.connect(lim); lim.connect(ctx.destination);
      this.fx = ctx.createGain(); this.fx.gain.value = this.vol.fx;
      this.music = ctx.createGain(); this.music.gain.value = this.vol.music;
      this.fx.connect(this.master); this.music.connect(this.master);
      // One second of white noise, made once and shared by every burst.
      const n = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = n.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noise = n;
    }
    this.sync();
  }

  // Running exactly when it should be: unlocked, unmuted and in front.
  // Returns a promise that settles once the context has got there.
  sync() {
    if (!this.ctx) return Promise.resolve();
    const want = !this.muted && !this.hidden;
    if (want && this.ctx.state === 'suspended') return this.ctx.resume().catch(() => {});
    if (!want && this.ctx.state === 'running') return this.ctx.suspend().catch(() => {});
    return Promise.resolve();
  }

  setMuted(on) {
    this.muted = !!on;
    this.save();
    if (this.master) {
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(this.muted ? 0 : MASTER, t, 0.02);
    }
    this.watchers = this.watchers.filter(f => f(this.muted) !== false);
    return this.sync();
  }
  /* The switch a player presses. Turning sound ON answers with a knock once
   * the context is actually running, so the player hears that it worked. The
   * press itself is a gesture, so this is also where a context that has never
   * been unlocked gets unlocked. */
  save() {
    try { localStorage.setItem(MUTE_KEY, JSON.stringify({ muted: this.muted, fx: this.vol.fx,
                                                          music: this.vol.music })); } catch (e) {}
  }

  /* 'fx' or 'music', 0..1. */
  setVolume(bus, v) {
    if (!(bus in this.vol)) return;
    this.vol[bus] = Math.max(0, Math.min(1, +v || 0));
    this.save();
    const node = this[bus];
    if (node && this.ctx) node.gain.setTargetAtTime(this.vol[bus], this.ctx.currentTime, 0.03);
  }

  toggle() {
    this.unlock();
    const on = this.muted;
    return this.setMuted(!on).then(() => { if (on) this.play('ui'); });
  }

  setHidden(on) { this.hidden = !!on; this.sync(); }

  /* Where the listener stands: the hero, while there is one. */
  listener() {
    try { if (typeof player !== 'undefined' && player) return player; } catch (e) {}
    return null;
  }

  /* Why a sound would not be played, or null if it would. Split out so the
   * smoke suite can ask about the caps without needing an audio device. */
  refuse(name, now) {
    const r = RECIPES[name];
    if (!r) return 'unknown';
    this.voices = this.voices.filter(v => v.end > now);
    if (this.voices.length >= VOICE_CAP) return 'cap';
    if (now - (this.last[name] ?? -1e9) < r.gap) return 'gap';
    let mine = 0;
    for (const v of this.voices) if (v.name === name) mine++;
    if (mine >= r.max) return 'max';
    return null;
  }

  play(name, x, y, mag) {
    const ctx = this.ctx;
    if (!ctx || this.muted || this.hidden || ctx.state !== 'running') return false;
    const now = ctx.currentTime;
    const why = this.refuse(name, now);
    if (why) { this.dropped++; return false; }

    // Where it is. A sound too far away to matter is not built at all.
    let vol = 1, pan = 0;
    const L = x !== undefined ? this.listener() : null;
    if (L) {
      const dx = x - L.x, dy = y - L.y, dist = Math.hypot(dx, dy);
      vol = dist <= HEAR_FULL ? 1 : dist >= HEAR_EDGE ? 0
          : 1 - (dist - HEAR_FULL) / (HEAR_EDGE - HEAR_FULL);
      vol *= vol;                           // falls away faster at the edge
      pan = Math.max(-1, Math.min(1, dx / PAN_SPAN));
    }

    const r = RECIPES[name];
    if (vol === 0 && !r.far) { this.dropped++; return false; }
    if (r.far) vol = Math.max(vol, r.far);
    const g = ctx.createGain();
    g.gain.value = vol * r.vol;
    let out = g;
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner(); p.pan.value = pan;
      p.connect(g); out = p;
    }
    g.connect(this.fx);
    const t = now + 0.005;
    // The core calls this from inside the fight -- damageEnemy, hurtPlayerBy --
    // so a recipe that throws must cost a sound, never the frame.
    let len;
    try { len = r.make(ctx, out, t, mag === undefined ? 0.5 : mag, this.noise) || 0.2; }
    catch (e) {
      try { g.disconnect(); } catch (e2) {}
      this.failed = (this.failed || 0) + 1;
      console.warn('sound: ' + name + ' failed: ' + e.message);
      return false;
    }
    // Disconnect the voice's tail once it is done, so a long session does not
    // leave thousands of dead gain nodes hanging off the master.
    setTimeout(() => { try { g.disconnect(); } catch (e) {} }, (len + 0.3) * 1000);

    this.voices.push({ name, end: t + len });
    this.last[name] = now;
    this.played++;
    // `n` numbers every play, so a reader can ask for what came after a point
    // even once the oldest entries have been let go.
    this.log.push({ n: this.played, name, vol: +vol.toFixed(3), pan: +pan.toFixed(3), at: +now.toFixed(3),
                    mag: mag === undefined ? null : +(+mag).toFixed(3) });
    if (this.log.length > 64) this.log.shift();
    return true;
  }

  stats() {
    const now = this.ctx ? this.ctx.currentTime : 0;
    return {
      state: this.ctx ? this.ctx.state : 'locked', muted: this.muted,
      voices: this.voices.filter(v => v.end > now).length,
      played: this.played, dropped: this.dropped, cap: VOICE_CAP,
      recipes: Object.keys(RECIPES)
    };
  }
}
function readPrefs() {
  let o = {};
  try { o = JSON.parse(localStorage.getItem(MUTE_KEY)) || {}; } catch (e) {}
  const v = x => (typeof x === 'number' && x >= 0 && x <= 1 ? x : 1);
  return { muted: !!o.muted, fx: v(o.fx), music: v(o.music) };
}

export const sound = new Engine();
// Recipes can be added from outside too -- the smoke suite defines its own to
// measure the caps with something whose limits it chose.
sound.define = define;
sound.recipes = RECIPES;
sound.limiter = limiter;
sound.MASTER = MASTER;

/* ---- the one sound the engine needs itself ---------------------------------
 * Turning sound ON has to make a sound, or the player cannot tell it worked. A
 * soft low knock rather than a beep.
 */
define('ui', { max: 2, gap: 0.05, vol: 0.7, make(ctx, out, t, mag, noise) {
  tone(ctx, out, t, { wave: 'triangle', f0: 220, f1: 150, d: 0.09, peak: 0.35 });
  return noiseBurst(ctx, out, t, noise, { f0: 1800, f1: 400, d: 0.05, peak: 0.12 });
} });

/* ---- installing it --------------------------------------------------------- */
let installed = false;
export function installSound() {
  if (installed) return sound;
  installed = true;
  // The core's hook. It was a no-op (public/host-stubs.js) until now, and it
  // still is on the test page, so the rules suites stay silent.
  window.sfx = (name, x, y, mag) => sound.play(name, x, y, mag);
  window.__sound = sound;
  const first = () => sound.unlock();
  for (const ev of ['pointerdown', 'touchend', 'keydown'])
    window.addEventListener(ev, first, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => sound.setHidden(document.hidden));
  return sound;
}
