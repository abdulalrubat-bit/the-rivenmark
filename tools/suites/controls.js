/* THE ATTACK CONTRACT: every input is carried out, held a moment, or refused
 * with a reason -- never silently lost, never turned into something else.
 *
 * The new controls, held to the acceptance list of the combat analysis
 * (docs/COMBAT_BASELINE.md has the old controls failing the same things):
 * a press strikes on the next step; a hold keeps striking; an early press
 * inside the buffer strikes exactly once when the blade is ready; holding at
 * the rim never gathers and never slows the walk; the middle means the
 * assist; a cancelled touch, a pause, a swap, a death or a new delve drops
 * the intent; an ordinary kill does not stop the world; and the simulation
 * comes out the same at 30, 60 and 120 frames a second.
 *
 * WHAT WOULD MAKE THIS VACUOUS. A scheme that never swings passes every "did
 * not fire" check, so each of those sits beside the same input firing; and
 * the new rules are run against the classic controls too, which must still
 * fail them -- or the switch between the two is not a switch.
 */
const { chromium } = require('playwright');
const pages = require('./_pages.js');
const pass = [], fail = [];
const ck = (n, ok, note) => (ok ? pass : fail).push((ok ? '' : 'x ') + n + (note ? '  [' + note + ']' : ''));

(async () => {
  await pages.serve();
  const b = await chromium.launch();
  const p = await (await b.newContext()).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(pages.core());
  await p.waitForFunction(() => typeof resetRun === 'function', null, { timeout: 30000 });

  const R = await p.evaluate(() => {
    const o = {};
    const seed = s => { let a = s; Math.random = () => { a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
    const fresh = (scheme, s) => {
      seed(s || 1);
      setControls(scheme);
      resetRun('isaac', LEVELS[0].id, 'riven');
      state = 'play';
      for (const e of enemies) e.hp = 0;
      enemies.length = 0;
      player.hp = player.maxHp = 1e9; player.invuln = 1e9;
      hitStop = 0;
    };
    const step = secs => { let lost = 0; for (let i = 0, n = Math.round(secs * 60); i < n; i++)
      if (!stepDelve(STEP)) lost++; return lost; };
    const sw = () => player.swingNo || 0;

    // 1. a press strikes on the next step
    fresh('new'); let s0 = sw(); attackPress(); step(STEP); o.pressNext = sw() - s0; attackRelease();
    // 2. a still press held past the old tap window still strikes (C01)
    fresh('new'); s0 = sw(); attackPress(); step(0.25); attackRelease(); o.held250 = sw() - s0;
    // 3. a hold keeps striking, on the beat
    fresh('new'); s0 = sw(); attackPress(); step(2.0); attackRelease();
    o.hold2 = sw() - s0; o.hold2want = 1 + Math.floor(2.0 / player.fireDelay + 1e-6);
    // 4. an early press inside the buffer strikes once, when the blade is ready (C02)
    fresh('new'); s0 = sw(); attackPress(); step(STEP); attackRelease();
    step(player.fireDelay - 0.1); attackPress(); step(STEP); attackRelease();
    step(0.3); o.early = sw() - s0;
    //    ...and one far too early has expired, and says so
    fresh('new'); s0 = sw(); attackPress(); step(STEP); attackRelease();
    step(player.fireDelay * 0.3); attackPress(); step(STEP); attackRelease();
    step(player.fireDelay); o.tooEarly = sw() - s0;
    o.expiredLogged = combatLog.some(e => e.k === 'press' && e.r === 'expired');
    //    two quick early presses are still one strike, not a backlog
    fresh('new'); s0 = sw(); attackPress(); step(STEP); attackRelease();
    step(player.fireDelay - 0.1); attackPress(); attackRelease(); attackPress(); attackRelease();
    step(0.5); o.noBacklog = sw() - s0;
    // 5. held at the rim for two seconds: no gather, and the walk is the walk (C03, C04)
    const walk = held => { fresh('new'); stick.dx = 1; stick.dy = 0; stick.mag = 1; stick.active = true;
      const x0 = player.x; if (held) { attackPress(); attackAim(0, 0.95); } step(1.0);
      const out = { dx: player.x - x0, cleave: player.cleave || 0 }; attackRelease();
      stick.mag = 0; stick.dx = 0; stick.active = false; return out; };
    const wHeld = walk(true), wFree = walk(false);
    o.rim = { cleave: wHeld.cleave, held: +wHeld.dx.toFixed(1), free: +wFree.dx.toFixed(1) };
    // 6. the middle means the assist; a drag means your aim, over the assist
    fresh('new');
    const t = newBody('thrall', player.x + 60, player.y, 0); t.awake = false; enemies.push(t);
    step(STEP);
    attackPress(); attackAim(Math.PI, 0.6); step(STEP); attackRelease();
    o.manualA = +(player.swingA || 0).toFixed(2);
    step(player.fireDelay + 0.05);
    attackPress(); attackAim(Math.PI, 0.6); attackNeutral(); step(STEP); attackRelease();
    o.assistA = +(player.swingA || 0).toFixed(2);
    // 7. a cancelled touch drops the intent and fires nothing heavy (C06)
    fresh('new'); attackPress(); step(0.1); s0 = sw(); attackCancel('pointer');
    step(1.5); o.afterCancel = sw() - s0; o.cancelHeavy = combatLog.some(e => e.r === 'heavy');
    // 8. pause, swap, death, a new delve: each drops a held attack
    const drops = {};
    for (const [name, f] of [['pause', () => pauseRun()], ['swap', () => { player.swapCd = 0; swapHero(); }],
                             ['end', () => endRun(false)], ['restart', () => resetRun('isaac', LEVELS[0].id)]]) {
      fresh('new'); attackPress(); step(0.05); f();
      drops[name] = !player.atkHeld && !player.atkQ;
    }
    o.drops = drops;
    // 9. an ordinary kill does not stop the world (C07); the classic controls still do
    const kills = scheme => { fresh(scheme); let lost = 0;
      for (let k = 0; k < 10; k++) { const e = newBody('thrall', player.x + 50, player.y, 0);
        enemies.push(e); damageEnemy(e, 1e6, player.x, player.y); lost += step(0.1); } return lost; };
    o.frozenNew = kills('new'); o.frozenClassic = kills('classic');
    //    and the big moments share a budget
    fresh('new'); let bigLost = 0;
    for (let k = 0; k < 8; k++) { freeze(0.08, 'major'); bigLost += step(0.125); }
    o.bigFrozen = +(bigLost / 60).toFixed(3);
    // 10. the same inputs at 30, 60 and 120 frames a second come out the same
    const run30 = hz => { fresh('new', 7); stick.dx = 0.6; stick.dy = 0.8; stick.mag = 1; stick.active = true;
      attackPress(); const frames = hz * 2; for (let i = 0; i < frames; i++) advanceDelve(1 / hz);
      attackRelease(); stick.mag = 0; stick.active = false;
      return [Math.round(player.x), Math.round(player.y), sw(), +player.fireTimer.toFixed(3)].join(','); };
    o.rates = { r30: run30(30), r60: run30(60), r120: run30(120) };
    // 11. a two-second stall is not paid back as a burst
    fresh('new'); const n0 = combatLog.length; const steps = advanceDelve(2.0);
    o.stall = { steps, logged: combatLog.slice(n0).some(e => e.k === 'stall') };
    // 12. the classic controls are still the classic controls
    fresh('classic'); s0 = sw(); conduitPress(); step(0.25); conduitRelease(); o.classic250 = sw() - s0;
    setControls('new');
    return o;
  });

  ck('a press strikes on the next step', R.pressNext === 1, R.pressNext + ' swings');
  ck('a still press held past 200ms still strikes (C01)', R.held250 >= 1, R.held250 + ' swings');
  ck('a hold keeps striking, on the beat', R.hold2 === R.hold2want, R.hold2 + ' swings in 2s, want ' + R.hold2want);
  ck('an early press inside the buffer strikes once when the blade is ready (C02)', R.early === 2,
     R.early + ' swings from 2 presses');
  ck('one far too early has expired, and does not strike', R.tooEarly === 1, R.tooEarly + ' swings');
  ck('...and the log says it expired', R.expiredLogged === true);
  ck('two quick early presses are one strike, not a backlog', R.noBacklog === 2, R.noBacklog + ' swings');
  ck('held at the rim, it never gathers (C03, C04)', R.rim.cleave === 0, 'gather ' + R.rim.cleave);
  ck('and the walk is not slowed by attacking', Math.abs(R.rim.held - R.rim.free) < 1,
     'moved ' + R.rim.held + ' attacking, ' + R.rim.free + ' not');
  ck('a drag aims by hand, over the assist', Math.abs(Math.abs(R.manualA) - Math.PI) < 0.1,
     'swung at ' + R.manualA + ' with a body at 0');
  ck('back in the middle, the assist aims (C05)', Math.abs(R.assistA) < 0.2, 'swung at ' + R.assistA);
  ck('a cancelled touch strikes nothing more (C06)', R.afterCancel === 0, R.afterCancel + ' swings after');
  ck('and fires no heavy', R.cancelHeavy === false);
  for (const k of Object.keys(R.drops))
    ck(k + ' drops a held attack', R.drops[k] === true);
  ck('an ordinary kill does not stop the world (C07)', R.frozenNew === 0, R.frozenNew + ' of 60 frames');
  ck('...where the classic controls still do (the switch is a switch)', R.frozenClassic > 0,
     R.frozenClassic + ' of 60 frames');
  // Paid in whole 60Hz steps, so the budget can round up by one frame and no more.
  ck('the big moments share a budget: at most 0.12s (and one step) stopped a second',
     R.bigFrozen <= 0.12 + 1 / 60 + 1e-9,
     R.bigFrozen + 's stopped in 1s of eight 0.08s freezes');
  ck('the same inputs come out the same at 30, 60 and 120 fps',
     R.rates.r30 === R.rates.r60 && R.rates.r60 === R.rates.r120, JSON.stringify(R.rates));
  ck('a two-second stall is one step, not a burst, and is logged',
     R.stall.steps <= 1 && R.stall.logged, JSON.stringify(R.stall));
  ck('the classic controls are still there (C01 still happens in them)', R.classic250 === 0,
     R.classic250 + ' swings');
  ck('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));

  console.log('\nPASS ' + pass.length + '\n  ' + pass.join('\n  '));
  console.log('\nFAIL ' + fail.length + (fail.length ? '\n  ' + fail.join('\n  ') : ''));
  await b.close(); pages.stop(); process.exit(fail.length ? 1 : 0);
})();
