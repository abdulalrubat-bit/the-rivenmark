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
const pages = require('./_pages.js');

// Into a delve: see pages.descend.
async function beginRun(p, hero, diff) {
  await pages.descend(p, { hero, diff });
  await new Promise(r => setTimeout(r, 300));
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const pass=[],fail=[];
/* 'x ' on a failure: run-suites.js surfaces exactly that prefix when it
 * summarises a sweep, so without it a red suite reports its count and none
 * of its reasons — which means re-running it alone to find out why. */
const ck=(n,ok,note)=>(ok?pass:fail).push((ok?'':'x ')+n+(note?'  ['+note+']':''));
const BRANDS_TEXT_OK = B => Object.keys(B).every(k =>
  B[k].text && B[k].text.length > 20 && !/^[+-]?\d/.test(B[k].text));

(async () => {
  await pages.serve();
  const b=await chromium.launch();
  const p=await (await b.newContext({viewport:{width:430,height:900}})).newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await p.goto(pages.core());
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
        // A brand is legal for the slot it belongs to and nowhere else. It is
        // deliberately NOT in SLOT_AFFIXES -- that pool is what a temper
        // rerolls from, and a brand must not be rerolled into existence.
        const def = AFFIX_BY_ID[a.id];
        const ok = def && def.brand ? def.slot === it.slot
                                    : SLOT_AFFIXES[it.slot].indexOf(a.id) >= 0;
        if(!ok) o.bad.push('illegal '+a.id+' on '+it.slot);
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
  // Asked of the game: the HUD's bag button and the bag screen that ships.
  const g=await (await b.newContext({viewport:{width:430,height:900}})).newPage();
  g.on('pageerror',e=>errs.push(e.message));
  await g.goto(pages.game('nogate&nogov'));
  await g.waitForFunction(()=>state==='play' && document.querySelector('#hud .hold .bag'),
                          null, {timeout:30000});
  await g.evaluate(()=>{ player.bag=[rollItem(0.9,'blade'), rollItem(0.9,'mail')]; });
  await g.click('#hud .hold .bag'); await sleep(250);
  ck('bag button opens the screen', await g.evaluate(()=>state)==='gear');
  ck('the delve is paused', await g.evaluate(async ()=>{ const t=run.time;
      await new Promise(r=>setTimeout(r,300)); return run.time===t; }));
  const rows = await g.evaluate(()=>[...document.querySelectorAll('#screens .rows')]
    .map(r=>r.querySelectorAll('.row').length));
  ck('slots render', rows[1]===8, rows.join(' / '));
  ck('bag grid renders', rows[0]===2, rows[0]+' carried');
  ck('the delve bag cannot equip', (await g.$$('#screens [data-on]')).length===0);
  await g.click('#bagBack'); await sleep(200);
  ck('closing resumes the delve', await g.evaluate(()=>state)==='play');
  await g.close();

  // ---- the Forge: where equipping actually happens ------------------------
  const h=await (await b.newContext({viewport:{width:430,height:900}})).newPage();
  h.on('pageerror',e=>errs.push(e.message));
  await h.goto(pages.game('norun'));
  await h.waitForFunction(()=>typeof blankStash==='function', null, {timeout:30000});
  await h.evaluate(()=>{ localStorage.clear(); stash=blankStash(); itemSeq=100;
    stash.vault=[rollItem(0.9,'blade'), rollItem(0.9,'mail')]; saveStash(); });
  await h.goto(pages.game());
  await h.waitForSelector('#screens.up #descend', {timeout:30000});
  await h.click('#screens [data-tab="gear"]'); await sleep(250);
  ck('the Forge opens', /Forge/.test(await h.$eval('#screens h1',e=>e.textContent)));
  // Every vault piece says what it would change, without having to pick it.
  ck('each piece shows a comparison',
     (await h.$$('#screens [data-on] .cmp')).length===2);
  const bladeAt = await h.evaluate(()=>stash.vault.findIndex(it=>it.slot==='blade'));
  await h.click('#screens [data-on="'+bladeAt+'"]'); await sleep(200);
  const after = await h.evaluate(()=>({ worn:!!stash.gear.blade, vault:stash.vault.length }));
  ck('equipping works in the Forge', after.worn && after.vault===1,
     'worn '+after.worn+', vault '+after.vault);
  ck('a worn piece offers to come off',
     /take off/.test(await h.$eval('#screens [data-off="blade"]',e=>e.innerText)));
  await h.click('#screens [data-off="blade"]'); await sleep(200);
  ck('taking off returns it to the vault',
     await h.evaluate(()=>!stash.gear.blade && stash.vault.length===2));
  await h.click('#screens [data-tab="splash"]'); await sleep(200);
  ck('and the gate-house is a tap away',
     /Gate-House/.test(await h.$eval('#screens h1',e=>e.textContent)));
  await h.close();

  /* --- BRANDS: what a Riven piece DOES ------------------------------------
   * Every ordinary affix moves one number one way, so the best item is the one
   * with the biggest numbers and there is nothing to decide. A brand moves two
   * against each other and one of them changes how the blade behaves. What has
   * to hold: the trade is real in both directions, it costs an affix slot
   * rather than adding a sixth line, it cannot appear below Riven or in a slot
   * it does not belong to, and it survives being written to disk.
   */
  const brand = await p.evaluate(() => {
    const o = {};
    const bare = () => { stash = blankStash(); saveStash();
                         startRun('isaac', LEVELS[20].id, 'riven');
                         return snap(); };
    const snap = () => ({ shots: player.shots, fan: player.fan || 0,
      fireDelay: +player.fireDelay.toFixed(3), range: Math.round(player.range),
      sweep: +player.sweep.toFixed(1), speed: Math.round(player.speed),
      maxHp: Math.round(player.maxHp), magnet: Math.round(player.magnet) });
    const wear = id => {
      const br = BRANDS.find(b => b.id === id);
      stash = blankStash();
      const it = { uid: 1, slot: br.slot, base: 'Proof', rarity: 'riven',
                   affixes: [{ id, v: 1 }], name: 'Proof' };
      stash.gear[br.slot] = it; saveStash();
      startRun('isaac', LEVELS[20].id, 'riven');
      // Round-tripped through the save file, not just held in memory: a brand
      // that cannot be loaded back is a brand that vanishes overnight.
      const back = loadStash();
      return { now: snap(), text: affixText({ id, v: 1 }, 'isaac'),
               kept: !!(back.gear[br.slot] &&
                        back.gear[br.slot].affixes.some(a => a.id === id)) };
    };
    o.bare = bare();
    o.each = {};
    for (const br of BRANDS) o.each[br.id] = wear(br.id);

    // Where they roll, and where they must not.
    let riven = 0, branded = 0, belowRiven = 0, wrongSlot = 0, doubled = 0, affixN = {};
    for (let i = 0; i < 6000; i++) {
      const slot = SLOTS[(Math.random() * SLOTS.length) | 0].id;
      const it = rollItem(1, slot);
      const brs = it.affixes.filter(a => AFFIX_BY_ID[a.id] && AFFIX_BY_ID[a.id].brand);
      if (brs.length > 1) doubled++;
      if (it.rarity === 'riven' && slot === 'blade') { riven++; if (brs.length) branded++; }
      if (brs.length && it.rarity !== 'riven') belowRiven++;
      if (brs.length && brs.some(a => AFFIX_BY_ID[a.id].slot !== slot)) wrongSlot++;
      if (it.rarity === 'riven')
        (affixN[brs.length ? 'branded' : 'plain'] =
          affixN[brs.length ? 'branded' : 'plain'] || []).push(it.affixes.length);
    }
    const mean = a => a && a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2) : 0;
    o.riven = riven; o.branded = branded; o.belowRiven = belowRiven;
    o.wrongSlot = wrongSlot; o.doubled = doubled;
    o.affixesBranded = mean(affixN.branded); o.affixesPlain = mean(affixN.plain);

    // The fan, measured as a trade rather than described as one. Crescents a
    // second at ONE body against crescents a second across a crowd.
    const rate = () => {
      const swings = 1 / player.fireDelay;
      return { single: +(swings * 1).toFixed(2),      // one line, one crescent lands
               crowd:  +(swings * player.shots).toFixed(2) };
    };
    stash = blankStash(); saveStash(); startRun('isaac', LEVELS[20].id, 'riven');
    o.plainRate = rate();
    wear('fan'); o.fanRate = rate();

    // And it actually fans: three crescents at distinct angles, together.
    arcs.length = 0; player.angle = 0;
    for (let i = 0; i < player.shots; i++) {
      const a = 0 + (i === 0 ? 0 : (i % 2 ? 1 : -1) * ((player.fan || 0) > 0 ? 0.34 : 0.15) * Math.ceil(i / 2));
      releaseCrescent(a, (player.fan || 0) > 0 ? 0 : i * 0.055);
    }
    o.fanAngles = arcs.map(x => +x.a.toFixed(2));
    o.fanDelays = arcs.map(x => +x.delay.toFixed(3));
    // The control: the same loop with the fan off.
    stash = blankStash(); saveStash(); startRun('isaac', LEVELS[20].id, 'riven');
    player.shots = 3;
    arcs.length = 0;
    for (let i = 0; i < player.shots; i++) {
      const a = 0 + (i === 0 ? 0 : (i % 2 ? 1 : -1) * 0.15 * Math.ceil(i / 2));
      releaseCrescent(a, i * 0.055);
    }
    o.stackAngles = arcs.map(x => +x.a.toFixed(2));
    o.stackDelays = arcs.map(x => +x.delay.toFixed(3));
    return o;
  });

  const B = brand.each;
  ck('the Sundering blade buys width with cadence',
     B.fan.now.shots === brand.bare.shots + 2 && B.fan.now.fan > 0 &&
     B.fan.now.fireDelay > brand.bare.fireDelay,
     brand.bare.shots + ' crescent at ' + brand.bare.fireDelay + 's → ' +
     B.fan.now.shots + ' at ' + B.fan.now.fireDelay + 's');
  ck('the Reaving blade buys reach with sweep',
     B.reave.now.range > brand.bare.range * 1.8 && B.reave.now.sweep < brand.bare.sweep * 0.4,
     'reach ' + brand.bare.range + '→' + B.reave.now.range +
     ', sweep ' + brand.bare.sweep + '→' + B.reave.now.sweep);
  ck('Headlong boots buy stride with life',
     B.headlong.now.speed > brand.bare.speed * 1.3 && B.headlong.now.maxHp < brand.bare.maxHp,
     'stride ' + brand.bare.speed + '→' + B.headlong.now.speed +
     ', life ' + brand.bare.maxHp + '→' + B.headlong.now.maxHp);
  ck('a Covetous girdle buys draw with life',
     B.covet.now.magnet > brand.bare.magnet * 2.5 && B.covet.now.maxHp < brand.bare.maxHp,
     'draw ' + brand.bare.magnet + '→' + B.covet.now.magnet +
     ', life ' + brand.bare.maxHp + '→' + B.covet.now.maxHp);
  ck('each of them says its whole sentence rather than a number',
     BRANDS_TEXT_OK(B), Object.keys(B).map(k => '“' + B[k].text + '”').join(' '));
  ck('and each survives being written to disk',
     Object.keys(B).every(k => B[k].kept),
     Object.keys(B).filter(k => !B[k].kept).join(', ') || 'all four load back');

  ck('a brand only rolls on Riven', brand.belowRiven === 0,
     brand.belowRiven + ' found below Riven in 6000 rolls');
  ck('and only in the slot it belongs to', brand.wrongSlot === 0);
  ck('never two to a piece', brand.doubled === 0);
  ck('but not on every Riven — a tier, not two items',
     brand.branded > 0 && brand.branded < brand.riven,
     brand.branded + ' of ' + brand.riven + ' Riven blades');
  ck('and it costs an affix slot rather than adding a line',
     Math.abs(brand.affixesBranded - brand.affixesPlain) < 0.01,
     brand.affixesBranded + ' affixes branded against ' + brand.affixesPlain + ' plain');

  ck('the fan trades single-target throughput for crowd',
     brand.fanRate.single < brand.plainRate.single &&
     brand.fanRate.crowd > brand.plainRate.crowd,
     'one body: ' + brand.plainRate.single + '→' + brand.fanRate.single +
     ' a second; a crowd: ' + brand.plainRate.crowd + '→' + brand.fanRate.crowd);
  ck('and it really fans — wide, and all at once',
     new Set(brand.fanAngles).size === 3 &&
     Math.max(...brand.fanAngles) - Math.min(...brand.fanAngles) >
     Math.max(...brand.stackAngles) - Math.min(...brand.stackAngles) &&
     brand.fanDelays.every(d => d === 0) && brand.stackDelays.some(d => d > 0),
     'fan ' + brand.fanAngles.join('/') + ' at ' + brand.fanDelays.join('/') +
     's, stacked ' + brand.stackAngles.join('/') + ' at ' + brand.stackDelays.join('/') + 's');

  const fire = await p.evaluate(() => {
    stash = blankStash();
    stash.coins = 99999;
    const it = { uid: 1, slot: 'blade', base: 'Proof', rarity: 'riven',
                 affixes: [{ id: 'fan', v: 1 }, { id: 'damage', v: 3 },
                           { id: 'reach', v: 0.1 }, { id: 'sweep', v: 0.1 },
                           { id: 'cadence', v: -0.1 }], name: 'Proof' };
    stash.gear.blade = it; saveStash();
    startRun('isaac', LEVELS[20].id, 'riven');
    const before = it.affixes.map(a => a.id).join(',');
    const ok = vendorBuy(VENDOR.find(v => v.id === 'temper'), 'blade');
    const after = stash.gear.blade.affixes;
    return { ok, before, after: after.map(a => a.id).join(','),
             kept: after.some(a => a.id === 'fan'),
             n: after.length, rerolled: after.filter(a => a.id !== 'fan')
               .some(a => ['damage','reach','sweep','cadence'].indexOf(a.id) >= 0) };
  });
  ck('the fire took the piece', fire.ok, fire.before + ' → ' + fire.after);
  ck('and the brand survived it', fire.kept && fire.n === 5,
     fire.kept ? fire.n + ' affixes, brand intact'
               : 'THE TEMPER ATE THE BRAND — a Riven piece rerolled into an ordinary one');
  ck('while everything else about it was rerolled', fire.rerolled);

  ck('no console errors', errs.length===0, errs.slice(0,2).join(' | '));
  console.log('\nPASS '+pass.length+'\n  '+pass.join('\n  '));
  console.log('\nFAIL '+fail.length+(fail.length?'\n  '+fail.join('\n  '):''));
  await b.close(); pages.stop(); process.exit(fail.length?1:0);
})();
