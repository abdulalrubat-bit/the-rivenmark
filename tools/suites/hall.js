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

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const pass=[],fail=[]; const ck=(n,ok,note)=>(ok?pass:fail).push((ok?'':'x ')+n+(note?'  ['+note+']':''));
(async () => {
  await pages.serve();
  const b=await chromium.launch();
  const p=await (await b.newContext({viewport:{width:430,height:900}})).newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await p.goto(pages.core()); await sleep(700);

  // ---- laying a stone -----------------------------------------------------
  const buy = await p.evaluate(()=>{
    stash=blankStash(); stash.coins=0; saveStash();
    const h = HALL_BY_ID.vault;
    const poor = hallBuy(h);
    stash.coins = h.tiers[0].cost;
    const ok = hallBuy(h);
    const after = { tier: hallTier('vault'), coins: stash.coins };
    // and again, and again, and then no more
    stash.coins = 1e9;
    hallBuy(h); hallBuy(h);
    const full = hallTier('vault');
    const past = hallBuy(h);
    return { poor, ok, after, full, past, cap: HALL_MAX };
  });
  ck('a stone you cannot pay for is refused', /coin/.test(buy.poor||''), buy.poor);
  ck('one you can pay for is laid', buy.ok===null && buy.after.tier===1);
  ck('and the coin actually leaves the purse', buy.after.coins===0);
  ck('a station tops out', buy.full===buy.cap && /whole/.test(buy.past||''),
     buy.full+' of '+buy.cap);

  // ---- every tier moves a number the player can feel ---------------------
  const eff = await p.evaluate(()=>{
    const snap = () => ({
      vault: vaultCap(), loadouts: loadoutCap(), bag: bagCap(),
      forge: +forgeCut().toFixed(3), relic: +relicCut().toFixed(3),
      set: +setBoost().toFixed(3), ward: wardStone() });
    stash=blankStash(); saveStash();
    const cold = snap();
    stash.hall = { vault:3, forge:3, reliquary:3, wardstone:3 };
    const whole = snap();
    // and the wardstone reaches the hero
    stash.hall = { vault:0, forge:0, reliquary:0, wardstone:0 };
    resetRun('isaac', LEVELS[RAMP.length].id);
    const bare = { hp: player.maxHp, ward: player.ward };
    stash.hall = { vault:0, forge:0, reliquary:0, wardstone:3 };
    recomputeStats();
    return { cold, whole, bare, warded: { hp: player.maxHp, ward: player.ward } };
  });
  ck('the vault grows', eff.whole.vault > eff.cold.vault,
     eff.cold.vault+' -> '+eff.whole.vault+' slots');
  ck('and holds more presets', eff.whole.loadouts > eff.cold.loadouts,
     eff.cold.loadouts+' -> '+eff.whole.loadouts);
  ck('the forge cuts the vendor’s prices', eff.whole.forge < eff.cold.forge,
     '×'+eff.cold.forge+' -> ×'+eff.whole.forge);
  ck('and widens the bag at its last stone', eff.whole.bag > eff.cold.bag,
     eff.cold.bag+' -> '+eff.whole.bag);
  ck('the reliquary tilts the Regalia', eff.whole.set > eff.cold.set,
     '×'+eff.cold.set+' -> ×'+eff.whole.set);
  ck('and discounts its own wares', eff.whole.relic < eff.cold.relic,
     '×'+eff.cold.relic+' -> ×'+eff.whole.relic);
  ck('the wardstone reaches the hero',
     eff.warded.hp > eff.bare.hp && eff.warded.ward > eff.bare.ward,
     Math.round(eff.bare.hp)+' hp -> '+Math.round(eff.warded.hp)+
     ', ward '+eff.bare.ward.toFixed(3)+' -> '+eff.warded.ward.toFixed(3));

  // and the caps are actually enforced, not just reported
  const caps = await p.evaluate(()=>{
    stash=blankStash(); stash.hall={vault:3,forge:0,reliquary:0,wardstone:0};
    saveStash();
    resetRun('isaac', LEVELS[RAMP.length].id);
    state='play';
    for(let i=0;i<200;i++) player.bag.push(rollItem(0.5));
    player.bag.length = Math.min(player.bag.length, 200);
    bankRun(true);
    const banked = stash.vault.length;
    stash.hall.vault = 0;
    const tight = vaultCap();
    return { banked, cap: 60 + 20*3, tight };
  });
  ck('and the vault really holds what it says', caps.banked===caps.cap,
     caps.banked+' banked against a cap of '+caps.cap);

  // ---- it survives a reload, and bad data ---------------------------------
  const disk = await p.evaluate(()=>{
    stash=blankStash(); stash.hall={vault:2,forge:1,reliquary:0,wardstone:3};
    stash.coins=77; saveStash();
    return true;
  });
  await p.reload(); await sleep(700);
  // Read back as the game reads it at boot. The core page has no boot of its
  // own; the canvas build's ran loadStash as it loaded.
  const back = await p.evaluate(()=>{ stash=loadStash();
    return { hall: {...stash.hall}, coins: stash.coins }; });
  ck('the hall outlives the session',
     back.hall.vault===2 && back.hall.wardstone===3 && back.coins===77,
     JSON.stringify(back.hall));

  const junk = await p.evaluate(()=>{
    localStorage.setItem(STASH_KEY, JSON.stringify({
      hall: { vault: 99, forge: -4, nonesuch: 2 }, coins: 10 }));
    const st = loadStash();
    return { vault: st.hall.vault, forge: st.hall.forge,
             junk: st.hall.nonesuch === undefined,
             keys: Object.keys(st.hall).sort().join(',') };
  });
  ck('a tier above the ceiling is clamped, not trusted', junk.vault===3);
  ck('a negative one is floored', junk.forge===0);
  ck('and a station that does not exist is dropped', junk.junk,
     junk.keys);

  // ---- the screen ---------------------------------------------------------
  // The Hall that ships: a tab in the Phaser gate-house, one row a station,
  // each saying how many of its three stones are laid; tapping lays the next.
  const g=await (await b.newContext({viewport:{width:430,height:900}})).newPage();
  g.on('pageerror',e=>errs.push(e.message));
  await g.goto(pages.game('norun'));
  await g.waitForFunction(()=>typeof blankStash==='function', null, {timeout:30000});
  await g.evaluate(()=>{ localStorage.clear(); stash=blankStash(); stash.coins=99999; saveStash(); });
  await g.goto(pages.game());
  await g.waitForSelector('#screens.up #descend', {timeout:30000});
  await g.click('#screens [data-tab="hall"]'); await sleep(300);
  ck('the hall has a row for every station',
     (await g.$$('#screens [data-hall]')).length===4);
  const row = id => g.$eval('#screens [data-hall="'+id+'"]', e=>e.textContent);
  ck('each says how many of its three stones are laid', /0 of 3/.test(await row('forge')));
  const before = await g.evaluate(()=>stash.coins);
  await g.click('#screens [data-hall="forge"]'); await sleep(250);
  const laid = await g.evaluate(()=>({ coins: stash.coins, forge: hallTier('forge'),
    note: [...document.querySelectorAll('#screens .sub')].map(e=>e.textContent).join(' ') }));
  ck('and laying one spends the coin', laid.forge===1 && laid.coins < before,
     before+' -> '+laid.coins);
  ck('the screen says so', /Built/.test(laid.note||''), laid.note);
  ck('and the station keeps count', /1 of 3/.test(await row('forge')));
  await g.close();

  ck('no console errors', errs.length===0, errs.slice(0,3).join(' | '));
  console.log('\nPASS '+pass.length+'\n  '+pass.join('\n  '));
  console.log('\nFAIL '+fail.length+(fail.length?'\n  '+fail.join('\n  '):''));
  await b.close(); pages.stop(); process.exit(fail.length?1:0);
})();
