#!/usr/bin/env node
/* The Forge: gear the loop banks has to be wearable, and wearing it has to
 * matter.
 *
 * A screen that lists items and moves them between two arrays is easy to write
 * and easy to get subtly wrong -- an item that vanishes on a mis-tap, a swap
 * that drops the piece it replaced, a power figure that never moves. So what
 * is checked is the arithmetic and the arrays, not the markup: nothing is
 * created or destroyed by equipping, power responds, and the change survives
 * a reload because it was saved.
 *
 * DESKTOP ONLY (Playwright). Run: npm run smoke:forge
 */
const { chromium } = require('playwright');
const buildOnce = require('./build-once.cjs');
const { spawn } = require('child_process');
const path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pass = [], fail = [];
const ck = (n, ok, note) => (ok ? pass : fail).push((ok ? '' : 'x ') + n + (note ? '  [' + note + ']' : ''));

(async () => {
  buildOnce();                       // the suite must test src/, not a stale bundle
  const PORT = process.env.PORT || '8237';
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

  // Put a few real drops in the vault, rolled by the core rather than faked,
  // so the affix lines and the power figures are the game's own.
  const seeded = await p.evaluate(() => {
    stash = blankStash(); stash.level = 12;
    for (let i = 0; i < 4; i++) {
      const it = rollItem(0.7);
      if (it) stash.vault.push(it);
    }
    saveStash();
    window.__game.scene.getScene('delve').screens.show('gear');
    return { vault: stash.vault.length, power: stashPower(),
             names: stash.vault.map(i => i.name) };
  });
  ck('the vault holds what the delve dropped', seeded.vault >= 3,
     seeded.vault + ' pieces: ' + seeded.names.slice(0, 2).join(', ') + '…');

  const shown = await p.evaluate(() => ({
    worn: document.querySelectorAll('#screens [data-off]').length,
    vault: document.querySelectorAll('#screens [data-on]').length,
    affixLines: [...document.querySelectorAll('#screens .aff')]
                .filter(n => n.textContent && !/nothing worn/.test(n.textContent)).length,
    coloured: new Set([...document.querySelectorAll('#screens .item b')]
                      .map(n => n.style.color)).size
  }));
  ck('the forge shows every slot and every find',
     shown.worn === 8 && shown.vault === seeded.vault,
     shown.worn + ' slots, ' + shown.vault + ' in the vault');
  ck('each find reads its own affixes', shown.affixLines >= seeded.vault,
     shown.affixLines + ' affix lines');
  ck('and its rarity has a colour', shown.coloured >= 1, shown.coloured + ' distinct');

  // Equip the first find and check the books balance.
  const equipped = await p.evaluate(async () => {
    const before = { vault: stash.vault.length, power: stashPower(),
                     total: stash.vault.length + SLOTS.filter(s => stash.gear[s.id]).length };
    // The STRONGEST piece, not the first. powerLevel rounds -- it averages the
    // kit across eight slots and halves the sum with the hero's rank -- so a
    // weak find can leave the displayed figure exactly where it was, and the
    // check then fails on the seed rather than on the code.
    let best = 0;
    for (let i = 1; i < stash.vault.length; i++)
      if (itemPower(stash.vault[i]) > itemPower(stash.vault[best])) best = i;
    const slot = stash.vault[best].slot, uid = stash.vault[best].uid;
    document.querySelector('#screens [data-on="' + best + '"]').click();
    await new Promise(r => setTimeout(r, 120));
    return { before, slot, uid, worth: Math.round(itemPower(stash.gear[slot] || { affixes: [] })),
             after: { vault: stash.vault.length, power: stashPower(),
                      total: stash.vault.length + SLOTS.filter(s => stash.gear[s.id]).length },
             wornUid: stash.gear[slot] ? stash.gear[slot].uid : null };
  });
  ck('tapping a find wears it', equipped.wornUid === equipped.uid,
     'into the ' + equipped.slot + ' slot');
  ck('and nothing is created or destroyed by it',
     equipped.after.total === equipped.before.total,
     equipped.before.total + ' pieces before, ' + equipped.after.total + ' after');
  ck('power answers', equipped.after.power > equipped.before.power,
     equipped.before.power + ' → ' + equipped.after.power +
     ' on a piece worth ' + equipped.worth);

  // Take it off again: it must come back, not disappear.
  const off = await p.evaluate(async () => {
    const slot = SLOTS.find(s => stash.gear[s.id]).id;
    const uid = stash.gear[slot].uid;
    const before = stash.vault.length;
    document.querySelector('#screens [data-off="' + slot + '"]').click();
    await new Promise(r => setTimeout(r, 120));
    return { slot, uid, before, after: stash.vault.length,
             back: stash.vault.some(i => i.uid === uid),
             empty: stash.gear[slot] === null };
  });
  ck('taking a piece off returns it to the vault',
     off.back && off.empty && off.after === off.before + 1,
     off.before + ' → ' + off.after + ' in the vault');

  // A swap must hand back the piece it replaced rather than eat it.
  const swap = await p.evaluate(async () => {
    const slot = stash.vault[0].slot;
    // two pieces for one slot, so the second displaces the first
    const a = stash.vault.find(i => i.slot === slot);
    let bItem = stash.vault.find(i => i.slot === slot && i.uid !== a.uid);
    if (!bItem) { bItem = rollItem(0.8); bItem.slot = slot; stash.vault.push(bItem); }
    stash.gear[slot] = a;
    stash.vault = stash.vault.filter(i => i.uid !== a.uid);
    window.__game.scene.getScene('delve').screens.show('gear');
    await new Promise(r => setTimeout(r, 120));
    const idx = stash.vault.findIndex(i => i.uid === bItem.uid);
    const total = stash.vault.length + SLOTS.filter(s => stash.gear[s.id]).length;
    document.querySelector('#screens [data-on="' + idx + '"]').click();
    await new Promise(r => setTimeout(r, 120));
    return { displaced: stash.vault.some(i => i.uid === a.uid),
             wearing: stash.gear[slot] && stash.gear[slot].uid === bItem.uid,
             total, after: stash.vault.length + SLOTS.filter(s => stash.gear[s.id]).length };
  });
  ck('a swap hands back the piece it replaced',
     swap.displaced && swap.wearing && swap.after === swap.total,
     'losing an item to a mis-tap is not a trade anyone agreed to');

  // And it was saved, not just shown.
  const saved = await p.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('rivenmark.stash.v1') || '{}');
    const wornSlots = SLOTS.filter(s => raw.gear && raw.gear[s.id]).length;
    return { wornSlots, vault: (raw.vault || []).length };
  });
  ck('the change is written to the stash', saved.wornSlots >= 1,
     saved.wornSlots + ' worn and ' + saved.vault + ' vaulted in localStorage');

  /* And the point of all of it: worn gear has to reach the hero.
   * Everything above this moves items between two arrays. If startRun does not
   * carry stash.gear onto the player, the forge is a filing cabinet. */
  const onTheHero = await p.evaluate(async () => {
    stash = blankStash(); stash.level = 20; saveStash();
    startRun('isaac', LEVELS[3].id, 'riven');
    const bare = { damage: player.damage, hp: player.maxHp };
    // A blade with a damage affix, forced so the comparison cannot roll flat.
    const blade = rollItem(0.9);
    blade.slot = 'blade';
    // 'damage', not 'dmg'. The boon table uses dmg; the AFFIX table does not,
    // and an id that is in neither is simply ignored -- which looked exactly
    // like "gear does not reach the hero".
    blade.affixes = [{ id: 'damage', v: 12 }];
    stash.vault.push(blade);
    window.__game.scene.getScene('delve').screens.show('gear');
    await new Promise(r => setTimeout(r, 120));
    const idx = stash.vault.findIndex(i => i.uid === blade.uid);
    document.querySelector('#screens [data-on="' + idx + '"]').click();
    await new Promise(r => setTimeout(r, 120));
    startRun('isaac', LEVELS[3].id, 'riven');
    return { bare, worn: { damage: player.damage, hp: player.maxHp },
             carried: !!(player.gear && player.gear.blade) };
  });
  ck('the hero descends wearing it', onTheHero.carried);
  ck('and it changes what he is', onTheHero.worn.damage > onTheHero.bare.damage,
     'damage ' + onTheHero.bare.damage.toFixed(1) + ' → ' + onTheHero.worn.damage.toFixed(1));

  ck('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  await p.screenshot({ path: path.join(__dirname, '..', 'forge.png') });
  console.log('\nPASS ' + pass.length + '\n  ' + pass.join('\n  '));
  console.log('\nFAIL ' + fail.length + (fail.length ? '\n  ' + fail.join('\n  ') : ''));
  await b.close(); srv.kill();
  process.exit(fail.length ? 1 : 0);
})();
