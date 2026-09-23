#!/usr/bin/env node
/* A save that fails, or a save that was damaged, is never silent.
 *
 * Storage is made to refuse the save (the way a full phone does), and the
 * gate-house must say so -- and stop saying so once a save goes through again.
 * Then the save on disk is cut off mid-write, and the next launch must load
 * the backup and say it did, once.
 *
 * WHAT WOULD MAKE THIS VACUOUS. A notice that is always shown passes "it is
 * shown", so each is checked absent before the trouble and after it clears.
 */
const { chromium } = require('playwright');
const buildOnce = require('./build-once.cjs');
const { spawn } = require('child_process');
const path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pass = [], fail = [];
const ck = (n, ok, note) => (ok ? pass : fail).push((ok ? '' : 'x ') + n + (note ? '  [' + note + ']' : ''));

(async () => {
  buildOnce();
  const PORT = process.env.PORT || '8302';
  const srv = spawn(process.execPath, [path.join(__dirname, 'serve.js')],
                    { env: { ...process.env, PORT }, stdio: 'ignore' });
  await sleep(800);
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  const G = 'http://localhost:' + PORT + '/';
  const notice = () => p.evaluate(() => { const w = document.querySelector('#screens .sub.warn');
    return w ? w.textContent : ''; });
  const home = async () => { await p.click('#screens .tabs [data-tab="hall"]'); await sleep(150);
    await p.click('#screens .tabs [data-tab="splash"]'); await sleep(200); };

  try {
    await p.goto(G); await p.evaluate(() => localStorage.clear()); await p.goto(G);
    await p.waitForSelector('#screens.up #descend', { timeout: 30000 });
    ck('no notice when all is well', (await notice()) === '');

    // A full phone: every write to the stash is refused.
    const failed = await p.evaluate(() => {
      window.__realSet = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) {
        if (/stash/.test(k)) { const e = new Error('full'); e.name = 'QuotaExceededError'; throw e; }
        return window.__realSet.call(this, k, v);
      };
      stash.coins = 5; return saveStash();
    });
    await home();
    const n1 = await notice();
    ck('a refused save is reported, not swallowed', failed === false && /could not be saved/.test(n1) &&
       /QuotaExceededError/.test(n1), n1.slice(0, 80));
    const logged = await p.evaluate(() => combatLog.some(e => e.k === 'save' && e.r === 'failed'));
    ck('...and logged for the diagnostics dump', logged);

    // Space again: the next save goes through and the notice goes.
    await p.evaluate(() => { Storage.prototype.setItem = window.__realSet; saveStash(); });
    await home();
    ck('the notice clears once a save goes through', (await notice()) === '');

    // A save cut off mid-write: the next launch loads the backup, and says so once.
    await p.evaluate(() => { stash.coins = 4242; saveStash(); loadStash(); });   // a clean read leaves a backup
    await p.evaluate(() => localStorage.setItem('rivenmark.stash.v1', '{"coins": 1, "vault": ['));
    await p.goto(G);
    await p.waitForSelector('#screens.up #descend', { timeout: 30000 });
    const n2 = await notice();
    const coins = await p.evaluate(() => stash.coins);
    ck('a damaged save loads the last good one, and says so', /damaged/.test(n2) && coins === 4242,
       coins + ' coin; "' + n2.slice(0, 60) + '"');
    await home();
    ck('...once, not every time the gate-house is drawn', !/damaged/.test(await notice()));

    ck('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  } catch (e) {
    ck('the suite got all the way through', false, e.message.split('\n')[0]);
  }
  console.log('\nPASS ' + pass.length + '\n  ' + pass.join('\n  '));
  console.log('\nFAIL ' + fail.length + (fail.length ? '\n  ' + fail.join('\n  ') : ''));
  await b.close(); srv.kill();
  process.exit(fail.length ? 1 : 0);
})();
