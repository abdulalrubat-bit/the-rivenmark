/* Moved out of a scratch directory and into the repo.
 *
 * These suites were the entire safety net for a 14,000-line single file, and
 * they lived only in /tmp -- one container restart from gone, and certain to
 * go when the session that made them ended. The page they drive is found
 * relative to this file now instead of by an absolute path, so they run from
 * any clone, on a desktop or under Termux.
 */
const { chromium } = require('playwright');
// RIVENMARK_PAGE points the suite at a different page without touching its
// source. verify-core uses it to run the SAME file against index.html and
// against the extracted core; it used to rewrite the URL with a string
// replace, which silently stopped matching the moment this line changed.
const PAGE = f => process.env.RIVENMARK_PAGE ||
  ('file://' + require('path').join(__dirname, '..', '..', f));
// The gate-house is behind the splash now: the stations live on a tab bar and
// the bar does not exist until you have entered. Idempotent, so it is safe to
// call before every station click however the test got there.
async function enterHub(pg){
  const onSplash = await pg.$eval('#splash', e=>e.classList.contains('on')).catch(()=>false);
  if (!onSplash) return;
  await pg.click('#toGatehouse');
  await new Promise(r=>setTimeout(r,220));
}

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const pass=[],fail=[]; const ck=(n,ok,note)=>(ok?pass:fail).push((ok?'':'x ')+n+(note?'  ['+note+']':''));
(async()=>{
  const b=await chromium.launch();
  const p=await (await b.newContext({viewport:{width:430,height:900}})).newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await p.goto(PAGE('index.html')); await sleep(700);

  const seed = () => p.evaluate(()=>{
    stash=blankStash(); stash.xp=xpForLevel(30);
    for(const sl of SLOTS) stash.gear[sl.id]=rollItem(0.45, sl.id);
    for(let i=0;i<44;i++) stash.vault.push(rollItem(Math.random()));
    stash.vault.push(rollSetPiece('blade'));
    saveStash(); bagSort='power'; bagFilter='all';
  });

  // ---- every slot is nameable in a grid ----------------------------------
  const marks = await p.evaluate(async ()=>{
    // Measure the strip rather than writing its length down here as well.
    // It was hardcoded at ten cells, and grew to thirty-five the moment the
    // icons went per-base -- a number kept in two places is a number that
    // will disagree.
    const url = getComputedStyle(document.documentElement)
                  .getPropertyValue('--icons').trim().replace(/^url\(|\)$/g,'');
    const img = new Image();
    await new Promise(r => { img.onload = img.onerror = r; img.src = url; });
    const CELL = 20;
    const cells = Math.round(img.naturalWidth / CELL);
    // and the CSS has to scale the strip by that same count or every icon is
    // one of its neighbours
    const probe = document.createElement('i');
    probe.className = 'ico'; probe.style.setProperty('--sz','20px');
    document.body.appendChild(probe);
    const bg = getComputedStyle(probe).backgroundSize;
    probe.remove();
    const bases = new Set();
    for (const k in BASES) for (const b of BASES[k]) bases.add(b);
    return {
      all: SLOTS.every(s => ICON[s.id] !== undefined),
      distinct: new Set(SLOTS.map(s=>ICON[s.id])).size,
      slots: SLOTS.length,
      cells, decoded: img.naturalWidth > 0, height: img.naturalHeight,
      sheet: url.slice(0, 30),
      inRange: Object.values(ICON).every(i => Number.isInteger(i) && i >= 0 && i < cells),
      cssWidth: bg,
      cssOk: bg.indexOf((cells*20)+'px') === 0,
      everyBase: [...bases].every(b => ICON[b] !== undefined),
      missing: [...bases].filter(b => ICON[b] === undefined).slice(0,3),
      baseKeysReal: Object.keys(ICON).filter(k =>
        k[0] === k[0].toUpperCase() && !bases.has(k)).slice(0,3)
    };
  });
  ck('the icon strip decodes', marks.decoded,
     marks.cells+' cells of 20px, '+marks.height+'px tall');
  ck('every slot has an icon', marks.all);
  ck('and only the two rings share one', marks.distinct===marks.slots-1,
     marks.distinct+' icons for '+marks.slots+' slots');
  ck('every icon is inside the strip', marks.inRange);
  ck('and the CSS scales it by the same count', marks.cssOk, marks.cssWidth);
  ck('every base name has its own icon', marks.everyBase,
     marks.missing.length ? 'missing '+marks.missing.join(', ') : '');
  ck('and no icon names a base that does not exist', marks.baseKeysReal.length===0,
     marks.baseKeysReal.join(', '));
  ck('and the strip travels with the page -- no external file',
     /^"?data:image\/png;base64,/.test(marks.sheet), marks.sheet.slice(0,26)+'...');

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
  await seed();
  await p.evaluate(()=>{ state='menu'; showScreen('splash'); });
  await sleep(120);
  await enterHub(p); await p.click('#toKit'); await sleep(350);
  const bar = await p.evaluate(()=>({
    chips: [...document.querySelectorAll('#bagBar .chip')].map(
             c => c.textContent.trim() || (c.querySelector('.ico') ? 'ico' : '?')),
    chipIcons: document.querySelectorAll('#bagBar .chip .ico').length,
    cells: document.querySelectorAll('#bagGrid .cellbtn').length,
    ups: document.querySelectorAll('#bagGrid .cup').length,
    icons: document.querySelectorAll('#bagGrid .cellbtn .ico').length,
    // the old rarity diamond outspecified .ico and squashed every icon to
    // eleven pixels; assert the box the icon actually gets
    box: (()=>{ const i=document.querySelector('#bagGrid .cellbtn .ico');
                const c=getComputedStyle(i); return c.width+' x '+c.height; })() }));
  ck('the bag has an order control and a filter for every slot',
     bar.chips.length === 2 + 1 + 7, bar.chips.join(' '));
  ck('and the slot filters are drawn as icons, not letters',
     bar.chipIcons === 7, bar.chipIcons + ' icon chips');
  ck('and marks which cells beat what is worn', bar.ups>0,
     bar.ups+' of '+bar.cells+' marked');
  ck('every filled cell draws its item icon', bar.icons>0,
     bar.icons+' icons');
  ck('at the size it asked for', bar.box === '28px x 28px', bar.box);

  // cycling the order control
  const first = await p.evaluate(()=>document.querySelector('#bagBar .chip').textContent);
  await p.click('#bagBar .chip:nth-child(1)'); await sleep(200);
  const second = await p.evaluate(()=>document.querySelector('#bagBar .chip').textContent);
  ck('tapping the order control changes the order', first!==second,
     first.trim()+' -> '+second.trim());

  // filtering to one slot
  await p.click('#bagBar .chip:nth-child(4)'); await sleep(200);
  const filt = await p.evaluate(()=>{
    const C = { gear: stash.gear, bag: stash.vault };
    return { filter: bagFilter,
             cells: document.querySelectorAll('#bagGrid .cellbtn').length,
             allBlades: bagShown(C).every(o=>o.it.slot==='blade') };
  });
  ck('a slot chip shows only that slot', filt.filter==='blade' && filt.allBlades,
     filt.cells+' blades');
  await p.click('#bagBar .chip:nth-child(4)'); await sleep(200);
  ck('and tapping it again clears the filter',
     await p.evaluate(()=>bagFilter)==='all');

  // ---- the selection survives a re-sort ----------------------------------
  const keep = await p.evaluate(()=>{
    bagFilter='all'; bagSort='found'; renderGear();
    const C = gearCtx;
    // pick something that is definitely not first under the other orders
    const idx = 7;
    const uid = C.bag[idx].uid;
    gearSel = { from:'bag', index: idx, uid };
    bagSort = 'power'; renderGear();
    const at = C.bag.findIndex(x=>x.uid===uid);
    return { uid, held: gearSel && gearSel.uid, index: gearSel && gearSel.index,
             at, item: selectedItem() && selectedItem().uid };
  });
  ck('a selection follows its item through a re-sort',
     keep.held===keep.uid && keep.index===keep.at && keep.item===keep.uid,
     'uid '+keep.uid+' now at '+keep.at);

  const gone = await p.evaluate(()=>{
    const C = gearCtx;
    gearSel = { from:'bag', index: 0, uid: -12345 };   // never existed
    renderGear();
    return gearSel;
  });
  ck('and an item that is no longer there clears the selection', gone===null);

  // ---- equipping still equips the thing you tapped -----------------------
  const eq = await p.evaluate(()=>{
    stash=blankStash();
    for(const sl of SLOTS) stash.gear[sl.id]=rollItem(0.3, sl.id);
    for(let i=0;i<25;i++) stash.vault.push(rollItem(Math.random()));
    saveStash();
    openGear('stash');
    bagSort='power'; bagFilter='all'; renderGear();
    const C = gearCtx;
    const target = C.bag.find(it=>it.slot==='boots') || C.bag[0];
    gearSel = { from:'bag', index: C.bag.indexOf(target), uid: target.uid };
    renderGear();                       // re-sorts under the selection
    equipSelected();
    return { worn: stash.gear[target.slot] && stash.gear[target.slot].uid,
             wanted: target.uid,
             stillInBag: stash.vault.some(x=>x.uid===target.uid) };
  });
  ck('equipping equips the item that was selected, not the cell',
     eq.worn===eq.wanted, 'wore '+eq.worn+', wanted '+eq.wanted);
  ck('and it leaves the vault when it does', !eq.stillInBag);

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
  await b.close(); process.exit(fail.length?1:0);
})();
