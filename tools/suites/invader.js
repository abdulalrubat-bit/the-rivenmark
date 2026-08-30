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
  // Halt the game's own animation loop. Everything here turns on when things
  // happen relative to run.time, and a loop advancing that between evaluates
  // makes "already due" and "due next frame" indistinguishable.
  await p.evaluate(()=>{
    window.requestAnimationFrame = () => 0;
    // spawnInvader looks for open ground 420-680 units out and can legitimately
    // find none on a tight cut, so arrivals are retried across fresh delves.
    // Defined in the page so a test never has to carry an invader across an
    // evaluate boundary, where anything the page does in between can clear it.
    window.arrive = (lvl) => {
      for (let t=0; t<25; t++) {
        startRun('isaac', (lvl||LEVELS[26].id), 'riven');
        // run.time is 0 immediately after startRun and the game loop is
        // halted, so the clock has to be moved past the due time by hand.
        run.time = INVADE_EARLY + 5;
        run.invadeAt = INVADE_EARLY;
        updateInvasion(1/60);
        if (run.invader) return run.invader;
      }
      return null;
    };
  });

  // ---- when he comes ------------------------------------------------------
  const odds = await p.evaluate(()=>{
    stash=blankStash(); saveStash();
    const out={};
    // The ramp is never invaded on purpose, so "the mouth" here means the
    // shallowest rung where an invasion is possible at all.
    for (const id of [LEVELS[RAMP.length].id,'delve26','delve51']) {
      let n=0, early=0, sum=0;
      for(let i=0;i<400;i++){
        startRun('isaac', id, 'riven');
        if(run.invadeAt){ n++; sum+=run.invadeAt; if(run.invadeAt<INVADE_EARLY) early++; }
      }
      out[id]={pct:Math.round(100*n/400), early, avg:Math.round(sum/Math.max(1,n))};
      out.mouthId = out.mouthId || id;
    }
    return out;
  });
  const mouth = odds[odds.mouthId];
  ck('a delve may be invaded, and deeper ones more often',
     mouth.pct>5 && odds.delve51.pct > mouth.pct,
     'mouth '+mouth.pct+'%, mid '+odds.delve26.pct+'%, deep '+odds.delve51.pct+'%');
  ck('never in the first breath of a run', mouth.early===0,
     'earliest '+mouth.avg+'s on average');

  // spawnInvader looks for open ground 420-680 units out and can legitimately
  // fail to find any on a tight cut, so every test that needs an arrival gets
  // one through here rather than betting on a single draw.
  // ---- the arrival --------------------------------------------------------
  const come = await p.evaluate(()=>{
    const e = arrive();
    if(!e) return {came:false};
    return { came:true, far: Math.hypot(e.x-player.x, e.y-player.y),
             inRock: pointInWalls(e.x,e.y,e.r),
             alone: e.summon > 1e6, title: e.title,
             note: run.bannerNote,
             opensGate: run.bossDown, called: run.bossCalled };
  });
  ck('he arrives unannounced', come.came);
  ck('and at a distance you can see him coming', come.far > 380,
     Math.round(come.far)+' units off');
  ck('never in rock', !come.inRock);
  ck('he hunts alone', come.alone);
  ck('he is not the avatar the delve is waiting on',
     !come.opensGate && !come.called, come.title);

  // ---- killing him --------------------------------------------------------
  const kill = await p.evaluate(()=>{
    const e = arrive();
    if(!e) return {skip:true};
    const d0 = drops.length, c0 = run.coins, k0 = run.kills;
    damageEnemy(e, 1e9);
    const got = drops.slice(d0).map(x=>x.item);
    return { down: e.hp<=0, cleared: !run.invader,
             gateStillShut: !run.bossDown,
             set: got.filter(i=>i.set===SET_ID).length,
             any: got.length, coins: run.coins-c0, kills: run.kills-k0,
             note: run.bannerNote };
  });
  ck('an invader can be raised at all', !kill.skip);
  ck('killing him does not open the ley-gate',
     !kill.skip && kill.down && kill.gateStillShut);
  ck('and he always gives up a piece of the Regalia', !kill.skip && kill.set>=1,
     kill.skip?'no arrival':kill.set+' set pieces of '+kill.any+' drops');
  ck('with coin', !kill.skip && kill.coins>0, kill.skip?'':kill.coins+' coin');
  ck('he counts as a kill', !kill.skip && kill.kills===1);
  ck('and the slot is free for another', !kill.skip && kill.cleared);

  // ---- losing him ---------------------------------------------------------
  const lose = await p.evaluate(()=>{
    const e = arrive();
    if(!e) return {skip:true};
    const d0 = drops.length, k0 = run.kills;
    // keep well clear of him
    let t=0;
    for(let i=0;i<60*(INVADE_HUNT+6) && run.invader; i++){
      const a = Math.atan2(player.y-e.y, player.x-e.x);
      player.x = clamp(e.x + Math.cos(a)*(INVADE_GIVEUP+120), 50, WORLD.w-50);
      player.y = clamp(e.y + Math.sin(a)*(INVADE_GIVEUP+120), 50, WORLD.h-50);
      updateInvasion(1/60); t+=1/60;
    }
    return { gone: !run.invader, after: Math.round(t),
             noLoot: drops.length===d0, noKill: run.kills===k0,
             note: run.bannerNote };
  });
  ck('staying clear of him makes him give up',
     !lose.skip && lose.gone, lose.skip?'no arrival':'after '+lose.after+'s');
  ck('and he leaves nothing behind when he does',
     !lose.skip && lose.noLoot && lose.noKill);

  // ---- closing on him resets the clock -----------------------------------
  const chase = await p.evaluate(()=>{
    const e = arrive();
    if(!e) return {skip:true};
    // drift away for a while, then close back in
    for(let i=0;i<60*30;i++){
      const a = Math.atan2(player.y-e.y, player.x-e.x);
      player.x = clamp(e.x + Math.cos(a)*(INVADE_GIVEUP+120), 50, WORLD.w-50);
      player.y = clamp(e.y + Math.sin(a)*(INVADE_GIVEUP+120), 50, WORLD.h-50);
      updateInvasion(1/60);
    }
    const drifted = e.lost;
    for(let i=0;i<60*12;i++){ player.x=e.x+40; player.y=e.y; updateInvasion(1/60); }
    return { drifted: Math.round(drifted), back: Math.round(e.lost),
             still: !!run.invader };
  });
  ck('and coming back to him puts him back on the hunt',
     !chase.skip && chase.back < chase.drifted && chase.still,
     chase.skip?'no arrival':'lost him for '+chase.drifted+'s, then '+chase.back+'s');

  // ---- only one at a time, and never once the gate is open ---------------
  const once = await p.evaluate(()=>{
    const first = arrive();
    run.invadeAt = INVADE_EARLY;
    for(let i=0;i<10;i++) updateInvasion(1/60);
    const two = enemies.filter(e=>e.invader && e.hp>0).length;
    // and with the gate open he is not sent at all
    startRun('isaac', LEVELS[26].id, 'riven');
    run.invader = null;
    run.gateOpen = true; run.time = INVADE_EARLY + 5; run.invadeAt = INVADE_EARLY;
    for(let i=0;i<20;i++) updateInvasion(1/60);
    return { two, duringHold: !!run.invader, had: !!first };
  });
  ck('only one invader stands at a time', once.had && once.two===1, once.two+' standing');
  ck('and none arrive once the gate is open', !once.duringHold);

  ck('no console errors', errs.length===0, errs.slice(0,3).join(' | '));
  console.log('\nPASS '+pass.length+'\n  '+pass.join('\n  '));
  console.log('\nFAIL '+fail.length+(fail.length?'\n  '+fail.join('\n  '):''));
  await b.close(); process.exit(fail.length?1:0);
})();
