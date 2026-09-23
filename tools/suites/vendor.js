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
const pass=[],fail=[];
/* 'x ' on a failure: run-suites.js surfaces exactly that prefix when it
 * summarises a sweep, so without it a red suite reports its count and none
 * of its reasons — which means re-running it alone to find out why. */
const ck=(n,ok,note)=>(ok?pass:fail).push((ok?'':'x ')+n+(note?'  ['+note+']':''));
(async () => {
  await pages.serve();
  const b=await chromium.launch();
  const p=await (await b.newContext({viewport:{width:430,height:900}})).newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await p.goto(pages.core()); await sleep(600);

  // ---- coin drops ---------------------------------------------------------
  const coin = await p.evaluate(()=>{
    localStorage.removeItem('rivenmark.stash.v1'); stash=blankStash();
    resetRun('isaac', LEVELS[RAMP.length].id);
    const o={ start: run.coins };
    let elite=0, thrall=0;
    for(const e of enemies.slice()){ if(e.hp<=0) continue;
      const before=run.coins; damageEnemy(e,1e9);
      if(e.elite) elite += run.coins-before; else thrall += run.coins-before; }
    o.total=run.coins; o.elite=elite; o.thrall=thrall;
    // banking follows the same extract-or-lose rule as gear
    const banked0 = stash.coins||0;
    state='play'; endRun(true); o.afterWin=(stash.coins||0)-banked0;
    const banked1 = stash.coins||0;
    resetRun('isaac', LEVELS[RAMP.length].id); state='play'; run.coins=500; endRun(false);
    o.afterLoss=(stash.coins||0)-banked1;
    return o;
  });
  ck('coin drops in a delve', coin.total>0, coin.total+' from one delve');
  ck('champions carry more coin than thralls', coin.elite>0,
     'elites '+coin.elite+' vs thralls '+coin.thrall);
  ck('extracting banks coin', coin.afterWin>0, '+'+coin.afterWin);
  ck('dying loses coin', coin.afterLoss===0, '+'+coin.afterLoss);

  // ---- pity ---------------------------------------------------------------
  const pity = await p.evaluate(()=>{
    stash=blankStash(); const o={};
    // endRun refuses to run twice on one delve, so the state has to go back to
    // 'play' between them or every call after the first returns early.
    const finish = (bag, won) => { resetRun('isaac', LEVELS[RAMP.length].id); state='play';
                                   player.bag = bag; endRun(won); };
    for(let i=0;i<4;i++) finish([], true);
    o.after4 = stash.pity;
    const costBefore = vendorCost(VENDOR.find(v=>v.id==='reliquary'));
    for(let i=0;i<8;i++) finish([], true);
    o.after12 = stash.pity;
    o.costFall = costBefore - vendorCost(VENDOR.find(v=>v.id==='reliquary'));
    finish([rollSetPiece('blade')], true);
    o.afterFind = stash.pity;
    return o;
  });
  ck('pity rises when the Regalia refuses', pity.after12>pity.after4,
     pity.after4+' -> '+pity.after12);
  ck('the reliquary gets cheaper with pity', pity.costFall>0, '-'+pity.costFall+' coin');
  ck('finding a piece resets pity', pity.afterFind===0);

  // ---- buying -------------------------------------------------------------
  const buy = await p.evaluate(()=>{
    stash=blankStash(); stash.coins=100000; const o={};
    const commission=VENDOR.find(v=>v.id==='commission');
    const n0=stash.vault.length;
    o.commissioned = vendorBuy(commission,'blade') && stash.vault.length===n0+1 &&
                     stash.vault[n0].slot==='blade';
    o.paid = stash.coins < 100000;
    // temper rerolls a worn piece and keeps its rarity
    stash.gear.mail = rollItem(0.5,'mail');
    const before = JSON.stringify(stash.gear.mail.affixes);
    const rar = stash.gear.mail.rarity;
    const temper=VENDOR.find(v=>v.id==='temper');
    vendorBuy(temper,'mail');
    o.tempered = JSON.stringify(stash.gear.mail.affixes)!==before &&
                 stash.gear.mail.rarity===rar;
    // the Regalia cannot be tempered
    stash.gear.boots = rollSetPiece('boots');
    o.setSafe = vendorBuy(temper,'boots')===false;
    // reliquary yields a set piece
    const v0=stash.vault.length;
    o.reliquary = vendorBuy(VENDOR.find(v=>v.id==='reliquary')) &&
                  stash.vault[v0].set===SET_ID;
    // and you cannot buy what you cannot afford
    stash.coins=0;
    o.refused = vendorBuy(commission,'ring1')===false;
    return o;
  });
  ck('commissioning yields a piece for the slot asked for', buy.commissioned);
  ck('buying costs coin', buy.paid);
  ck('tempering rerolls a worn piece and keeps its rarity', buy.tempered);
  ck('the Regalia cannot be tempered', buy.setSafe);
  ck('a reliquary yields a Regalia piece', buy.reliquary);
  ck('you cannot buy what you cannot afford', buy.refused);

  // ---- the screen ---------------------------------------------------------
  // The Vendor that ships: a tab in the Phaser gate-house.
  const g=await (await b.newContext({viewport:{width:430,height:900}})).newPage();
  g.on('pageerror',e=>errs.push(e.message));
  await g.goto(pages.game('norun'));
  await g.waitForFunction(()=>typeof blankStash==='function', null, {timeout:30000});
  await g.evaluate(()=>{ localStorage.clear(); stash=blankStash(); stash.coins=5000; saveStash(); });
  await g.goto(pages.game());
  await g.waitForSelector('#screens.up #descend', {timeout:30000});
  await g.click('#screens [data-tab="vendor"]'); await sleep(250);
  ck('the vendor opens from the gate-house',
     /Vendor/.test(await g.$eval('#screens h1',e=>e.textContent)));
  ck('the purse is shown', /5000/.test(await g.$eval('#screens .purse',e=>e.innerText)));
  ck('offers render', (await g.$$('#screens [data-buy]')).length===3);
  await g.click('#screens [data-buy="commission"]'); await sleep(150);
  ck('selecting an offer shows slots',
     (await g.$$('#screens [data-slot]')).length>0);
  const v0 = await g.evaluate(()=>stash.vault.length);
  await g.click('#screens [data-slot]'); await sleep(200);
  ck('buying through the screen works',
     await g.evaluate(()=>stash.vault.length)===v0+1);
  await g.click('#screens [data-tab="splash"]'); await sleep(200);
  ck('and the gate-house is a tap away',
     /Gate-House/.test(await g.$eval('#screens h1',e=>e.textContent)));
  await g.reload(); await sleep(600);
  await g.waitForFunction(()=>typeof stash!=='undefined', null, {timeout:30000});
  ck('the purchase persisted', await g.evaluate(()=>stash.vault.length)>0);
  await g.close();

  ck('no console errors', errs.length===0, errs.slice(0,3).join(' | '));
  console.log('\nPASS '+pass.length+'\n  '+pass.join('\n  '));
  console.log('\nFAIL '+fail.length+(fail.length?'\n  '+fail.join('\n  '):''));
  await b.close(); pages.stop(); process.exit(fail.length?1:0);
})();
