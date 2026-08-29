#!/usr/bin/env node
/* The Vendor and the Hall: coin has to have somewhere to go, and spending it
 * has to actually change something.
 *
 * Both screens take money, which is the part worth being careful about. What
 * is checked is that the price shown is the price taken, that a purchase you
 * cannot afford is refused rather than half-applied, and that what you bought
 * is real afterwards -- a hall tier that moves the cap it claims to move, a
 * commission that lands in the vault.
 *
 * DESKTOP ONLY (Playwright). Run: npm run smoke:spend
 */
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pass = [], fail = [];
const ck = (n, ok, note) => (ok ? pass : fail).push((ok ? '' : 'x ') + n + (note ? '  [' + note + ']' : ''));

(async () => {
  const PORT = process.env.PORT || '8241';
  const srv = spawn(process.execPath, [path.join(__dirname, 'serve.js')],
                    { env: { ...process.env, PORT }, stdio: 'ignore' });
  await sleep(800);
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('http://localhost:' + PORT + '/');
  await sleep(3200);

  // --- broke: everything must refuse -------------------------------------
  const broke = await p.evaluate(async () => {
    stash = blankStash(); stash.level = 15; stash.coins = 0; saveStash();
    window.__game.scene.getScene('delve').screens.show('vendor');
    await new Promise(r => setTimeout(r, 120));
    const rows = [...document.querySelectorAll('#screens [data-buy]')];
    return { rows: rows.length, allOff: rows.every(r => r.disabled),
             says: [...document.querySelectorAll('#screens .act')].map(n => n.textContent) };
  });
  ck('the vendor offers his services', broke.rows === 3, broke.rows + ' on the board');
  ck('and refuses them all when the purse is empty', broke.allOff,
     broke.says.join(', '));

  // --- rich: buy a reliquary, which needs no slot -------------------------
  const bought = await p.evaluate(async () => {
    stash.coins = 9000; saveStash();
    const sc = window.__game.scene.getScene('delve').screens;
    sc.show('vendor');
    await new Promise(r => setTimeout(r, 120));
    const row = document.querySelector('#screens [data-buy="reliquary"]');
    const priced = parseInt(row.querySelector('[data-cost]').dataset.cost, 10);
    const v = VENDOR.find(x => x.id === 'reliquary');
    const quoted = vendorCost(v);
    const before = { coins: stash.coins, vault: stash.vault.length };
    row.click();
    await new Promise(r => setTimeout(r, 150));
    return { priced, quoted, before,
             coins: stash.coins, vault: stash.vault.length,
             note: (document.querySelector('#screens .sub') || {}).textContent || '' };
  });
  ck('the price on the button is the core’s price', bought.priced === bought.quoted,
     bought.priced + ' shown, ' + bought.quoted + ' quoted');
  ck('buying takes exactly that much',
     bought.before.coins - bought.coins === bought.quoted,
     bought.before.coins + ' → ' + bought.coins);
  ck('and something arrives for it', bought.vault === bought.before.vault + 1,
     bought.note.trim());

  // --- a commission needs a slot, and is a two-step -----------------------
  const commissioned = await p.evaluate(async () => {
    const sc = window.__game.scene.getScene('delve').screens;
    sc.show('vendor');
    await new Promise(r => setTimeout(r, 120));
    document.querySelector('#screens [data-buy="commission"]').click();
    await new Promise(r => setTimeout(r, 120));
    const picker = document.querySelectorAll('#screens [data-slot]').length;
    const before = stash.vault.length;
    const btn = document.querySelector('#screens [data-slot="blade"]');
    if (btn) btn.click();
    await new Promise(r => setTimeout(r, 150));
    const made = stash.vault[stash.vault.length - 1];
    return { picker, before, after: stash.vault.length,
             slot: made && made.slot, rarity: made && made.rarity,
             affixes: made ? made.affixes.length : 0 };
  });
  ck('a commission asks which slot first', commissioned.picker === 8,
     commissioned.picker + ' slots offered');
  ck('and forges the piece you asked for',
     commissioned.after === commissioned.before + 1 && commissioned.slot === 'blade',
     commissioned.rarity + ' with ' + commissioned.affixes + ' affixes');

  // --- temper offers only what is worn ------------------------------------
  const temper = await p.evaluate(async () => {
    const sc = window.__game.scene.getScene('delve').screens;
    for (const sl of SLOTS) stash.gear[sl.id] = null;
    sc.show('vendor');
    await new Promise(r => setTimeout(r, 120));
    document.querySelector('#screens [data-buy="temper"]').click();
    await new Promise(r => setTimeout(r, 120));
    const bare = { slots: document.querySelectorAll('#screens [data-slot]').length,
                   says: document.querySelector('#screens').textContent,
                   coins: stash.coins,
                   tempCost: vendorCost(VENDOR.find(x => x.id === 'temper')),
                   rowOff: document.querySelector('#screens [data-buy="temper"]')
                           ? document.querySelector('#screens [data-buy="temper"]').disabled
                           : 'no row' };
    const cancel = document.querySelector('#screens [data-cancel]');
    if (cancel) cancel.click();
    await new Promise(r => setTimeout(r, 100));
    // now wear something and ask again
    stash.gear.blade = stash.vault.find(i => i.slot === 'blade') || rollItem(0.6, 'blade');
    const again = document.querySelector('#screens [data-buy="temper"]');
    if (again) again.click();
    await new Promise(r => setTimeout(r, 120));
    return { bare, worn: document.querySelectorAll('#screens [data-slot]').length };
  });
  ck('tempering nothing is not a service', temper.bare.slots === 0 &&
     /Nothing is worn/.test(temper.bare.says),
     'coin ' + temper.bare.coins + ', temper costs ' + temper.bare.tempCost +
     ', row disabled: ' + temper.bare.rowOff);
  ck('but tempering what you wear is', temper.worn === 1,
     temper.worn + ' slot offered once a blade is on');

  // --- the hall: a tier bought must move the cap it claims ----------------
  const hall = await p.evaluate(async () => {
    const sc = window.__game.scene.getScene('delve').screens;
    stash.coins = 5000; saveStash();
    sc.show('hall');
    await new Promise(r => setTimeout(r, 120));
    const before = { cap: vaultCap(), tier: hallTier('vault'), coins: stash.coins };
    const row = document.querySelector('#screens [data-hall="vault"]');
    const priced = parseInt(row.querySelector('[data-cost]').dataset.cost, 10);
    row.click();
    await new Promise(r => setTimeout(r, 150));
    return { before, priced, cap: vaultCap(), tier: hallTier('vault'),
             coins: stash.coins,
             rows: document.querySelectorAll('#screens [data-hall]').length };
  });
  ck('the hall offers its four stations', hall.rows === 4);
  ck('a tier is bought at the price shown',
     hall.before.coins - hall.coins === hall.priced && hall.tier === hall.before.tier + 1,
     hall.priced + ' coin, tier ' + hall.before.tier + ' → ' + hall.tier);
  ck('and the cap it promised actually moves', hall.cap > hall.before.cap,
     'vault ' + hall.before.cap + ' → ' + hall.cap);

  ck('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  await p.screenshot({ path: path.join(__dirname, '..', 'hall.png') });
  console.log('\nPASS ' + pass.length + '\n  ' + pass.join('\n  '));
  console.log('\nFAIL ' + fail.length + (fail.length ? '\n  ' + fail.join('\n  ') : ''));
  await b.close(); srv.kill();
  process.exit(fail.length ? 1 : 0);
})();
