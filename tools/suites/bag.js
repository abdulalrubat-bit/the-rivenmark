/* Run through tools/run-suites.js, or alone with node. Which page it drives --
 * the core, the game or the forge -- is in ./_pages.js. */
const { chromium } = require('playwright');
const pages = require('./_pages.js');

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const pass=[],fail=[]; const ck=(n,ok,note)=>(ok?pass:fail).push((ok?'':'x ')+n+(note?'  ['+note+']':''));
(async () => {
  await pages.serve();
  const b=await chromium.launch();
  const p=await (await b.newContext({viewport:{width:430,height:900}})).newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await p.goto(pages.core()); await sleep(700);

  const seed = () => p.evaluate(()=>{
    stash=blankStash(); stash.xp=xpForLevel(30);
    for(const sl of SLOTS) stash.gear[sl.id]=rollItem(0.45, sl.id);
    for(let i=0;i<44;i++) stash.vault.push(rollItem(Math.random()));
    stash.vault.push(rollSetPiece('blade'));
    saveStash(); bagSort='power'; bagFilter='all';
  });

  /* The canvas build's bag drew each piece and each slot filter from an
   * embedded strip of pixel icons, and eight checks here held that strip to
   * its CSS. The Forge that ships names pieces and marks slots with glyphs
   * instead, so they went with the canvas build; icons for the Forge are on
   * the roadmap as polish. */

  // ---- sorting ------------------------------------------------------------
  const sorted = await p.evaluate(()=>{
    stash=blankStash();
    for(let i=0;i<40;i++) stash.vault.push(rollItem(Math.random()));
    const C = { gear: stash.gear, bag: stash.vault, cap: 60 };
    const out = {};
    for (const s of BAG_SORTS) {
      bagSort = s.id;
      sortBag(C);
      out[s.id] = C.bag.slice(0, 40).map(it=>({
        p: Math.round(itemPower(it)), s: SLOT_INDEX[it.slot],
        r: RARITY_INDEX[it.rarity], u: it.uid }));
    }
    return { out, n: C.bag.length, modes: BAG_SORTS.map(s=>s.id) };
  });
  const mono = (a, k, dir) => a.every((o,i)=> i===0 || (dir>0 ? o[k]>=a[i-1][k] : o[k]<=a[i-1][k]));
  ck('there is more than one way to order it', sorted.modes.length>=4,
     sorted.modes.join(', '));
  ck('by power, strongest first', mono(sorted.out.power,'p',-1));
  ck('by slot, grouped', mono(sorted.out.slot,'s',1));
  ck('by rarity, best first', mono(sorted.out.rarity,'r',-1));
  ck('by found, newest first', mono(sorted.out.found,'u',-1));
  ck('and sorting never loses or invents one',
     Object.values(sorted.out).every(a=>a.length===sorted.n),
     sorted.n+' items in every order');

  // ---- upgrades -----------------------------------------------------------
  const up = await p.evaluate(()=>{
    stash=blankStash();
    for(const sl of SLOTS) stash.gear[sl.id]=rollItem(0.5, sl.id);
    const g = stash.gear;
    const strong = rollItem(1, 'mail'), weak = { ...rollItem(0, 'mail') };
    // force the comparison rather than trusting a roll
    g.mail = { uid:9001, slot:'mail', base:'x', rarity:'wrought', set:null,
               name:'x', affixes:[{id:'life', v:40}] };
    const better = { uid:9002, slot:'mail', base:'x', rarity:'wrought', set:null,
                     name:'x', affixes:[{id:'life', v:120}] };
    const worse  = { uid:9003, slot:'mail', base:'x', rarity:'worn', set:null,
                     name:'x', affixes:[{id:'life', v:5}] };
    // rings compare against the weaker of the pair, since that is what goes
    g.ring1 = { uid:9004, slot:'ring1', base:'x', rarity:'riven', set:null,
                name:'x', affixes:[{id:'life', v:200}] };
    g.ring2 = { uid:9005, slot:'ring2', base:'x', rarity:'worn', set:null,
                name:'x', affixes:[{id:'life', v:4}] };
    const midRing = { uid:9006, slot:'ring1', base:'x', rarity:'wrought', set:null,
                      name:'x', affixes:[{id:'life', v:60}] };
    return { better: isUpgrade(better, g), worse: isUpgrade(worse, g),
             ring: isUpgrade(midRing, g), none: isUpgrade(null, g),
             empty: isUpgrade(worse, { ...g, mail: null }) };
  });
  ck('a stronger piece is marked an upgrade', up.better);
  ck('a weaker one is not', !up.worse);
  ck('a ring is judged against the weaker of the pair', up.ring);
  ck('and anything beats an empty slot', up.empty);
  ck('nothing is not an upgrade', !up.none);

  // ---- the screen ---------------------------------------------------------
  // The Forge that ships: an order chip, All, Upgrades, a chip a slot.
  const g=await (await b.newContext({viewport:{width:430,height:900}})).newPage();
  g.on('pageerror',e=>errs.push(e.message));
  g.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await g.goto(pages.game('norun'));
  await g.waitForFunction(()=>typeof blankStash==='function', null, {timeout:30000});
  await g.evaluate(()=>{ localStorage.clear();
    stash=blankStash(); stash.xp=xpForLevel(30);
    for(const sl of SLOTS) stash.gear[sl.id]=rollItem(0.45, sl.id);
    for(let i=0;i<44;i++) stash.vault.push(rollItem(Math.random()));
    stash.vault.push(rollSetPiece('blade')); itemSeq=500; saveStash(); });
  await g.goto(pages.game());
  await g.waitForSelector('#screens.up #descend', {timeout:30000});
  await g.click('#screens [data-tab="gear"]'); await sleep(300);
  const bar = await g.evaluate(()=>({
    sort: document.querySelectorAll('#vaultBar [data-sort]').length,
    filters: [...document.querySelectorAll('#vaultBar [data-filter]')].map(c=>c.dataset.filter),
    marked: [...document.querySelectorAll('#vaultBar [data-filter]')]
      .filter(c=>SLOT_BY_ID[c.dataset.filter])
      .every(c=>c.textContent.trim().startsWith(SLOT_BY_ID[c.dataset.filter].mark)),
    rows: document.querySelectorAll('#vaultRows [data-on]').length,
    ups: document.querySelectorAll('#vaultRows [data-on].up').length }));
  ck('the vault has an order control and a filter for every slot',
     bar.sort===1 && bar.filters.length === 2 + 7, bar.filters.join(' '));
  ck('and each slot filter carries the slot’s mark', bar.marked);
  ck('and marks which pieces beat what is worn', bar.ups>0,
     bar.ups+' of '+bar.rows+' marked');

  // cycling the order control
  const label = () => g.$eval('#vaultBar [data-sort]', e=>e.textContent.trim());
  const first = await label();
  await g.click('#vaultBar [data-sort]'); await sleep(200);
  const second = await label();
  ck('tapping the order control changes the order', first!==second, first+' -> '+second);

  // filtering to one slot
  await g.click('#vaultBar [data-filter="blade"]'); await sleep(200);
  const filt = await g.evaluate(()=>({ filter: bagFilter,
    shown: [...document.querySelectorAll('#vaultRows [data-on]')]
             .map(r=>stash.vault[+r.dataset.on].slot) }));
  ck('a slot chip shows only that slot',
     filt.filter==='blade' && filt.shown.length>0 && filt.shown.every(s=>s==='blade'),
     filt.shown.length+' blades');
  await g.click('#vaultBar [data-filter="blade"]'); await sleep(200);
  ck('and tapping it again clears the filter', await g.evaluate(()=>bagFilter)==='all');

  // ---- equipping equips the piece you tapped, whatever the order ----------
  // The canvas bag had a selection that had to follow its item through a
  // re-sort; the Forge wears a piece on the tap, so the promise is that the
  // row tapped after a re-sort is the piece that ends up worn.
  await g.click('#vaultBar [data-sort]'); await sleep(200);
  const want = await g.evaluate(()=>{
    const r=[...document.querySelectorAll('#vaultRows [data-on]')]
      .find(r=>stash.vault[+r.dataset.on].slot==='boots');
    return r ? +r.dataset.uid : null; });
  await g.click('#vaultRows [data-uid="'+want+'"]'); await sleep(200);
  const eq = await g.evaluate(w=>({ worn: stash.gear.boots && stash.gear.boots.uid,
    stillInVault: stash.vault.some(x=>x.uid===w) }), want);
  ck('equipping wears the piece that was tapped, not whatever is in its place',
     want!==null && eq.worn===want, 'wore '+eq.worn+', tapped '+want);
  ck('and it leaves the vault when it does', !eq.stillInVault);
  await g.close();

  /* --- THE FOUNTAIN -------------------------------------------------------
   * A coffer used to hand you a number and drop one thing ten units away,
   * which reads as a transaction. What should come out of it is a spill:
   * everything on a ring, evenly spaced with a jitter, thrown far enough that
   * gathering it is a beat of its own.
   *
   * And SLAG, not only coin. Coin is banked the instant the lid comes up and
   * is therefore not a reason to walk anywhere; slag has to be picked up off
   * the floor, which is what makes a coffer somewhere you go rather than
   * something you touch.
   */
  const spill = await p.evaluate(() => {
    stash = blankStash(); saveStash();
    startRun('isaac', LEVELS[20].id, 'riven');
    // The hero well away, or the magnet gathers the spill before it is seen.
    player.x = 100; player.y = 100;
    const open = kind => {
      loot.length = 0; drops.length = 0;
      const before = run.coins;
      openChest({ x: 1000, y: 1000, kind, open: false, t: 0 });
      const all = [...loot, ...drops];
      const ang = all.map(o => Math.atan2(o.vy, o.vx)).sort((a, b) => a - b);
      const gaps = ang.map((a, i) => i ? a - ang[i - 1]
                                      : a - ang[ang.length - 1] + Math.PI * 2);
      return { pieces: all.length, slag: loot.length, gear: drops.length,
               worth: loot.reduce((a, l) => a + l.value, 0),
               coin: run.coins - before,
               slow: Math.min(...all.map(o => Math.hypot(o.vx, o.vy))) | 0,
               fast: Math.max(...all.map(o => Math.hypot(o.vx, o.vy))) | 0,
               widestGap: +Math.max(...gaps).toFixed(2),
               // Every piece must start ON the chest and leave it, not be
               // scattered into position -- a heap that appears is not a spill.
               startedNear: all.every(o => Math.hypot(o.x - 1000, o.y - 1000) < 12) };
    };
    const c = open('coffer'), w = open('warded');
    // Where they end up once the world has had a moment.
    const rest = () => { for (let i = 0; i < 45; i++) updateLoot(1 / 60);
      return loot.length ? Math.round(Math.max(...loot.map(
        l => Math.hypot(l.x - 1000, l.y - 1000)))) : -1; };
    open('warded'); const spread = rest();
    // A body still throws its slag the same way, at a shorter distance.
    loot.length = 0;
    const e = newBody('thrall', 1000, 1000, 0);
    dropLoot(e);
    const one = loot[0];
    return { coffer: c, warded: w, spread,
             bodySpeed: Math.round(Math.hypot(one.vx, one.vy)),
             bodyLumps: loot.length };
  });

  ck('a coffer spills slag as well as coin',
     spill.coffer.slag >= 4 && spill.coffer.worth > 0 && spill.coffer.coin > 0,
     spill.coffer.slag + ' lumps worth ' + spill.coffer.worth +
     ' slag, beside ' + spill.coffer.coin + ' coin');
  ck('and a warded one spills more of it',
     spill.warded.slag > spill.coffer.slag && spill.warded.gear === 1,
     spill.warded.slag + ' lumps and ' + spill.warded.gear + ' piece of gear');
  ck('everything leaves the chest rather than appearing beside it',
     spill.coffer.startedNear && spill.warded.startedNear);
  ck('thrown hard enough to be a fountain',
     spill.coffer.slow > 120 && spill.warded.slow > 120,
     spill.coffer.slow + '-' + spill.coffer.fast + ' units a second');
  // Evenly spaced, not randomly angled: eight random angles cluster, and a
  // cluster is the heap the spill exists to stop being.
  ck('and spread round the chest rather than clustered',
     spill.warded.widestGap < 2.2,
     'widest gap ' + spill.warded.widestGap + ' radians across ' +
     spill.warded.pieces + ' pieces');
  ck('it comes to rest at a distance worth walking',
     spill.spread > 30, spill.spread + ' units out');
  ck('a body throws its own slag the same way, shorter',
     spill.bodyLumps === 1 && spill.bodySpeed > 40 &&
     spill.bodySpeed < spill.coffer.slow,
     spill.bodySpeed + ' against a coffer’s ' + spill.coffer.slow);

  ck('no console errors', errs.length===0, errs.slice(0,3).join(' | '));
  console.log('\nPASS '+pass.length+'\n  '+pass.join('\n  '));
  console.log('\nFAIL '+fail.length+(fail.length?'\n  '+fail.join('\n  '):''));
  await b.close(); pages.stop(); process.exit(fail.length?1:0);
})();
