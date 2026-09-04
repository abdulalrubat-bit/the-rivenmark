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
const pass=[],fail=[]; const ck=(n,ok,note)=>(ok?pass:fail).push(n+(note?'  ['+note+']':''));
(async()=>{
  const b=await chromium.launch();
  const p=await (await b.newContext({viewport:{width:430,height:900}})).newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await p.goto(PAGE('index.html')); await sleep(600);

  // ---- synergy ------------------------------------------------------------
  const syn = await p.evaluate(()=>{
    const o={};
    o.tagged = AFFIXES.filter(a=>a.hero).length;
    // a hero-tagged affix must be worth more to its own hero
    const mk = id => ({ uid:9001, slot:'blade', base:'x', rarity:'worn',
                        set:null, affixes:[{id, v:AFFIX_BY_ID[id].hi}], name:'x' });
    stash=blankStash();
    resetRun('zayd'); for(const sl of SLOTS) player.gear[sl.id]=null;
    player.gear.blade = mk('zaydReach'); recomputeStats();
    const zaydOwn = player.range;
    resetRun('isaac'); for(const sl of SLOTS) player.gear[sl.id]=null;
    player.gear.blade = mk('zaydReach'); recomputeStats();
    const isaacBase = HEROES.isaac.range, zaydBase = HEROES.zayd.range;
    o.zaydGain = zaydOwn/zaydBase;
    o.isaacGain = player.range/isaacBase;
    // and the affix pool must only offer a slot's legal affixes.
    // A BRAND is legal for its own slot and is deliberately not in
    // SLOT_AFFIXES -- that pool is what a temper rerolls from, and a brand
    // must never be rerolled into existence -- so it is excused by its own
    // rule rather than by loosening this one.
    let bad=0, brands=0;
    for(let i=0;i<2500;i++){ const it=rollItem(Math.random());
      for(const a of it.affixes){
        const def = AFFIX_BY_ID[a.id];
        if(def && def.brand){ brands++; if(def.slot!==it.slot) bad++; continue; }
        if(SLOT_AFFIXES[it.slot].indexOf(a.id)<0) bad++;
      } }
    o.pool = bad; o.brands = brands;
    // text mentions the hero it favours
    o.text = affixText({id:'zaydReach', v:0.2}, 'zayd');
    return o;
  });
  ck('synergy affixes exist', syn.tagged===4, syn.tagged+' hero-tagged affixes');
  // Compare what the affix contributes, not the final multiplier: a 1.5x bonus
  // on a +24% affix is 1.36 vs 1.24 overall, which looks like 10% unless you
  // measure the part the affix is actually responsible for.
  const contrib = (syn.zaydGain - 1) / (syn.isaacGain - 1);
  ck('a synergy affix pays half again to its own hero',
     Math.abs(contrib - 1.5) < 0.02,
     'contribution x' + contrib.toFixed(3) + '  (zayd x' + syn.zaydGain.toFixed(3) +
     ' vs isaac x' + syn.isaacGain.toFixed(3) + ')');
  ck('affixes stay inside their slot pools, brands included', syn.pool===0,
     syn.pool+' violations across 2500 rolls, '+syn.brands+' of them branded');
  // The control: if no brand ever rolled, the line above proved nothing about
  // brands and would keep passing after they broke.
  ck('and brands did roll, so that meant something', syn.brands > 0,
     syn.brands+' branded pieces in 2500 rolls');
  ck('the tooltip names the hero it favours', /Zayd/.test(syn.text), syn.text);

  // ---- vacuum loot --------------------------------------------------------
  const vac = await p.evaluate(()=>{
    resetRun('isaac');
    drops.length=0;
    const d={x:player.x+player.magnet*1.2, y:player.y, vx:0,vy:0,
             item:rollItem(0.5), r:9, life:0, pulled:false};
    drops.push(d);
    for(let i=0;i<180;i++) updateDrops(1/60);
    return { picked: player.bag.length>0, reach: player.magnet*1.6 };
  });
  ck('gear vacuums in without a walk-over', vac.picked,
     'reach '+Math.round(vac.reach)+' units');

  // ---- the bag is read-only mid-delve ------------------------------------
  await p.evaluate(()=>{ stash=blankStash(); saveStash();
    resetRun('isaac'); state='play'; showScreen(null);
    player.bag=[rollItem(0.9,'blade')]; syncBagBadge(); });
  await p.click('#bagBtn'); await sleep(250);
  await p.click('#bagGrid .cellbtn'); await sleep(150);
  ck('the delve bag offers no equip button',
     (await p.$$('#gearDetail #gaEquip')).length===0);
  ck('and says where sorting happens',
     /gate-house/i.test(await p.$eval('#gearDetail',e=>e.innerText)));
  await p.click('#gearClose'); await sleep(200);

  // ---- loadouts -----------------------------------------------------------
  const lo = await p.evaluate(()=>{
    stash=blankStash();
    for(const sl of SLOTS) stash.gear[sl.id]=rollItem(0.8, sl.id);
    stash.hero='zayd';
    const o={};
    const L=saveLoadout('Frost');
    o.saved = stash.loadouts.length===1 && L.name==='Frost';
    o.captured = SLOTS.filter(sl=>L.slots[sl.id]!=null).length;
    // strip the kit, then put it back from the preset
    for(const sl of SLOTS){ if(stash.gear[sl.id]) stash.vault.push(stash.gear[sl.id]);
                            stash.gear[sl.id]=null; }
    const r=applyLoadout(stash.loadouts[0]);
    o.restored = r.set; o.missing = r.missing;
    o.heroBack = stash.hero==='zayd';
    // a preset that names a piece which no longer exists degrades, not crashes
    for(const sl of SLOTS){ stash.gear[sl.id]=null; }
    stash.vault.length=0;
    const r2=applyLoadout(stash.loadouts[0]);
    o.degraded = r2.set===0 && r2.missing>0;
    // and swapping never loses what was worn
    stash.vault.length=0;
    for(const sl of SLOTS) stash.gear[sl.id]=rollItem(0.5, sl.id);
    const before = SLOTS.filter(sl=>stash.gear[sl.id]).length;
    applyLoadout(stash.loadouts[0]);
    o.noLoss = (SLOTS.filter(sl=>stash.gear[sl.id]).length + stash.vault.length) >= before;
    o.cap = (()=>{ for(let i=0;i<10;i++) saveLoadout('x'+i);
                   return stash.loadouts.length; })();
    return o;
  });
  ck('a loadout saves the worn kit', lo.saved && lo.captured===8, lo.captured+'/8 captured');
  ck('applying a loadout restores it', lo.restored===8 && lo.missing===0,
     lo.restored+' restored, '+lo.missing+' missing');
  ck('the hero comes back with it', lo.heroBack);
  ck('a stale preset degrades rather than conjuring items',
     lo.degraded, 'set 0, missing >0');
  ck('swapping never loses what was worn', lo.noLoss);
  ck('presets are capped', lo.cap===4, lo.cap+' kept');

  // ---- the strip in the hub ----------------------------------------------
  await p.evaluate(()=>{ stash=blankStash();
    for(const sl of SLOTS) stash.gear[sl.id]=rollItem(0.7, sl.id);
    saveStash(); state='menu'; refreshKitLine(); showScreen('splash'); });
  await sleep(150);
  await enterHub(p); await p.click('#toKit'); await sleep(250);
  ck('the hub offers to save a preset',
     (await p.$$('#loadouts [data-save]')).length===1);
  await p.click('#loadouts [data-save]'); await sleep(200);
  ck('saving adds a preset button', (await p.$$('#loadouts [data-load]')).length===1);
  await p.click('#loadouts [data-load]'); await sleep(200);
  ck('applying reports what it did',
     /equipped/.test(await p.$eval('#lnote',e=>e.innerText)),
     await p.$eval('#lnote',e=>e.innerText));
  await p.reload(); await sleep(600);
  ck('presets persist', await p.evaluate(()=>stash.loadouts.length)===1);

  ck('no console errors', errs.length===0, errs.slice(0,3).join(' | '));
  console.log('\nPASS '+pass.length+'\n  '+pass.join('\n  '));
  console.log('\nFAIL '+fail.length+(fail.length?'\n  '+fail.join('\n  '):''));
  await b.close(); process.exit(fail.length?1:0);
})();
