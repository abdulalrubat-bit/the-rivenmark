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
const URL=PAGE('index.html');
(async()=>{
  const b=await chromium.launch();
  const ctx=await b.newContext({viewport:{width:430,height:900}});
  const p=await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await p.goto(URL); await sleep(500);

  // ---- menu flow ----------------------------------------------------------
  ck('starts on the gate-house', await p.$eval('#splash',e=>e.classList.contains('on')));
  await enterHub(p); await p.click('#toDelve'); await sleep(200);
  ck('Descend opens the delve screen', await p.$eval('#delve',e=>e.classList.contains('on')));
  ck('hero cards render', (await p.$$('#heroPick .card')).length===2);
  ck('level cards render', (await p.$$('#levelPick .card')).length>=1);
  ck('difficulty cards render', (await p.$$('#diffPick .card')).length===3);
  ck('a default is preselected',
     (await p.$$('#diffPick .card.sel')).length===1 &&
     (await p.$$('#heroPick .card.sel')).length===1);
  await p.click('#diffPick .card:nth-child(3)'); await sleep(120);
  await p.click('#heroPick .card:nth-child(2)'); await sleep(120); await sleep(120);
  const line = await p.$eval('#beginLine',e=>e.textContent);
  ck('selection is reflected', /Zayd/.test(line) && /Sundered/.test(line), line);
  await p.click('#beginRun'); await sleep(600);
  const started = await p.evaluate(()=>({state, hero:run.hero, diff:run.diff_id,
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
  const before = await p.evaluate(()=>{
    stash.gear.blade = rollSetPiece('blade');
    stash.vault = [rollItem(0.8,'mail')];
    stash.hero = 'zayd';
    saveStash();
    return { blade: stash.gear.blade.name, vault: stash.vault.length, hero: stash.hero };
  });
  await p.reload(); await sleep(700);
  const after = await p.evaluate(()=>({
    blade: stash.gear.blade && stash.gear.blade.name,
    vault: stash.vault.length, hero: stash.hero,
    wornInRun: player.gear.blade && player.gear.blade.name }));
  ck('the stash survives a reload',
     after.blade===before.blade && after.vault===before.vault && after.hero===before.hero,
     JSON.stringify(after));
  ck('a new delve starts wearing the stash', after.wornInRun===before.blade,
     'in run: '+after.wornInRun);

  // ---- corrupt saves must not brick the game ------------------------------
  await p.evaluate(()=>localStorage.setItem('rivenmark.stash.v1','{"gear":{"blade":{"slot":"nope","rarity":"???","affixes":[{"id":"bogus","v":null}]}},"vault":"not an array","hero":42}'));
  await p.reload(); await sleep(700);
  const rec = await p.evaluate(()=>({ state, blade: stash.gear.blade,
                                      vault: Array.isArray(stash.vault), hero: stash.hero }));
  ck('a corrupt save is discarded, not obeyed',
     rec.blade===null && rec.vault===true && rec.hero==='isaac', JSON.stringify(rec));
  ck('the game still boots after one', rec.state==='menu');

  // ---- the kit screen off the menu ---------------------------------------
  await p.evaluate(()=>{ localStorage.removeItem('rivenmark.stash.v1'); });
  await p.reload(); await sleep(700);
  await p.evaluate(()=>{ stash.vault=[rollItem(0.9,'blade'), rollSetPiece('mail')];
                         saveStash(); refreshKitLine(); });
  await enterHub(p); await p.click('#toKit'); await sleep(250);
  ck('the kit opens from the menu', await p.evaluate(()=>state)==='gear');
  ck('it shows the vault, not a bag',
     /Vault|vault/.test(await p.$eval('#gearSub',e=>e.textContent)) ||
     (await p.$eval('#bagCount',e=>e.textContent)).includes('/'+60), 
     await p.$eval('#gearSub',e=>e.textContent) + ' | ' +
     await p.$eval('#bagCount',e=>e.textContent));
  // The vault is ordered now, so the first cell is whatever is strongest --
  // here the mythic mail, not the blade. Click the blade's own cell.
  const bladeCell = await p.evaluate(()=>{
    const C = gearCtx;
    return C.bag.findIndex(it => it.slot === 'blade');
  });
  await p.click('#bagGrid .cellbtn:nth-child(' + (bladeCell + 1) + ')');
  await sleep(150);
  await p.click('#gaEquip'); await sleep(200);
  ck('equipping from the vault sticks',
     await p.evaluate(()=>!!stash.gear.blade && stash.vault.length===1),
     'blade was cell ' + (bladeCell + 1));
  await p.click('#gearClose'); await sleep(200);
  ck('closing the kit returns to the gate-house',
     await p.evaluate(()=>state)==='menu' &&
     await p.$eval('#splash',e=>e.classList.contains('on')));
  await p.reload(); await sleep(700);
  ck('a menu equip is saved', await p.evaluate(()=>!!stash.gear.blade));

  ck('no console errors', errs.length===0, errs.slice(0,3).join(' | '));
  console.log('\nPASS '+pass.length+'\n  '+pass.join('\n  '));
  console.log('\nFAIL '+fail.length+(fail.length?'\n  '+fail.join('\n  '):''));
  await b.close(); process.exit(fail.length?1:0);
})();
