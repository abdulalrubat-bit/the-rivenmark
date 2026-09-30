/* THE GOAL LINE: what the HUD says to do, at every step of a delve.
 *
 * Read off the same state the delve runs on, so each check drives the real
 * thing (slag collected, the avatar called and put down, the gate wound and
 * opened) and reads the line back, rather than setting the line's inputs.
 *
 *   1 gather slag, with the count against this delve's own quota
 *   2 defeat the avatar, by its name, once the quota calls it
 *   3 reach the ley-gate; inside it, wind it open with a percentage
 *   4 step out to escape, once it is open
 *   and nothing in the practice room, which has no goal
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
  await p.waitForFunction(() => typeof objectiveLine === 'function', null, { timeout: 30000 });

  const R = await p.evaluate(() => {
    const o = {};
    const step = secs => { for (let i = 0, n = Math.round(secs * 60); i < n; i++) update(1 / 60); };
    stash = blankStash();
    startRun('isaac', LEVELS[3].id, 'riven');
    for (const e of enemies) e.hp = 0;
    enemies.length = 0;
    player.hp = player.maxHp = 1e9; player.invuln = 1e9;
    o.quota = LEVEL.quota;
    o.s1 = objectiveLine();
    collectTech(LEVEL.quota);
    step(0.1);
    o.s2 = objectiveLine();
    o.bossTitle = run.boss && run.boss.title;
    // Put the avatar down the way the core records it (this one is held by
    // Lieutenants, so a blow alone would not do it), and clear the field.
    if (run.boss) run.boss.hp = 0;
    run.bossDown = true; run.boss = null;
    for (const e of enemies) e.hp = 0;
    enemies.length = 0;
    step(0.1);
    o.s3 = objectiveLine();
    player.x = portal.x; player.y = portal.y;
    step(LEVEL.channel * 0.5);
    o.s3in = objectiveLine();
    step(LEVEL.channel * 0.6 + 0.2);
    o.s4 = objectiveLine();
    startPractice('isaac');
    o.practice = objectiveLine();
    return o;
  });

  ck('first: gather slag, against this delve’s own quota',
     R.s1 && R.s1.step === 1 && R.s1.note === '0 / ' + R.quota, JSON.stringify(R.s1));
  ck('the quota called the avatar: defeat it, by name',
     R.s2 && R.s2.step === 2 && !!R.bossTitle && R.s2.text.includes(R.bossTitle), JSON.stringify(R.s2));
  ck('it is down: reach the ley-gate', R.s3 && R.s3.step === 3 && /Reach/.test(R.s3.text), JSON.stringify(R.s3));
  ck('standing in it: wind it open, with how far', R.s3in && R.s3in.step === 3 && /Wind/.test(R.s3in.text) &&
     /\d+%/.test(R.s3in.note) && !/^0%/.test(R.s3in.note), JSON.stringify(R.s3in));
  ck('open: step out to escape', R.s4 && R.s4.step === 4 && /escape/.test(R.s4.text), JSON.stringify(R.s4));
  ck('the practice room has no goal line', R.practice === null, JSON.stringify(R.practice));
  ck('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));

  console.log('\nPASS ' + pass.length + '\n  ' + pass.join('\n  '));
  console.log('\nFAIL ' + fail.length + (fail.length ? '\n  ' + fail.join('\n  ') : ''));
  await b.close(); pages.stop(); process.exit(fail.length ? 1 : 0);
})();
