/* WHAT JUST HAPPENED: lines that wait their turn, and an outcome that says
 * what changed.
 *
 *   - two lines landing together both get seen: the second waits until the
 *     first has been up a second, instead of replacing it in the same frame
 *   - the same line twice is not queued twice
 *   - the outcome card names a level gained and the talent points it brought,
 *     and what was found down there; a delve that levels nothing says so
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
  await p.waitForFunction(() => typeof toast === 'function' && typeof TOAST_MIN === 'number', null, { timeout: 30000 });

  const R = await p.evaluate(() => {
    const o = {};
    const step = secs => { for (let i = 0, n = Math.round(secs * 60); i < n; i++) update(1 / 60); };
    stash = blankStash();
    startRun('isaac', LEVELS[2].id, 'riven');
    for (const e of enemies) e.hp = 0;
    enemies.length = 0;
    player.hp = player.maxHp = 1e9; player.invuln = 1e9;
    run.toast = null; run.toastQ = [];
    toast('first', '#fff'); toast('second', '#fff'); toast('second', '#fff');
    o.now = run.toast.text; o.waiting = run.toastQ.length;
    step(0.5); o.half = run.toast.text;
    step(0.7); o.after = run.toast && run.toast.text;
    // The outcome card.
    stash.xp = 0; stash.level = 1;
    run.tech = 600; run.shrines = 1; run.secrets = 1; run.encounters = 2; run.lorePages = 0;
    endRun(true);
    o.stats = el.overStats.innerHTML; o.sub = el.overSub.textContent;
    // A delve that levels nothing.
    stash = blankStash(); stash.xp = 1e9; stash.level = levelForXp(1e9);
    startRun('isaac', LEVELS[2].id, 'riven');
    run.tech = 0;
    endRun(true);
    o.flat = el.overStats.innerHTML;
    return o;
  });

  ck('the first line is not replaced by the second', R.now === 'first' && R.half === 'first', R.now + ', ' + R.half);
  ck('the second waits its turn, and is shown', R.waiting === 1 && R.after === 'second', R.waiting + ' waiting, then ' + R.after);
  ck('the outcome names the level gained and the points it brought',
     /Level<b>1 → \d+/.test(R.stats) && /Talent points<b>\+\d+/.test(R.stats) && /talent point/.test(R.sub),
     R.stats.replace(/<[^>]+>/g, ' ').slice(-160));
  ck('and what was found', /1 shrine/.test(R.stats) && /1 hidden room/.test(R.stats) && /2 rooms beaten/.test(R.stats) &&
     !/lore page/.test(R.stats));
  ck('a delve that levels nothing says only the level', /Level<b>\d+<\/b>/.test(R.flat) && !/Talent points/.test(R.flat) &&
     !/Found/.test(R.flat));
  ck('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));

  console.log('\nPASS ' + pass.length + '\n  ' + pass.join('\n  '));
  console.log('\nFAIL ' + fail.length + (fail.length ? '\n  ' + fail.join('\n  ') : ''));
  await b.close(); pages.stop(); process.exit(fail.length ? 1 : 0);
})();
