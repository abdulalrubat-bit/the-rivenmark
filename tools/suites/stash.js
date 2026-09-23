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

(async () => {
  await pages.serve();
  const b=await chromium.launch();
  const ctx=await b.newContext({viewport:{width:430,height:900}});
  const p=await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await p.goto(pages.core()); await sleep(500);

  // ---- menu flow ----------------------------------------------------------
  // The gate-house that ships: hero, rung and difficulty rows, then Descend.
  const g=await (await b.newContext({viewport:{width:430,height:900}})).newPage();
  g.on('pageerror',e=>errs.push(e.message));
  g.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await g.goto(pages.game('norun'));
  await g.waitForFunction(()=>typeof blankStash==='function', null, {timeout:30000});
  await g.evaluate(()=>localStorage.clear());
  const gate = async () => { await g.goto(pages.game());
    await g.waitForSelector('#screens.up #descend', {timeout:30000}); await sleep(200); };
  await gate();
  ck('starts on the gate-house', /Gate-House/.test(await g.$eval('#screens h1',e=>e.textContent)));
  ck('hero rows render', (await g.$$('#screens [data-hero]')).length===2);
  ck('rung rows render', (await g.$$('#screens [data-level]')).length>=1);
  ck('difficulty rows render', (await g.$$('#screens [data-diff]')).length===3);
  ck('a default is preselected',
     (await g.$$('#diffRows .on')).length===1 && (await g.$$('#heroRows .on')).length===1);
  await g.click('#screens [data-diff="sundered"]'); await sleep(120);
  await g.click('#screens [data-hero="zayd"]'); await sleep(120);
  ck('selection is reflected',
     (await g.$$('#heroRows .on[data-hero="zayd"]')).length===1 &&
     (await g.$$('#diffRows .on[data-diff="sundered"]')).length===1);
  await g.click('#descend'); await sleep(800);
  const started = await g.evaluate(()=>({state, hero:run.hero, diff:run.diff_id,
                                         threat:DIFF.threat, loot:DIFF.lootRate}));
  ck('descending starts the chosen run', started.state==='play' &&
     started.hero==='zayd' && started.diff==='sundered',
     JSON.stringify(started));
  ck('difficulty drives threat and loot', started.threat>1.9 && started.loot>1.3);

  // ---- elites and set drops ----------------------------------------------
  const el2 = await p.evaluate(()=>{
    let elites=0, total=0, setDrops=0, items=0;
    for(let r=0;r<8;r++){
      resetRun('isaac', LEVELS[RAMP.length].id, 'sundered');
      elites += enemies.filter(e=>e.elite).length;
      total  += enemies.length;
      // kill every elite and see what falls
      for(const e of enemies.filter(x=>x.elite)){
        drops.length=0; run.spawnX=run.spawnX; damageEnemy(e,1e9);
        for(const d of drops){ items++; if(d.item.set===SET_ID) setDrops++; }
      }
    }
    return { elites, total, setDrops, items };
  });
  ck('packs are led by champions', el2.elites>0,
     el2.elites+' elites among '+el2.total+' bodies over 8 delves');
  ck('champions drop gear', el2.items>0, el2.items+' items from '+el2.elites+' elites');
  ck('champions can drop Regalia', el2.setDrops>0,
     el2.setDrops+' set pieces of '+el2.items+' items');

  // ---- set bonuses --------------------------------------------------------
  const set = await p.evaluate(()=>{
    resetRun('isaac', LEVELS[RAMP.length].id);
    const o={};
    for(const sl of SLOTS) player.gear[sl.id]=null;
    recomputeStats();
    const base={hp:player.maxHp, dmg:player.damage, shots:player.shots};
    const order=SLOTS.map(s=>s.id);
    const seen=[];
    for(let i=0;i<order.length;i++){
      player.gear[order[i]]=rollSetPiece(order[i]);
      recomputeStats();
      seen.push({n:i+1, hp:Math.round(player.maxHp), dmg:Math.round(player.damage),
                 shots:player.shots});
    }
    o.base=base; o.steps=seen;
    o.eightShots = player.shots === base.shots+1;
    // and taking it all off returns exactly to base
    for(const sl of SLOTS) player.gear[sl.id]=null;
    recomputeStats();
    o.returns = Math.abs(player.maxHp-base.hp)<1e-9 &&
                Math.abs(player.damage-base.dmg)<1e-9 &&
                player.shots===base.shots;
    return o;
  });
  ck('set bonuses tier up', set.steps[1].hp>set.steps[0].hp &&
     set.steps[3].dmg>set.steps[2].dmg,
     '2pc hp '+set.steps[1].hp+' vs 1pc '+set.steps[0].hp+
     ', 4pc dmg '+set.steps[3].dmg+' vs 3pc '+set.steps[2].dmg);
  ck('the eighth piece grants a second crescent', set.eightShots);
  ck('the whole set comes off cleanly', set.returns);

  // ---- persistence: extract keeps the bag, death does not -----------------
  const keep = await p.evaluate(()=>{
    localStorage.removeItem('rivenmark.stash.v1');
    stash = blankStash();
    resetRun('isaac', LEVELS[RAMP.length].id);
    player.gear.blade = rollItem(0.9,'blade');
    player.bag = [rollItem(0.5,'mail'), rollItem(0.5,'boots')];
    endRun(true);
    const afterWin = { worn: SLOTS.filter(s=>stash.gear[s.id]).length,
                       vault: stash.vault.length };
    // now a death with a full bag
    resetRun('isaac', LEVELS[RAMP.length].id);
    player.gear.blade = rollItem(0.9,'blade');
    player.bag = [rollItem(0.5,'amulet')];
    const vaultBefore = stash.vault.length;
    endRun(false);
    const afterLoss = { worn: SLOTS.filter(s=>stash.gear[s.id]).length,
                        vault: stash.vault.length, vaultBefore };
    return { afterWin, afterLoss };
  });
  ck('extracting banks the bag', keep.afterWin.vault===2, JSON.stringify(keep.afterWin));
  ck('extracting keeps what is worn', keep.afterWin.worn>=1);
  ck('dying loses the bag', keep.afterLoss.vault===keep.afterLoss.vaultBefore,
     'vault '+keep.afterLoss.vaultBefore+' -> '+keep.afterLoss.vault);
  ck('dying keeps what is worn', keep.afterLoss.worn>=1);

  // ---- persistence across a reload ---------------------------------------
  // A reload is the game booting again: it reads the stash, stands a world up
  // for the gate-house, and opens on the hero the stash names.
  const before = await g.evaluate(()=>{
    stash.gear.blade = rollSetPiece('blade');
    stash.vault = [rollItem(0.8,'mail')];
    stash.hero = 'zayd';
    saveStash();
    return { blade: stash.gear.blade.name, vault: stash.vault.length, hero: stash.hero };
  });
  await gate();
  const after = await g.evaluate(()=>({
    blade: stash.gear.blade && stash.gear.blade.name,
    vault: stash.vault.length, hero: stash.hero,
    picked: (document.querySelector('#heroRows .on')||{}).dataset,
    wornInRun: player.gear.blade && player.gear.blade.name }));
  ck('the stash survives a reload',
     after.blade===before.blade && after.vault===before.vault && after.hero===before.hero,
     JSON.stringify(after));
  ck('the gate-house opens on the hero last taken down', after.picked && after.picked.hero==='zayd');
  ck('a new delve starts wearing the stash', after.wornInRun===before.blade,
     'in run: '+after.wornInRun);

  // ---- corrupt saves must not brick the game ------------------------------
  await g.evaluate(()=>localStorage.setItem('rivenmark.stash.v1','{"gear":{"blade":{"slot":"nope","rarity":"???","affixes":[{"id":"bogus","v":null}]}},"vault":"not an array","hero":42}'));
  await gate();
  const rec = await g.evaluate(()=>({ state, blade: stash.gear.blade,
                                      vault: Array.isArray(stash.vault), hero: stash.hero }));
  ck('a corrupt save is discarded, not obeyed',
     rec.blade===null && rec.vault===true && rec.hero==='isaac', JSON.stringify(rec));
  ck('the game still boots after one', rec.state==='menu');

  // ---- the Forge off the gate-house --------------------------------------
  await g.evaluate(()=>{ localStorage.removeItem('rivenmark.stash.v1'); });
  await gate();
  await g.evaluate(()=>{ stash.vault=[rollItem(0.9,'blade'), rollSetPiece('mail')];
                         itemSeq=200; saveStash(); });
  await g.click('#screens [data-tab="gear"]'); await sleep(250);
  ck('the Forge opens from the gate-house',
     /Forge/.test(await g.$eval('#screens h1',e=>e.textContent)));
  ck('it shows the vault, not a bag',
     /vault\s*\S\s*2 of 60/i.test(await g.$eval('#screens .card',e=>e.innerText)));
  const bladeAt = await g.evaluate(()=>stash.vault.findIndex(it=>it.slot==='blade'));
  await g.click('#screens [data-on="'+bladeAt+'"]'); await sleep(200);
  ck('equipping from the vault sticks',
     await g.evaluate(()=>!!stash.gear.blade && stash.vault.length===1));
  await g.click('#screens [data-tab="splash"]'); await sleep(200);
  ck('and the gate-house is a tap away',
     /Gate-House/.test(await g.$eval('#screens h1',e=>e.textContent)));
  await gate();
  ck('a gate-house equip is saved', await g.evaluate(()=>!!stash.gear.blade));
  await g.close();  ck('a menu equip is saved', await p.evaluate(()=>!!stash.gear.blade));

  ck('no console errors', errs.length===0, errs.slice(0,3).join(' | '));
  console.log('\nPASS '+pass.length+'\n  '+pass.join('\n  '));
  console.log('\nFAIL '+fail.length+(fail.length?'\n  '+fail.join('\n  '):''));
  await b.close(); pages.stop(); process.exit(fail.length?1:0);
})();
