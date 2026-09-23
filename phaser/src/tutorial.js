/* THE FIRST DELVE, TAUGHT.
 *
 * Six steps over the live game, each finished by DOING it rather than by
 * reading it: move, strike, aim, the heavy blow, an ability, and then one
 * card about getting out -- what the gate is for, and what is kept and what is
 * lost when a delve ends badly, which is the thing a new player most needs to
 * know before it happens to them, and in Hardcore most of all.
 *
 * It watches the core's own record of what happened (the combat log, the
 * hero's position, the kit) instead of wiring itself into the systems it
 * teaches, so teaching can never change how any of them behave. It shows
 * once; Skip ends it at any step; Settings can ask for it again.
 *
 * The words follow the controls: under the classic scheme the steps say tap,
 * drag and hold at the rim, because that is what the player has.
 */
import { settings, setSetting } from './settings.js';

const CSS = `
#tut{position:fixed;left:50%;transform:translateX(-50%);top:calc(env(safe-area-inset-top,0px) + 92px);
     width:min(340px,calc(100vw - 32px));z-index:30;pointer-events:auto;
     background:rgba(16,13,10,.92);border:1px solid #6d5a36;border-radius:10px;
     padding:12px 14px 10px;color:#e8dcc0;font:14px/1.4 Georgia,serif;
     box-shadow:0 6px 18px rgba(0,0,0,.55)}
#tut b{color:#f0cf86;font-weight:600}
#tut .row{display:flex;justify-content:space-between;align-items:center;margin-top:8px;
     font:11px/1 ui-monospace,monospace;color:#8c8168}
#tut button{background:none;border:1px solid #4a3f30;color:#cebe9e;border-radius:6px;
     padding:5px 10px;font:12px/1 Georgia,serif}
#tut button.go{border-color:#c9a45a;color:#f0dcae}
.tut-point{animation:tutpulse 1.2s ease-in-out infinite;outline-offset:4px}
@keyframes tutpulse{0%,100%{outline:2px solid rgba(240,207,134,.25)}50%{outline:2px solid rgba(240,207,134,.95)}}
`;

// Each step: what to say (by scheme), what to point at, and when it is done.
// `since` is the combat log's entry number when the step began.
const STEPS = [
  { say: () => '<b>Drag anywhere on the left</b> to walk.',
    point: null,
    start: t => { t.from = { x: player.x, y: player.y }; },
    done: t => Math.hypot(player.x - t.from.x, player.y - t.from.y) > 140 },
  { say: c => c === 'classic' ? '<b>Tap the Conduit</b>, bottom right, to strike.'
                              : '<b>Hold the Conduit</b>, bottom right. You strike for as long as you hold.',
    point: '#hud .conduit',
    done: t => t.count(e => e.k === 'swing' || (e.k === 'release' && e.r === 'tap')) >= 3 },
  { say: c => c === 'classic' ? '<b>Drag the Conduit</b> to point the blow yourself.'
                              : '<b>Drag the Conduit</b> to aim by hand. Back to the middle, and it aims for you.',
    point: '#hud .conduit',
    done: t => t.count(e => (e.k === 'swing' && e.r === 'manual') || (e.k === 'swing' && e.r === 'driven')) >= 2 },
  { say: c => c === 'classic' ? '<b>Drag to the rim and hold</b> to gather a heavy blow. Let go to bring it round.'
                              : '<b>Hold HEAVY</b> to gather a heavy blow, then let go. A full one breaks a raised guard.',
    point: c => c === 'classic' ? '#hud .conduit' : '#hud .heavy',
    done: t => t.count(e => (e.k === 'heavy' && e.r === 'strike') || (e.k === 'release' && e.r === 'heavy')) >= 1 },
  { say: () => 'Landing blows fills your <b>kit</b>. Use one now — it is full.',
    point: '#hud .kit',
    start: () => { player.charges = CHARGE_MAX; player.tension = TENSION_MAX; player.gcd = 0; player.cds = {}; },
    done: t => t.count(e => e.k === 'ability' && e.r === 'cast') >= 1 },
  { say: () => hardcore
      ? 'Cut slag from the horde until the <b>ley-gate</b> wakes, then hold it open and step through: ' +
        'what you carry out is kept. <b>This is Hardcore: one life.</b> Die, abandon the delve, or close the ' +
        'game mid-delve, and everything is gone.'
      : 'Cut slag from the horde until the <b>ley-gate</b> wakes, then hold it open and step through: ' +
        'what you carry out is kept. Die or abandon the delve, and your bag and coin stay where you fell ' +
        '— descend again to take them back. Your worn gear is always kept.',
    point: null, confirm: 'Understood',
    done: () => false }
];

export class Tutorial {
  constructor() {
    this.el = null; this.i = -1;
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    window.__tutorial = this;
    // Settings' "teach the controls again": shown on the next delve.
    window.__replayTutorial = () => setSetting('tutorialSeen', false);
  }

  get active() { return this.i >= 0; }

  // Called when a delve begins. Real delves only -- never the practice room.
  maybeStart() {
    if (settings.tutorialSeen || (run && run.room) || this.active) return false;
    this.i = -1;
    this.next();
    return true;
  }

  count(f) { return combatLog.filter(e => e.n > this.since && f(e)).length; }

  next() {
    this.i++;
    this.clearPoint();
    if (this.i >= STEPS.length) return this.finish(true);
    const s = STEPS[this.i];
    this.since = combatSeq;
    if (s.start) s.start(this);
    this.render();
  }

  render() {
    const s = STEPS[this.i], scheme = controlScheme;
    if (!this.el) { this.el = document.createElement('div'); this.el.id = 'tut'; document.body.appendChild(this.el); }
    this.el.innerHTML = '<div class="say">' + s.say(scheme) + '</div>' +
      '<div class="row"><span>' + (this.i + 1) + ' of ' + STEPS.length + '</span><span>' +
      '<button type="button" class="skip">Skip</button> ' +
      (s.confirm ? '<button type="button" class="go">' + s.confirm + '</button>' : '') + '</span></div>';
    this.el.querySelector('.skip').addEventListener('click', () => this.finish(false));
    const go = this.el.querySelector('.go');
    if (go) go.addEventListener('click', () => this.next());
    const sel = typeof s.point === 'function' ? s.point(scheme) : s.point;
    const target = sel && document.querySelector(sel);
    if (target) { target.classList.add('tut-point'); this.pointed = target; }
  }

  clearPoint() { if (this.pointed) this.pointed.classList.remove('tut-point'); this.pointed = null; }

  // Every frame, from the scene. Hidden, not ended, while the delve is not
  // being played (paused, the bag open): it picks up where it was.
  tick() {
    if (!this.active) return;
    const live = state === 'play';
    if (this.el) this.el.style.display = live ? '' : 'none';
    if (state === 'over' || state === 'menu') return this.finish(false, true);
    if (live && STEPS[this.i].done(this)) this.next();
  }

  finish(completed, quiet) {
    this.clearPoint();
    if (this.el) { this.el.remove(); this.el = null; }
    this.i = -1;
    // Skipping counts as seen: someone who skips it does not want it back
    // every delve. Settings is where to ask for it again. A delve that simply
    // ended mid-lesson (died, left) does NOT count, so it comes back next time.
    if (!quiet || completed) setSetting('tutorialSeen', true);
    if (!quiet && typeof window.sfx === 'function') window.sfx(completed ? 'charged' : 'tap');
  }
}
