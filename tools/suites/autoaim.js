/* AUTO-STRIKE AIMS AT WHAT IS ON YOU.
 *
 * Playtested: "the enemy could be behind you and it keeps swinging forwards".
 * Each case stands the hero somewhere open, sets the stick, puts bodies down,
 * lets auto-strike throw ONE blow on its own beat, and reads the direction the
 * crescent actually left in -- not the target the picker names, since a right
 * pick thrown the wrong way is exactly the bug.
 *
 *   - walking away from a body at your heels, with another further on ahead:
 *     the blow goes back at the one at your heels
 *   - a swing once aimed by hand does not steer the automatic ones after it
 *   - with nothing close, it still leads the way you are walking (the assist)
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
  await p.waitForFunction(() => typeof autoTarget === 'function', null, { timeout: 30000 });

  const R = await p.evaluate(() => {
    const o = {};
    stash = blankStash();
    const setup = () => {
      startRun('isaac', LEVELS[2].id, 'riven');
      setControls('new');
      setAutoStrike(true);
      for (const e of enemies) e.hp = 0;
      enemies.length = 0;
      const c = openCells.find(q => !pointInWalls(q.x, q.y, 300)) || openCells[0];
      player.x = c.x; player.y = c.y;
      player.hp = player.maxHp = 1e9; player.invuln = 1e9;
      player.fireTimer = 0; player.atkQ = null; player.atkHeld = false;
      player.atkAim = null; player.assistT = null;
    };
    const put = (dx, dy) => {
      const kind = Object.keys(ENEMY_TYPES).find(k => !ENEMY_TYPES[k].boss && k !== 'mirage');
      const e = newBody(kind, player.x + dx, player.y + dy, 0);
      e.speed = 0; e.dmg = 0; e.hp = e.maxHp = 1e9;
      enemies.push(e); return e;
    };
    // Walk: the stick held the way given, for one blow's worth of frames.
    const firstBlow = (sx, sy) => {
      stick.active = true; stick.dx = sx; stick.dy = sy; stick.mag = 1;
      arcs.length = 0;
      for (let i = 0; i < 90 && !arcs.length; i++) update(1 / 60);
      stick.active = false; stick.mag = 0;
      const a = arcs[0];
      return a ? { dx: +a.dx.toFixed(2), dy: +a.dy.toFixed(2) } : null;
    };
    const Rr = () => player.range;

    // 1. at your heels, and another further on ahead
    setup();
    put(0, Rr() * 0.45);           // behind (walking up, -y)
    put(0, -Rr() * 0.6);           // ahead, a little further off
    o.heels = firstBlow(0, -1);

    // 2. a hand-aimed angle left behind does not steer it
    setup();
    player.atkAim = 0;             // once aimed east, by hand
    put(-Rr() * 0.3, 0);           // the body is west
    o.stale = firstBlow(0, 0.001);

    // 3. nothing close: it leads where you walk
    setup();
    put(0, -Rr() * 0.8);           // ahead
    put(0, Rr() * 0.9);            // behind, a little further
    o.lead = firstBlow(0, -1);
    return o;
  });

  ck('walking away from one at your heels, the blow goes back at it',
     R.heels && R.heels.dy > 0.7, JSON.stringify(R.heels));
  ck('an angle once aimed by hand does not steer the automatic blow',
     R.stale && R.stale.dx < -0.7, JSON.stringify(R.stale));
  ck('with nothing close, it still leads the way you walk',
     R.lead && R.lead.dy < -0.7, JSON.stringify(R.lead));
  ck('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));

  console.log('\nPASS ' + pass.length + '\n  ' + pass.join('\n  '));
  console.log('\nFAIL ' + fail.length + (fail.length ? '\n  ' + fail.join('\n  ') : ''));
  await b.close(); pages.stop(); process.exit(fail.length ? 1 : 0);
})();
