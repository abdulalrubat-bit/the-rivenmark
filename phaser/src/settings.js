/* THE PLAYER'S SETTINGS.
 *
 * One small record, kept in localStorage, read once at boot and applied where
 * each one lives: the core for the controls and the shake (both are rules the
 * suites can see), the sound engine for the volumes, and the renderer for the
 * flashes and the effects. The screen that edits them is in screens.js.
 *
 * Sound and the controls scheme keep the keys they already had, so nobody's
 * choice from before this screen existed is lost; everything new lives here.
 */
const KEY = 'rivenmark.settings.v1';

export const SHAKES = [['full', 1], ['reduced', 0.45], ['off', 0]];
export const QUALITIES = ['auto', 'full', 'reduced'];
const DEFAULTS = { vibrate: true, shake: 'full', flash: true, fx: 'auto', tutorialSeen: false };

function load() {
  let o = {};
  try { o = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) {}
  const s = Object.assign({}, DEFAULTS);
  if (typeof o.vibrate === 'boolean') s.vibrate = o.vibrate;
  if (SHAKES.some(x => x[0] === o.shake)) s.shake = o.shake;
  if (typeof o.flash === 'boolean') s.flash = o.flash;
  if (QUALITIES.includes(o.fx)) s.fx = o.fx;
  if (typeof o.tutorialSeen === 'boolean') s.tutorialSeen = o.tutorialSeen;
  return s;
}

export const settings = load();
// The renderer's atmosphere reads it without importing it.
if (typeof window !== 'undefined') window.__settings = settings;

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch (e) {}
}

// What each setting does, the moment it changes (and once at boot).
function apply(k) {
  if (k === 'shake' || k === undefined) {
    const m = (SHAKES.find(x => x[0] === settings.shake) || SHAKES[0])[1];
    if (typeof setMotion === 'function') setMotion(m);
  }
}

export function setSetting(k, v) {
  if (!(k in DEFAULTS)) return;
  settings[k] = v;
  save();
  apply(k);
}

export function applyAll() { apply(); }

/* Controls live under their own key, which predates this screen. */
export function setControlsSaved(scheme) {
  setControls(scheme);
  try { localStorage.setItem('rivenmark.controls.v1', controlScheme); } catch (e) {}
}

/* VIBRATION, on the moments that matter and on nothing else: taking a blow
 * (harder for a bigger one), a big body breaking, the gate waking and
 * opening, an avatar falling, and dying. Driven off the same events as the
 * sound, but its own switch -- a player who plays muted on a bus is exactly
 * the one who wants to feel the hit. Rate-limited, so a fight is a pulse and
 * not a buzz. */
const PULSES = {
  hurt: mag => 20 + Math.round(40 * (mag || 0)),
  kill: mag => ((mag || 0) > 0.5 ? 14 : 0),
  gate: () => [30, 60, 30],
  gateopen: () => 60,
  fall: () => [60, 40, 90],
  death: () => [80, 60, 160],
  extract: () => 40,
  choirnote: () => [20, 30, 20],
  chord: () => [120, 60, 200]
};
let lastPulse = 0;
export function pulse(name, mag) {
  if (!settings.vibrate || !PULSES[name]) return false;
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return false;
  const now = performance.now();
  if (now - lastPulse < 80) return false;
  const p = PULSES[name](mag);
  if (!p || (Array.isArray(p) && !p.length)) return false;
  lastPulse = now;
  try { return navigator.vibrate(p); } catch (e) { return false; }
}
