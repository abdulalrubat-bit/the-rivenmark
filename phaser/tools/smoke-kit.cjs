#!/usr/bin/env node
/* The kit, handled: discarding, presets, and the bag mid-delve.
 *
 * All three were in the rules and reachable only from the canvas build's
 * menus, so the build that ships could not do any of them. This drives them
 * through this build's own buttons, the way a thumb would.
 *
 * WHAT WOULD MAKE THIS VACUOUS.
 *   - "one tap does not discard" would pass on a button that never discards,
 *     so the second tap has to remove exactly that piece and nothing else.
 *   - "a preset restores the kit" would pass if nothing had been taken off
 *     first, so the kit is stripped between saving and wearing.
 *   - "the bag stops the delve" would pass on a delve that was never running,
 *     so the clock is read moving before the bag opens and after it closes.
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
  const PORT = process.env.PORT || '8293';
  const srv = spawn(process.execPath, [path.join(__dirname, 'serve.js')],
                    { env: { ...process.env, PORT }, stdio: 'ignore' });
  await sleep(800);
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
                                   isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message + (process.env.STACK ? '\n' + e.stack : '')));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const tap = sel => p.click(sel, { timeout: 10000 });
  const base = 'http://localhost:' + PORT + '/';

  try {
    // A furnished stash, written before the game reads it.
    await p.goto(base + '?nogate&norun');
    await p.waitForFunction(() => typeof rollItem === 'function', null, { timeout: 30000 });
    await p.evaluate(() => {
      localStorage.clear();
      const st = blankStash();
      for (const sl of SLOTS) st.gear[sl.id] = rollItem(0.6, sl.id);
      itemSeq = 500;
      st.vault = [rollItem(0.5), rollItem(0.5), rollItem(0.5), rollItem(0.5)];
      st.coins = 100;
      stash = st; saveStash();
    });

    /* ---- the Forge, from the gate-house ---------------------------------- */
    await p.goto(base);
    await p.waitForSelector('#screens.up #descend', { timeout: 30000 });
    await tap('#screens [data-tab="gear"]');
    await sleep(300);
    const before = await p.evaluate(() => stash.vault.map(it => it.uid));

    // Discard: the first tap only arms it.
    await tap('#screens [data-drop="1"]');
    await sleep(150);
    const armed = await p.evaluate(() => ({
      n: stash.vault.length,
      label: document.querySelector('#screens [data-drop="1"]')?.textContent || '' }));
    ck('one tap on discard only asks', armed.n === 4 && /discard\?/.test(armed.label),
       armed.n + ' in the vault, button says ' + JSON.stringify(armed.label));
    await tap('#screens [data-drop="1"]');
    await sleep(200);
    const after = await p.evaluate(() => ({
      uids: stash.vault.map(it => it.uid),
      onDisk: JSON.parse(localStorage.getItem('rivenmark.stash.v1')).vault.length }));
    ck('the second tap throws out that piece and only that piece',
       after.uids.length === 3 && !after.uids.includes(before[1]) &&
       [before[0], before[2], before[3]].every(u => after.uids.includes(u)),
       before.length + ' -> ' + after.uids.length);
    ck('and it stays thrown out', after.onDisk === 3);

    // An armed discard stands down when anything else is tapped.
    await tap('#screens [data-drop="0"]');
    await sleep(150);
    await tap('#screens [data-drop="2"]');
    await sleep(150);
    const moved = await p.evaluate(() => ({ n: stash.vault.length,
      armed: [...document.querySelectorAll('#screens .drop.armed')].map(b => b.dataset.drop) }));
    ck('arming another piece disarms the first, and discards nothing',
       moved.n === 3 && moved.armed.join() === '2', 'armed ' + moved.armed.join());
    await tap('#screens [data-drop="2"]');           // discard it, to leave 2
    await sleep(200);

    // Presets: save, strip, wear it back.
    const cap = await p.evaluate(() => loadoutCap());
    await tap('#saveKit');
    await sleep(200);
    const saved = await p.evaluate(() => ({ n: stash.loadouts.length,
      worn: SLOTS.map(sl => stash.gear[sl.id] && stash.gear[sl.id].uid) }));
    ck('a preset saves the kit being worn', saved.n === 1 && saved.worn.every(Boolean),
       saved.n + ' preset(s)');
    // Strip everything through the buttons, so the preset has work to do.
    for (let i = 0; i < 8; i++) {
      const off = await p.$('#screens [data-off]:not([disabled])');
      if (!off) break;
      await off.click(); await sleep(80);
    }
    const stripped = await p.evaluate(() => SLOTS.filter(sl => stash.gear[sl.id]).length);
    await tap('#screens [data-load="0"]');
    await sleep(200);
    const back = await p.evaluate(() => ({
      worn: SLOTS.map(sl => stash.gear[sl.id] && stash.gear[sl.id].uid),
      note: document.querySelector('#screens .sub')?.textContent || '' }));
    ck('wearing it puts every piece back', stripped === 0 &&
       back.worn.join() === saved.worn.join(), stripped + ' worn after stripping');
    ck('and says what it did', /8 equipped/.test(back.note), back.note.slice(0, 60));

    // Let go: two taps, and it does not touch the kit.
    await tap('#screens [data-unload="0"]');
    await sleep(150);
    const stillThere = await p.evaluate(() => stash.loadouts.length);
    await tap('#screens [data-unload="0"]');
    await sleep(200);
    const gone = await p.evaluate(() => ({ n: stash.loadouts.length,
      worn: SLOTS.filter(sl => stash.gear[sl.id]).length }));
    ck('letting a preset go takes two taps', stillThere === 1 && gone.n === 0);
    ck('and leaves the kit it named alone', gone.worn === 8);

    // At the cap there is no save button, and it says why.
    await p.evaluate(() => { for (let i = 0; i < loadoutCap(); i++) saveLoadout(); });
    await tap('#screens [data-tab="gear"]');
    await sleep(200);
    const full = await p.evaluate(() => ({
      save: !!document.getElementById('saveKit'),
      said: [...document.querySelectorAll('#screens .sub')].map(e => e.textContent).join(' ') }));
    ck('a full set of presets offers no save, and says what to do',
       !full.save && /Let one go/.test(full.said), cap + ' slots');
    await p.screenshot({ path: path.join(__dirname, '..', 'forge.png') });

    /* ---- the bag, mid-delve ---------------------------------------------- */
    await tap('#screens [data-tab="splash"]');
    await sleep(200);
    await tap('#descend');
    await p.waitForFunction(() => state === 'play', null, { timeout: 20000 });
    await sleep(600);
    await p.evaluate(() => { player.bag.push(rollItem(0.7), rollItem(0.7)); });
    await sleep(200);
    const badge = await p.evaluate(() => document.querySelector('#hud .hold .bag i')?.textContent);
    ck('the HUD shows how full the bag is', badge === '2', 'badge ' + JSON.stringify(badge));
    const t0 = await p.evaluate(() => run.time);
    await sleep(400);
    const t1 = await p.evaluate(() => run.time);
    await tap('#hud .hold .bag');
    await sleep(300);
    const open = await p.evaluate(() => ({ state, t: run.time,
      h1: document.querySelector('#screens h1')?.textContent || '',
      rows: document.querySelectorAll('#screens .cmp').length,
      buttons: document.querySelectorAll('#screens [data-on],[data-off],[data-drop]').length }));
    await sleep(400);
    const t2 = await p.evaluate(() => run.time);
    ck('the bag opens mid-delve', open.state === 'gear' && /Bag/.test(open.h1),
       'state ' + open.state + ', ' + JSON.stringify(open.h1));
    ck('and shows what each piece would change', open.rows === 2, open.rows + ' comparisons');
    ck('and is look-only: nothing to wear or throw away', open.buttons === 0);
    ck('the delve stops while it is open', t1 > t0 && Math.abs(t2 - open.t) < 0.001,
       'clock +' + (t1 - t0).toFixed(2) + 's before, +' + (t2 - open.t).toFixed(3) + 's open');
    await p.screenshot({ path: path.join(__dirname, '..', 'bag.png') });
    await tap('#bagBack');
    await sleep(500);
    const closed = await p.evaluate(() => ({ state, t: run.time,
      up: document.getElementById('screens').classList.contains('up') }));
    ck('and Back returns to it, running', closed.state === 'play' && !closed.up &&
       closed.t > t2, 'state ' + closed.state);

    ck('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  } catch (e) {
    ck('the suite got all the way through', false, e.message.split('\n')[0]);
  }

  console.log('\nPASS ' + pass.length + '\n  ' + pass.join('\n  '));
  console.log('\nFAIL ' + fail.length + (fail.length ? '\n  ' + fail.join('\n  ') : ''));
  await b.close(); srv.kill();
  process.exit(fail.length ? 1 : 0);
})();
