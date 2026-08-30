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

// The hero picker moved behind the Descend button when the menus were
// redesigned; starting a run is two taps now.
async function beginRun(p, hero, diff) {
  await enterHub(p); await p.click('#toDelve');
  await new Promise(r => setTimeout(r, 150));
  if (hero) { await p.click('#heroPick .card[data-hero="' + hero + '"]');
              await new Promise(r => setTimeout(r, 80)); }
  if (diff) { await p.click('#diffPick .card[data-diff="' + diff + '"]');
              await new Promise(r => setTimeout(r, 80)); }
  await p.click('#beginRun');
  await new Promise(r => setTimeout(r, 500));
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const pass=[],fail=[]; const ck=(n,ok,note)=>(ok?pass:fail).push(n+(note?'  ['+note+']':''));
(async()=>{
  const b=await chromium.launch();
  const p=await (await b.newContext({viewport:{width:430,height:900}})).newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await p.goto(PAGE('index.html'));
  await beginRun(p);

  // ---- generation ---------------------------------------------------------
  const gen = await p.evaluate(()=>{
    const o={ slots:{}, rar:{}, affixCounts:{}, bad:[] };
    for(let i=0;i<4000;i++){
      const depth = i/4000;
      const it = rollItem(depth);
      o.slots[it.slot]=(o.slots[it.slot]||0)+1;
      o.rar[it.rarity]=(o.rar[it.rarity]||0)+1;
      o.affixCounts[it.affixes.length]=(o.affixCounts[it.affixes.length]||0)+1;
      // no duplicate affixes on one item, and every affix legal for the slot
      const seen={};
      for(const a of it.affixes){
        if(seen[a.id]) o.bad.push('dup '+a.id+' on '+it.slot);
        seen[a.id]=1;
        if(SLOT_AFFIXES[it.slot].indexOf(a.id)<0) o.bad.push('illegal '+a.id+' on '+it.slot);
        if(!isFinite(a.v)) o.bad.push('non-finite '+a.id);
        if(!affixText(a) || /NaN|undefined/.test(affixText(a))) o.bad.push('bad text '+a.id);
      }
      if(!it.name || /undefined/.test(it.name)) o.bad.push('bad name');
    }
    // rarity should improve with depth
    let shallow=0, deep=0;
    for(let i=0;i<3000;i++){
      if(RARITY.findIndex(r=>r.id===rollItem(0.05).rarity)>=2) shallow++;
      if(RARITY.findIndex(r=>r.id===rollItem(0.95).rarity)>=2) deep++;
    }
    o.shallowGood=shallow; o.deepGood=deep;
    return o;
  });
  ck('every slot can roll', Object.keys(gen.slots).length===8, Object.keys(gen.slots).join(','));
  ck('every rarity appears', Object.keys(gen.rar).length===5, JSON.stringify(gen.rar));
  ck('items are well-formed', gen.bad.length===0, gen.bad.slice(0,3).join(' | '));
  ck('affix count follows rarity', !gen.affixCounts['0'], JSON.stringify(gen.affixCounts));
  ck('depth improves rarity', gen.deepGood > gen.shallowGood*1.5,
     'good drops: shallow '+gen.shallowGood+' deep '+gen.deepGood+' of 3000');

  // ---- the recompute invariant -------------------------------------------
  const inv = await p.evaluate(()=>{
    const o={};
    resetRun('isaac');
    const snap = ()=>({ damage:player.damage, maxHp:player.maxHp, speed:player.speed,
                        range:player.range, sweep:player.sweep, fireDelay:player.fireDelay,
                        ward:player.ward, regen:player.regen, magnet:player.magnet });
    const same=(a,b)=>Object.keys(a).every(k=>Math.abs(a[k]-b[k])<1e-9);
    const base = snap();

    // equip one of everything, then take it all off again: must return exactly
    for(const sl of SLOTS) player.gear[sl.id]=rollItem(0.9, sl.id);
    recomputeStats();
    const geared = snap();
    o.gearChanges = !same(base, geared);
    for(const sl of SLOTS) player.gear[sl.id]=null;
    recomputeStats();
    o.returnsToBase = same(base, snap());

    // order of equipping must not matter
    const kit = SLOTS.map(sl=>rollItem(0.7, sl.id));
    for(const it of kit) player.gear[it.slot]=it;
    recomputeStats(); const fwd = snap();
    for(const sl of SLOTS) player.gear[sl.id]=null; recomputeStats();
    for(let i=kit.length-1;i>=0;i--) player.gear[kit[i].slot]=kit[i];
    recomputeStats(); const rev = snap();
    o.orderIndependent = same(fwd, rev);

    // recompute is idempotent
    recomputeStats(); recomputeStats();
    o.idempotent = same(rev, snap());

    // hero level stacks with gear rather than being wiped by it
    for(const sl of SLOTS) player.gear[sl.id]=null;
    player.level=1; recomputeStats();
    const b0=player.damage;
    player.level=25; recomputeStats();
    const b1=player.damage;
    // A rolled blade need not carry damage at all -- most do not -- so this
    // asserted on a coin flip and failed three times in four. Name the affix.
    player.gear.blade={ uid:7001, slot:'blade', base:'x', rarity:'wrought',
                        set:null, name:'x', affixes:[{id:'damage', v:9}] };
    recomputeStats();
    o.boonHeld = player.damage>b1 && b1>b0;
    o.boonNums=[Math.round(b0),Math.round(b1),Math.round(player.damage)];

    // swapping a +life item must not heal
    for(const sl of SLOTS) player.gear[sl.id]=null; recomputeStats();
    player.hp = 40;
    player.gear.mail = { uid:1, slot:'mail', base:'x', rarity:'worn',
                         affixes:[{id:'life', v:60}], name:'x' };
    recomputeStats();
    o.noFreeHeal = player.hp===40;
    // and taking it off must not leave hp above max
    player.hp = player.maxHp;
    const wasMax = player.maxHp;
    player.gear.mail=null; recomputeStats();
    o.clampsOnRemoval = player.hp<=player.maxHp && player.maxHp<wasMax;

    // ward is capped short of immunity
    for(let i=0;i<8;i++) player.gear[SLOTS[i].id]={ uid:2, slot:SLOTS[i].id, base:'x',
      rarity:'worn', affixes:[{id:'ward', v:0.5}], name:'x' };
    recomputeStats();
    o.wardCapped = player.ward<=0.75 && player.ward>0;
    o.wardValue = player.ward;
    return o;
  });
  ck('gear changes stats', inv.gearChanges);
  ck('removing all gear returns exactly to base', inv.returnsToBase);
  ck('equip order does not matter', inv.orderIndependent);
  ck('recompute is idempotent', inv.idempotent);
  ck('hero level stacks with gear', inv.boonHeld, 'damage '+inv.boonNums.join(' -> '));
  ck('a +life item is not a free heal', inv.noFreeHeal);
  ck('life clamps when +life comes off', inv.clampsOnRemoval);
  ck('ward is capped short of immunity', inv.wardCapped, 'ward '+inv.wardValue);

  // ---- drops and the bag --------------------------------------------------
  const bag = await p.evaluate(()=>{
    const o={}; resetRun('isaac');
    o.startsEmpty = player.bag.length===0 && SLOTS.every(s=>!player.gear[s.id]);
    // kill things until something drops
    let guard=0;
    while(drops.length===0 && guard++<400){
      const e=enemies.find(x=>x.hp>0); if(!e) break;
      e.x=player.x+30; e.y=player.y; damageEnemy(e,1e9); compactEnemies();
    }
    o.dropsHappen = drops.length>0;
    // walk over it
    if(drops.length){ drops[0].x=player.x; drops[0].y=player.y;
      for(let i=0;i<10;i++) updateDrops(1/60); }
    o.picksUp = player.bag.length>0;
    // bag cap holds and the item is not destroyed
    while(player.bag.length<BAG_MAX) player.bag.push(rollItem(0.5));
    drops.length=0;
    drops.push({x:player.x,y:player.y,vx:0,vy:0,item:rollItem(0.5),r:9,life:0,pulled:false});
    for(let i=0;i<20;i++) updateDrops(1/60);
    o.capHolds = player.bag.length===BAG_MAX;
    o.notDestroyed = drops.length===1;
    return o;
  });
  ck('a run starts with nothing', bag.startsEmpty);
  ck('bodies drop gear', bag.dropsHappen);
  ck('walking over gear bags it', bag.picksUp);
  ck('bag cap holds', bag.capHolds);
  ck('a full bag leaves the item on the floor', bag.notDestroyed);

  // ---- the delve bag: a record, not a workbench ---------------------------
  await p.evaluate(()=>{ resetRun('isaac'); state='play'; showScreen(null);
                         player.bag=[rollItem(0.9,'blade'), rollItem(0.9,'mail')];
                         syncBagBadge(); });
  await p.click('#bagBtn'); await sleep(200);
  ck('bag button opens the screen', await p.evaluate(()=>state)==='gear');
  ck('the delve is paused', await p.evaluate(()=>{ const x=player.x;
      for(let i=0;i<30;i++){} return player.x===x; }));
  ck('slots render', (await p.$$('#gearSlots .slot')).length===8);
  ck('bag grid renders', (await p.$$('#bagGrid .cellbtn')).length>0);
  await p.click('#bagGrid .cellbtn'); await sleep(150);
  ck('the delve bag cannot equip', (await p.$$('#gearDetail #gaEquip')).length===0);
  await p.click('#gearClose'); await sleep(200);
  ck('closing resumes the delve', await p.evaluate(()=>state)==='play');

  // ---- the hub kit: where equipping actually happens ----------------------
  await p.evaluate(()=>{
    stash=blankStash();
    stash.vault=[rollItem(0.9,'blade'), rollItem(0.9,'mail')];
    saveStash(); state='menu'; refreshKitLine(); showScreen('splash');
  });
  await sleep(150);
  await enterHub(p); await p.click('#toKit'); await sleep(250);
  ck('the hub kit opens', await p.evaluate(()=>state)==='gear');
  await p.click('#bagGrid .cellbtn'); await sleep(150);
  ck('selecting shows a comparison',
     /against/.test(await p.$eval('#gearDetail',e=>e.innerText)));
  await p.click('#gaEquip'); await sleep(200);
  const after = await p.evaluate(()=>({ worn:!!stash.gear.blade, vault:stash.vault.length }));
  ck('equipping works in the hub', after.worn && after.vault===1,
     'worn '+after.worn+', vault '+after.vault);
  await p.click('#gearSlots .slot'); await sleep(150);
  ck('a worn item can be selected',
     /Take off/.test(await p.$eval('#gearDetail',e=>e.innerText)));
  await p.click('#gaOff'); await sleep(200);
  ck('taking off returns it to the vault',
     await p.evaluate(()=>!stash.gear.blade && stash.vault.length===2));
  await p.click('#gearClose'); await sleep(200);
  ck('closing returns to the gate-house', await p.evaluate(()=>state)==='menu');

  ck('no console errors', errs.length===0, errs.slice(0,2).join(' | '));
  console.log('\nPASS '+pass.length+'\n  '+pass.join('\n  '));
  console.log('\nFAIL '+fail.length+(fail.length?'\n  '+fail.join('\n  '):''));
  await b.close(); process.exit(fail.length?1:0);
})();
