/* WHAT IS HITTING ME: a blow leaves a mark pointing back at where it came from.
 *
 *   - a blow from the left marks the left (angle ~ pi), from above marks up
 *   - a bigger share of your life marks brighter
 *   - the marks fade, and there are never more than six
 *   - a blow with no source (poison, a hazard with none) leaves no mark
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
  await p.waitForFunction(() => typeof noteHit === 'function', null, { timeout: 30000 });

  const R = await p.evaluate(() => {
    const o = {};
    stash = blankStash();
    startRun('isaac', LEVELS[2].id, 'riven');
    for (const e of enemies) e.hp = 0;
    enemies.length = 0;
    player.hp = player.maxHp = 1000;
    const hit = (dx, dy, dmg) => { player.invuln = 0; hurtPlayerBy(dmg, player.x + dx, player.y + dy); return run.hits[run.hits.length - 1]; };
    const left = hit(-200, 0, 10), up = hit(0, -200, 10), big = hit(200, 0, 300);
    o.left = +left.a.toFixed(2); o.up = +up.a.toFixed(2);
    o.small = left.w; o.big = big.w;
    for (let i = 0; i < 10; i++) hit(100, 100, 5);
    o.capped = run.hits.length;
    for (let i = 0; i < 90; i++) update(1 / 60);
    o.faded = run.hits.length;
    player.invuln = 0; hurtPlayerBy(5);
    o.noSource = run.hits.length;
    return o;
  });

  ck('a blow from the left marks the left', Math.abs(Math.abs(R.left) - Math.PI) < 0.05, String(R.left));
  ck('a blow from above marks up', Math.abs(R.up + Math.PI / 2) < 0.05, String(R.up));
  ck('a bigger blow marks brighter', R.big > R.small, R.small + ' -> ' + R.big);
  ck('never more than six at once', R.capped === 6, String(R.capped));
  ck('and they fade', R.faded === 0, R.faded + ' left');
  ck('a blow with no source leaves no mark', R.noSource === 0, String(R.noSource));
  ck('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));

  console.log('\nPASS ' + pass.length + '\n  ' + pass.join('\n  '));
  console.log('\nFAIL ' + fail.length + (fail.length ? '\n  ' + fail.join('\n  ') : ''));
  await b.close(); pages.stop(); process.exit(fail.length ? 1 : 0);
})();
