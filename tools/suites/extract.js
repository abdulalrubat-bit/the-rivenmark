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
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const pass=[],fail=[]; const ck=(n,ok,note)=>(ok?pass:fail).push((ok?'':'x ')+n+(note?'  ['+note+']':''));
(async()=>{
  const b=await chromium.launch();
  const p=await (await b.newContext({viewport:{width:430,height:900}})).newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await p.goto(PAGE('index.html')); await sleep(700);

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

  await sleep(120);
  ck('a step-through control appears in the open gate',
     await p.evaluate(()=>!el.gateBtn.hidden));
  ck('and hides when you walk out of it',
     await p.evaluate(()=>{ player.x=portal.x+900; updatePortal(1/60); syncHud();
                            return el.gateBtn.hidden; }));

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
             max: HOLD_MAX, banked: stash.coins>0, title: el.overTitle.textContent };
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
  ck('and it forces the ley-gate open', back.forced && await p.evaluate(()=>portal.active));
  ck('the corpse is spent once taken', back.cleared && back.taken);

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
  await b.close(); process.exit(fail.length?1:0);
})();
