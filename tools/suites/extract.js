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

  // A run standing in an open gate, quota met and boss down.
  const openGate = () => p.evaluate(()=>{
    stash=blankStash(); saveStash();
    startRun('isaac', LEVELS[0].id, 'riven');
    run.tech = LEVEL.quota; run.bossCalled = true; run.bossDown = true;
    player.x = portal.x; player.y = portal.y;
    for(let i=0;i<400 && !run.gateOpen;i++) updatePortal(1/60);
    return { open: run.gateOpen, channel: LEVEL.channel };
  });

  // ---- the gate: two phases ----------------------------------------------
  const g = await openGate();
  ck('channelling opens the gate rather than ending the run', g.open,
     'channel '+g.channel+'s');
  ck('the run keeps going once the gate is open',
     await p.evaluate(()=>state)==='play');

  /* The step-through control is the game's (delve.js raises #gateBtn), so it
   * is asked of the game, with its own loop running: a delve with the quota
   * met and the avatar down, the hero walked into the gate and then out. */
  const gp = await (await b.newContext({viewport:{width:430,height:900}})).newPage();
  gp.on('pageerror',e=>errs.push(e.message));
  await gp.goto(pages.game('nogate&nogov'));
  await gp.waitForFunction(()=>state==='play' && !!document.getElementById('gateBtn'),
                           null, {timeout:30000});
  /* The live delve keeps running under this, so the hero is HELD in the gate
   * (and nothing is awake to shove or strike him out of it) until it opens,
   * and then the wait is for the button itself -- not a fixed sleep, and not
   * a swallowed timeout. It failed once in a combined run and passed alone;
   * if it ever fails again, the note says where the hero and the gate were. */
  await gp.evaluate(()=>{ run.tech=LEVEL.quota; run.bossCalled=true; run.bossDown=true;
                          for (const e of enemies) e.awake=false;
                          player.invuln=1e9; player.hp=player.maxHp=1e9;
                          window.__hold=setInterval(()=>{ player.x=portal.x; player.y=portal.y; }, 30); });
  const opened = await gp.waitForFunction(()=>run.gateOpen, null, {timeout:20000}).then(()=>true, ()=>false);
  const shown = opened && await gp.waitForSelector('#gateBtn:not([hidden])', {timeout:5000}).then(()=>true, ()=>false);
  const why = shown ? '' : JSON.stringify(await gp.evaluate(()=>({ state, gateOpen: run.gateOpen,
    inside: portal.inside, active: portal.active, channel: +(portal.channel||0).toFixed(2),
    off: Math.round(Math.hypot(player.x-portal.x, player.y-portal.y)), hp: Math.round(player.hp) })));
  await gp.evaluate(()=>clearInterval(window.__hold));
  ck('a step-through control appears in the open gate', shown, why);
  await gp.evaluate(()=>{ player.x=portal.x+900; });
  await sleep(300);
  ck('and hides when you walk out of it',
     await gp.evaluate(()=>document.getElementById('gateBtn').hidden));
  await gp.close();

  // ---- holding it runs in surges -----------------------------------------
  const hold = await p.evaluate(()=>{
    player.x=portal.x; player.y=portal.y;
    player.hp = player.maxHp = 1e9;           // measure the curve, not the hero
    const push = HOLD_WAVE - HOLD_LULL;
    const c0=run.coins, e0=enemies.length, d0=drops.length;
    // through the first surge's push, stopping just short of its crest
    for(let i=0;i<60*(push-1);i++) updatePortal(1/60);
    const preCrest = { coins: run.coins-c0, bodies: enemies.length-e0 };
    // over the crest and into the lull
    for(let i=0;i<60*2;i++) updatePortal(1/60);
    const atCrest = { coins: run.coins-c0, lull: run.holdLull, ticks: run.holdTicks,
                      drops: drops.length-d0 };
    // no new bodies while it is quiet
    const eL = enemies.length;
    for(let i=0;i<60*(HOLD_LULL-3);i++) updatePortal(1/60);
    const quiet = enemies.length - eL;
    // second surge, for the escalation
    const e2=enemies.length, c2=run.coins;
    for(let i=0;i<60*HOLD_WAVE;i++) updatePortal(1/60);
    const s2 = { coins: run.coins-c2, bodies: enemies.length-e2, ticks: run.holdTicks };
    return { preCrest, atCrest, quiet, s2,
             hard: enemies.filter(e=>e.hp>0).length };
  });
  ck('a surge sends bodies before it pays', hold.preCrest.bodies>0 && hold.preCrest.coins===0,
     hold.preCrest.bodies+' bodies, '+hold.preCrest.coins+' coin before the crest');
  ck('outlasting a surge pays at its crest', hold.atCrest.coins>0 && hold.atCrest.ticks===1,
     hold.atCrest.coins+' coin at surge '+hold.atCrest.ticks);
  ck('the crest opens a lull', hold.atCrest.lull);
  ck('and nothing arrives during it', hold.quiet===0, hold.quiet+' bodies in the lull');
  ck('the next surge pays more', hold.s2.coins>hold.atCrest.coins,
     hold.atCrest.coins+' then '+hold.s2.coins);
  ck('and sends more', hold.s2.bodies>hold.preCrest.bodies,
     hold.preCrest.bodies+' then '+hold.s2.bodies);

  // The gear the hold gives up must not arm you against the hold: measured,
  // a piece per surge let a bot ride twenty-eight of them without dying.
  const drip = await p.evaluate(()=>{
    startRun('isaac', LEVELS[0].id, 'riven');
    run.tech=LEVEL.quota; run.bossCalled=true; run.bossDown=true;
    player.x=portal.x; player.y=portal.y; player.hp=player.maxHp=1e9;
    for(let i=0;i<400 && !run.gateOpen;i++) updatePortal(1/60);
    const at=[];
    for(let w=1;w<=6;w++){
      const d0=drops.length;
      while(run.holdTicks<w) updatePortal(1/60);
      at.push(drops.length-d0);
    }
    return at;
  });
  ck('gear comes every other surge, not every one',
     drip[0]===0 && drip[1]===1 && drip[2]===0 && drip[3]===1,
     'drops per surge: '+drip.join(','));

  // ---- the gate will not be held forever ---------------------------------
  const cap = await p.evaluate(()=>{
    startRun('isaac', LEVELS[0].id, 'riven');
    run.tech=LEVEL.quota; run.bossCalled=true; run.bossDown=true;
    player.x=portal.x; player.y=portal.y; player.hp=player.maxHp=1e9;
    for(let i=0;i<400 && !run.gateOpen;i++) updatePortal(1/60);
    let i=0;
    while(state==='play' && i<60*HOLD_WAVE*(HOLD_MAX+3)){ updatePortal(1/60); i++; }
    return { over: state==='over', ticks: run.holdTicks, secs: Math.round(i/60),
             max: HOLD_MAX, banked: stash.coins>0, title: el.overTitle.innerHTML };
  });
  ck('the gate shuts after its last surge', cap.over && cap.ticks===cap.max,
     cap.ticks+' surges in '+cap.secs+'s');
  ck('and being shut out counts as escaping', /Escaped/.test(cap.title) && cap.banked,
     cap.title);

  // ---- stepping through ---------------------------------------------------
  // The cap test above ends its run, so this one opens its own gate: endRun
  // guards on state==='over' and would silently no-op otherwise.
  await openGate();
  const step = await p.evaluate(()=>{
    player.x=portal.x; player.y=portal.y;
    for(let i=0;i<60*(HOLD_WAVE-HOLD_LULL+1);i++) updatePortal(1/60);
    const coins=run.coins;
    player.x=portal.x+900; updatePortal(1/60);
    stepThrough();
    const refusedOutside = state==='play';
    player.x=portal.x; updatePortal(1/60);
    stepThrough();
    return { refusedOutside, over: state==='over', banked: stash.coins, coins };
  });
  ck('you cannot step through from outside the circle', step.refusedOutside);
  ck('stepping through ends the run', step.over);
  ck('and banks the coin the hold paid', step.banked===step.coins,
     step.banked+' banked of '+step.coins);

  // ---- the corpse ---------------------------------------------------------
  const die = await p.evaluate(()=>{
    stash=blankStash(); saveStash();
    startRun('isaac', LEVELS[3].id, 'riven');
    for(let i=0;i<4;i++) player.bag.push(rollItem(0.7));
    run.coins = 500;
    const worn = rollItem(0.9,'blade'); player.gear.blade = worn;
    const at = { x: player.x, y: player.y };
    endRun(false);
    return { corpse: !!stash.corpse, items: stash.corpse&&stash.corpse.items.length,
             coins: stash.corpse&&stash.corpse.coins,
             level: stash.corpse&&stash.corpse.level_id, want: LEVELS[3].id,
             at, bankedCoin: stash.coins, keptBlade: !!stash.gear.blade,
             vault: stash.vault.length };
  });
  ck('dying leaves a corpse', die.corpse);
  ck('it holds the bag', die.items===4, die.items+' finds');
  ck('and the run coin', die.coins===500, die.coins+' coin');
  ck('none of it banks', die.bankedCoin===0 && die.vault===0,
     die.bankedCoin+' coin, '+die.vault+' in the vault');
  ck('what you were wearing survives', die.keptBlade);
  ck('the corpse remembers its delve', die.level===die.want);

  ck('the corpse survives a reload', await (async()=>{
    await p.reload(); await sleep(700);
    return p.evaluate(()=>{ stash=loadStash();
      return !!stash.corpse && stash.corpse.items.length===4 && stash.corpse.coins===500; });
  })());

  const wrong = await p.evaluate(()=>{
    startRun('isaac', LEVELS[5].id, 'riven');   // a different delve
    return !run.corpse;
  });
  ck('it does not follow you into another delve', wrong);

  const back = await p.evaluate(()=>{
    startRun('isaac', LEVELS[3].id, 'riven');
    const placed = !!run.corpse;
    const inRock = placed ? pointInWalls(run.corpse.x, run.corpse.y, 14) : true;
    const before = { bag: player.bag.length, coins: run.coins,
                     bodies: enemies.length, open: portal.active };
    if (placed) { player.x = run.corpse.x; player.y = run.corpse.y;
                  updateCorpse(1/60); }
    const near = enemies.filter(e => e.elite &&
      Math.hypot(e.x-player.x, e.y-player.y) < AMBUSH_R*1.6).length;
    return { placed, inRock, before, bag: player.bag.length, coins: run.coins,
             ambush: near, forced: run.forcedOpen,
             cleared: !stash.corpse, taken: run.corpse && run.corpse.taken,
             reachable: enemies.filter(e=>e.elite).every(e=>!pointInWalls(e.x,e.y,e.r)) };
  });
  ck('descending again puts the corpse in the delve', back.placed);
  ck('and never inside rock', !back.inRock);
  ck('walking into it gives the finds back', back.bag===4, back.bag+' finds');
  ck('and the coin', back.coins-back.before.coins===500,
     (back.coins-back.before.coins)+' coin');
  ck('reclaiming raises an ambush of champions', back.ambush>=3,
     back.ambush+' champions in the ring');
  ck('the ambush stands on ground, not in rock', back.reachable);
  // The gate's state is settled by updatePortal, which the running game calls
  // every frame; here nothing steps the core but this suite.
  ck('and it forces the ley-gate open',
     back.forced && await p.evaluate(()=>{ updatePortal(1/60); return portal.active; }));
  ck('the corpse is claimed once taken', back.taken);
  // Not spent yet: the finds are only in the bag, and the bag is not saved.
  ck('but it stays owed until the run is settled', !back.cleared);

  // ---- a claimed corpse, and the three ways a run can end -----------------
  // Walked out of: the app closes (a reload is exactly that) with the claim
  // in the bag. It used to be cleared off the disk at the claim, so this lost
  // every find in it for good.
  ck('claim it and close the app, and it is still waiting', await (async()=>{
    await p.reload(); await sleep(700);
    return p.evaluate(()=>{ stash=loadStash();
      return !!stash.corpse && stash.corpse.items.length===4 && stash.corpse.coins===500; });
  })());
  const claim = () => { if (!run.corpse) return false;   // nothing was owed
                        player.x = run.corpse.x; player.y = run.corpse.y;
                        updateCorpse(1/60); return !!run.corpse.taken; };
  const out = await p.evaluate(`(()=>{
    const claim = ${claim.toString()};
    startRun('isaac', LEVELS[3].id, 'riven');
    const took = claim();
    endRun(true);
    return { took, corpse: stash.corpse, vault: stash.vault.length, coins: stash.coins };
  })()`);
  ck('claim it and extract, and it is spent -- banked, not owed twice',
     out.took && out.corpse === null && out.vault >= 4 && out.coins >= 500,
     'corpse ' + JSON.stringify(out.corpse) + ', ' + out.vault + ' in the vault');
  const died = await p.evaluate(`(()=>{
    const claim = ${claim.toString()};
    stash=blankStash();
    stash.corpse={level_id:LEVELS[3].id,hero:'isaac',x:100,y:100,
                  items:[rollItem(0.5),rollItem(0.5)],coins:9};
    startRun('isaac', LEVELS[3].id, 'riven');
    const took = claim();
    endRun(false);
    return { took, items: stash.corpse && stash.corpse.items.length,
             txt: el.overSub.textContent };
  })()`);
  ck('claim it and die, and what it held goes into the new corpse',
     died.took && died.items === 2, died.items + ' finds');
  ck('without being told the old one was lost', !/older corpse is gone/.test(died.txt),
     died.txt.slice(0, 90));

  const second = await p.evaluate(()=>{
    stash=blankStash();
    stash.corpse={level_id:LEVELS[3].id,hero:'isaac',x:100,y:100,
                  items:[rollItem(0.5)],coins:9};
    startRun('isaac', LEVELS[3].id, 'riven');
    player.bag.push(rollItem(0.5)); run.coins=40;
    endRun(false);
    return { one: stash.corpse.coins===40, txt: el.overSub.textContent };
  });
  ck('a second death replaces the first corpse', second.one);
  ck('and the over-screen says where it went',
     /lie in|Descend again/.test(second.txt), second.txt.slice(0,90));

  ck('no console errors', errs.length===0, errs.slice(0,3).join(' | '));
  console.log('\nPASS '+pass.length+'\n  '+pass.join('\n  '));
  console.log('\nFAIL '+fail.length+(fail.length?'\n  '+fail.join('\n  '):''));
  await b.close(); pages.stop(); process.exit(fail.length?1:0);
})();
