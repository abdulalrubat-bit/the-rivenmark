/* THE END OF THE LADDER: out of rung fifty-two with the whole Choir silenced.
 *
 * That is the one ending, and it is kept: an honour that counts, a card that
 * tells it at length the first time and in a line after, and a ladder that
 * stays open once it has been told.
 *
 * WHAT WOULD MAKE THIS VACUOUS. An ending that fired on every extraction
 * would pass "the finale ends the game", so it is checked NOT to fire on a
 * shallower rung, NOT on the finale left with the Choir still singing, and NOT
 * on a death there.
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
  await p.waitForFunction(() => typeof spawnChoir === 'function', null, { timeout: 30000 });

  const R = await p.evaluate(() => {
    const step = secs => { for (let i = 0, n = Math.round(secs * 60); i < n; i++) update(1 / 60); };
    const card = () => ({ title: el.overTitle.innerHTML, sub: el.overSub.textContent,
                          ending: run.ending, silence: honours().silence || 0 });
    const delve = idx => {
      startRun('isaac', LEVELS[idx].id, 'riven');
      player.hp = player.maxHp = 1e9; player.invuln = 1e9;
    };
    const silenceAll = () => {
      run.tech = LEVEL.quota; run.bossCalled = true; spawnBoss();
      run.choir.beat = 1e9;
      for (const s of run.choir.singers) damageEnemy(s.e, 1e9, player.x, player.y);
      step(0.3);
    };
    keepHonours({});
    const o = {};

    delve(CURVE_DEEP); run.tech = LEVEL.quota; run.bossCalled = true; spawnBoss();
    endRun(true); o.singing = card();

    delve(CURVE_DEEP); silenceAll(); o.down = run.bossDown === true;
    endRun(false); o.died = card();

    delve(CURVE_DEEP); silenceAll(); endRun(true); o.first = card();
    delve(CURVE_DEEP); silenceAll(); endRun(true); o.again = card();

    delve(CHOIR_FROM); silenceAll(); endRun(true); o.shallow = card();

    o.open = LEVELS.length === LEVEL_COUNT && !!LEVELS[CURVE_DEEP] &&
             (() => { try { delve(3); return state === 'play'; } catch (e) { return false; } })();
    return o;
  });

  ck('the finale left with the Choir singing is not the ending', !R.singing.ending &&
     /Escaped/.test(R.singing.title) && R.singing.silence === 0, JSON.stringify(R.singing).slice(0, 90));
  ck('silencing every voice brings the avatar down', R.down === true);
  ck('...but dying there is not the ending either', !R.died.ending && R.died.silence === 0, R.died.title);
  ck('carried out of the silence, it is', R.first.ending === 'first' && /Silence/.test(R.first.title) &&
     /quiet for the first time/.test(R.first.sub) && /ladder stays open/.test(R.first.sub),
     R.first.title + ' / ' + R.first.sub.slice(0, 60));
  ck('...and it is kept as an honour', R.first.silence === 1);
  ck('the second time it is a line, and it counts', R.again.ending === 'again' && R.again.silence === 2 &&
     R.again.sub.length < R.first.sub.length, R.again.sub.slice(0, 60));
  ck('the Choir on a shallower rung is not the ending', !R.shallow.ending && R.shallow.silence === 2,
     R.shallow.title);
  ck('and the ladder stays open after it', R.open === true);
  ck('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));

  console.log('\nPASS ' + pass.length + '\n  ' + pass.join('\n  '));
  console.log('\nFAIL ' + fail.length + (fail.length ? '\n  ' + fail.join('\n  ') : ''));
  await b.close(); pages.stop(); process.exit(fail.length ? 1 : 0);
})();
