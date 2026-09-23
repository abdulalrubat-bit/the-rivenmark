/* Run through tools/run-suites.js, or alone with node. Which page it drives --
 * the core, the game or the forge -- is in ./_pages.js. */
const { chromium } = require('playwright');
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

  // ---- the ladder ---------------------------------------------------------
  const lad = await p.evaluate(()=>({
    n: LEVELS.length,
    powers: LEVELS.map(L=>L.power),
    quotas: LEVELS.map(L=>L.quota),
    firstHorde: LEVELS[0].horde.length, lastHorde: LEVELS[LEVELS.length-1].horde.length,
    ids: new Set(LEVELS.map(L=>L.id)).size
  }));
  ck('the ladder has 50+ delves', lad.n>=50, lad.n+' delves');
  ck('every delve id is unique', lad.ids===lad.n);
  ck('expected power rises monotonically',
     lad.powers.every((v,i)=>i===0||v>=lad.powers[i-1]),
     lad.powers[0]+' -> '+lad.powers[lad.n-1]);
  ck('quota rises with depth', lad.quotas[lad.n-1]>lad.quotas[0],
     lad.quotas[0]+' -> '+lad.quotas[lad.n-1]);

  // ---- boons are gone -----------------------------------------------------
  const gone = await p.evaluate(()=>({
    noRoll: typeof rollUpgrades==='undefined',
    noTake: typeof takeUpgrade==='undefined',
    noOpen: typeof openLevelUp==='undefined',
    noScreen: !document.getElementById('levelup')
  }));
  ck('boon rolling is gone', gone.noRoll && gone.noTake && gone.noOpen);
  ck('the boon screen is gone', gone.noScreen);

  // ---- slag is experience, and only if you walk out -----------------------
  const xp = await p.evaluate(()=>{
    localStorage.removeItem('rivenmark.stash.v1'); stash = blankStash();
    const o={};
    o.startLevel = stash.level;
    resetRun('isaac'); run.tech = xpForLevel(4);
    endRun(true);
    o.afterWin = { xp: stash.xp, level: stash.level };
    const before = stash.xp;
    resetRun('isaac'); run.tech = 99999;
    endRun(false);
    o.afterLoss = { xp: stash.xp, gained: stash.xp - before };
    return o;
  });
  ck('a delve starts at level 1', xp.startLevel===1);
  ck('extracting banks slag as experience', xp.afterWin.level>1,
     'level 1 -> '+xp.afterWin.level+' on '+xp.afterWin.xp+' slag');
  ck('dying banks nothing', xp.afterLoss.gained===0, 'gained '+xp.afterLoss.gained);

  // ---- level actually makes the hero stronger -----------------------------
  const pw = await p.evaluate(()=>{
    const o={};
    stash.xp = 0; stash.level = 1; resetRun('isaac'); recomputeStats();
    o.l1 = { hp: Math.round(player.maxHp), dmg: +player.damage.toFixed(1) };
    stash.xp = xpForLevel(30); stash.level = 30; resetRun('isaac'); recomputeStats();
    o.l30 = { hp: Math.round(player.maxHp), dmg: +player.damage.toFixed(1) };
    // power level averages hero and kit
    o.bare = powerLevel(player.gear, 30);
    for (const sl of SLOTS) player.gear[sl.id] = rollSetPiece(sl.id);
    o.kitted = powerLevel(player.gear, 30);
    o.lowLevelKitted = powerLevel(player.gear, 1);
    return o;
  });
  ck('levels make the hero stronger', pw.l30.hp>pw.l1.hp && pw.l30.dmg>pw.l1.dmg,
     'L1 '+pw.l1.hp+'hp/'+pw.l1.dmg+'dmg -> L30 '+pw.l30.hp+'hp/'+pw.l30.dmg+'dmg');
  ck('gear raises power level', pw.kitted>pw.bare, pw.bare+' bare -> '+pw.kitted+' kitted');
  ck('power reflects both hero and kit', pw.lowLevelKitted<pw.kitted,
     'L1 kitted '+pw.lowLevelKitted+' vs L30 kitted '+pw.kitted);

  // ---- the ladder UI ------------------------------------------------------
  /* Asked of the gate-house that ships. It shows a window of eight rungs
   * around the one it opens on rather than all fifty-two (see renderGatehouse),
   * so "every rung renders" is "a full window renders" here. Each case is a
   * fresh load, because the rung it opens on is chosen when the gate-house is
   * first raised -- which is when a returning player's power is read. */
  const gate = async stashFor => {
    const g = await (await b.newContext({viewport:{width:390,height:844}})).newPage();
    g.on('pageerror',e=>errs.push(e.message));
    await g.goto(pages.game('norun'));
    await g.waitForFunction(()=>typeof blankStash==='function', null, {timeout:30000});
    await g.evaluate(stashFor);
    await g.goto(pages.game());
    await g.waitForSelector('#screens.up #descend', {timeout:30000});
    const r = await g.evaluate(()=>({
      rows: document.querySelectorAll('#screens [data-level]').length,
      on: [...document.querySelectorAll('#screens [data-level].on')].map(b=>b.dataset.level),
      verdicts: document.querySelectorAll('#screens [data-level] .verdict').length,
      pw: stashPower() }));
    await g.close();
    return r;
  };
  const fresh = await gate(()=>{ localStorage.clear(); stash=blankStash(); saveStash(); });
  ck('a full window of rungs renders', fresh.rows>=8, fresh.rows+' rungs');
  ck('a rung is preselected', fresh.on.length===1);
  ck('standing is shown', fresh.verdicts===fresh.rows, fresh.verdicts+' of '+fresh.rows);
  ck('opens on the deepest delve you match', fresh.on[0]==='test',
     'at power '+fresh.pw+' it opened on '+fresh.on[0]);

  // with real power, it should open deeper
  const deep = await gate(()=>{ localStorage.clear(); stash=blankStash();
    stash.xp = xpForLevel(40); stash.level = 40;
    for (const sl of SLOTS) stash.gear[sl.id] = rollSetPiece(sl.id); saveStash(); });
  ck('a strong hero opens deeper down the ladder', deep.on[0]!=='test',
     'power '+deep.pw+' opened on '+deep.on[0]);

  /* ---- the front door speaks the hero's own units --------------------------
   *
   * The gate-house and the ladder each had a number called "power" and they
   * were not the same quantity. powerLevel() starts a Vanguard at 1; the
   * ladder's floor was 4, written down as "where a Vanguard who has never
   * descended stands". And delveStanding compared them by SUBTRACTION, with
   * bands of twelve and fourteen points, on a scale running 1 to 120 that is
   * measured in ratios everywhere else in the file.
   *
   * The cost was the whole front door: on a fresh stash the gate-house showed
   * one rung "above your weight" and fifty-one "far beyond you", including
   * the rung it was simultaneously recommending. These checks are about that
   * first screen, and the last of them is the one that would have caught it.
   */
  const front = await p.evaluate(() => {
    const o = {};
    const tally = pw => { const t = { trivial:0, even:0, hard:0, deadly:0 };
      for (const L of LEVELS) t[delveStanding(L, pw).id]++; return t; };
    stash = blankStash(); saveStash();
    o.freshPower = stashPower();
    o.rung0Power = LEVELS[0].power;
    o.freshStanding = delveStanding(LEVELS[0], stashPower()).id;
    o.freshTally = tally(stashPower());
    o.freshRecommends = recommendedLevel(stashPower());
    o.rung0Id = LEVELS[0].id;
    o.rungCount = LEVELS.length;
    /* THE BANDS MEAN THE SAME THING AT BOTH ENDS. Carrying a fixed FRACTION
     * of a rung's asking power must read the same at rung 3 and rung 44 --
     * that is the whole of what "different units" meant, and a difference-
     * based band cannot do it however the numbers are chosen. */
    o.sameShallow = [];
    o.sameDeep = [];
    for (const f of [1.5, 1.0, 0.8, 0.4]) {
      o.sameShallow.push(delveStanding(LEVELS[3], Math.round(LEVELS[3].power * f)).id);
      o.sameDeep.push(delveStanding(LEVELS[44], Math.round(LEVELS[44].power * f)).id);
    }
    // ...and the ladder still gets harder as you go down, at a fixed power.
    o.monotone = true;
    const at = 40, seen = [];
    for (const L of LEVELS) seen.push(delveStanding(L, at).id);
    const rank = { trivial:3, even:2, hard:1, deadly:0 };
    for (let i = 1; i < seen.length; i++)
      if (rank[seen[i]] > rank[seen[i-1]]) o.monotone = false;
    o.atPower40 = seen[0] + ' -> ' + seen[seen.length-1];
    return o;
  });
  ck('a Vanguard who has never descended reads the same units as the ladder',
     front.freshPower === front.rung0Power,
     'hero ' + front.freshPower + ', proving ground ' + front.rung0Power +
     (front.freshPower === front.rung0Power ? ''
       : ' — TWO SCALES, and the front door is written in the wrong one'));
  ck('...so the proving ground is an even match, not a warning',
     front.freshStanding === 'even', 'it reads "' + front.freshStanding + '"');
  ck('and the gate-house sends them there',
     front.freshRecommends === front.rung0Id, 'opens on ' + front.freshRecommends);
  ck('the rung it recommends is not one it calls beyond you',
     ['even','trivial'].indexOf(
       front.freshStanding) >= 0 && front.freshRecommends === front.rung0Id,
     'recommended ' + front.freshRecommends + ', labelled "' + front.freshStanding + '"');
  ck('a new player is not shown a ladder of nothing but red',
     front.freshTally.even + front.freshTally.trivial >= 1,
     front.freshTally.trivial + ' well within, ' + front.freshTally.even +
     ' even, ' + front.freshTally.hard + ' above, ' + front.freshTally.deadly +
     ' beyond — of ' + front.rungCount);
  ck('THE SAME FRACTION OF A RUNG READS THE SAME AT BOTH ENDS OF THE LADDER',
     front.sameShallow.join() === front.sameDeep.join(),
     'at 1.5x/1.0x/0.8x/0.4x — rung 3 ' + front.sameShallow.join('/') +
     ', rung 44 ' + front.sameDeep.join('/') +
     (front.sameShallow.join() === front.sameDeep.join() ? ''
       : ' — THE BANDS ARE ABSOLUTE ON A SCALE THAT IS NOT'));
  ck('and the control: the ladder still only ever gets harder',
     front.monotone === true,
     'at a fixed power 40, rung 0 to 51: ' + front.atPower40 +
     (front.monotone ? '' : ' — A RUNG READS EASIER THAN THE ONE ABOVE IT'));

  // put the stash back for anything below that expects a fresh one
  await p.evaluate(() => { stash = blankStash(); saveStash(); });

  // ---- a deep delve actually plays ---------------------------------------
  const deepRun = await p.evaluate(()=>{
    resetRun('isaac', LEVELS[LEVELS.length-1].id, 'riven');
    return { level: LEVEL.id, quota: LEVEL.quota, enemies: enemies.length,
             open: openCells.length, state };
  });
  ck('the deepest delve generates and populates',
     deepRun.enemies>20 && deepRun.open>200, JSON.stringify(deepRun));

  ck('no console errors', errs.length===0, errs.slice(0,3).join(' | '));
  console.log('\nPASS '+pass.length+'\n  '+pass.join('\n  '));
  console.log('\nFAIL '+fail.length+(fail.length?'\n  '+fail.join('\n  '):''));
  await b.close(); pages.stop(); process.exit(fail.length?1:0);
})();
