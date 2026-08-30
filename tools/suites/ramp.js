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
const pass=[],fail=[]; const ck=(n,ok,note)=>(ok?pass:fail).push((ok?'':'x ')+n+(note?'  ['+note+']':''));
(async()=>{
  const b=await chromium.launch();
  const p=await (await b.newContext({viewport:{width:430,height:900}})).newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await p.goto(PAGE('index.html')); await sleep(700);
  await p.evaluate(()=>{ window.requestAnimationFrame = () => 0; });

  // ---- what each rung is allowed to contain ------------------------------
  // The boundary is read from RAMP rather than written down here: the ramp has
  // grown twice now, and a test that hardcodes its length fails for the one
  // reason that is not a bug.
  const N = await p.evaluate(()=>RAMP.length);
  const full = await p.evaluate(()=>FULL_HORDE.slice());
  const shape = await p.evaluate(n=>LEVELS.slice(0, n+1).map((L,i)=>({
    i, horde:L.horde.slice(), elites:L.elites, pitch:L.pitch, invade:L.invade,
    guard:L.guard, muts:L.mutators.length, lesson:!!L.lesson })), N);
  ck('the first delve is thralls and nothing else',
     shape[0].horde.join()==='thrall' && shape[0].elites===0 &&
     shape[0].pitch===0 && shape[0].invade===0 && shape[0].muts===0 &&
     shape[0].guard===0,
     'horde '+shape[0].horde.join('+'));
  ck('the second adds the flanker and only that',
     shape[1].horde.join()==='thrall,eclipse' && shape[1].pitch===0 &&
     shape[1].invade===0 && shape[1].muts===0,
     'horde '+shape[1].horde.join('+'));
  ck('the third adds the anchor and the pitch',
     shape[2].horde.indexOf('breaker')>=0 && shape[2].pitch>0 &&
     shape[2].invade===0,
     'horde '+shape[2].horde.join('+')+', pitch '+shape[2].pitch);
  ck('the fourth adds the burster and only that',
     shape[3].horde.indexOf('husk')>=0 && shape[3].horde.indexOf('cantor')<0,
     'horde '+shape[3].horde.join('+'));
  ck('the fifth adds the one that keeps its distance',
     shape[4].horde.indexOf('cantor')>=0,
     'horde '+shape[4].horde.join('+'));
  ck('the sixth adds the one that waits out of the fight',
     shape[5].horde.indexOf('flayer')>=0 && shape[5].horde.indexOf('gorger')<0,
     'horde '+shape[5].horde.join('+'));
  ck('the seventh adds the one that breaks the floor',
     shape[6].horde.indexOf('gorger')>=0 && shape[6].horde.indexOf('shaman')<0,
     'horde '+shape[6].horde.join('+'));
  ck('the eighth adds the one that never comes forward',
     shape[7].horde.indexOf('shaman')>=0,
     'horde '+shape[7].horde.join('+'));
  ck('each rung adds exactly one archetype',
     shape.slice(1, N).every((r,i)=>r.horde.length===shape[i].horde.length+1),
     shape.slice(0,N).map(r=>r.horde.length).join('->'));
  ck('the rung after the ramp is the whole game',
     shape[N].invade===1 && shape[N].guard<0 && shape[N].pitch===0.55 &&
     shape[N].elites===0.16 && shape[N].horde.length===full.length,
     'delve '+N+', horde '+shape[N].horde.length+'/'+full.length);
  ck('and only the ramp carries a lesson',
     shape.slice(0,N).every(r=>r.lesson) && !shape[N].lesson,
     N+' rungs');

  // ---- and what a cut of each actually contains --------------------------
  const cut = await p.evaluate(()=>{
    stash=blankStash(); saveStash();
    const out=[];
    for (let i=0;i<=RAMP.length;i++){
      let elites=0, barrels=0, kinds=new Set(), invasions=0, runs=10;
      for(let r=0;r<runs;r++){
        startRun('isaac', LEVELS[i].id, 'riven');
        elites += enemies.filter(e=>e.elite).length;
        barrels += propGrid.filter(o=>o.kind==='barrel').length;
        enemies.forEach(e=>kinds.add(e.kind));
        if (run.invadeAt) invasions++;
      }
      out.push({ i, elites, barrels, kinds:[...kinds].sort().join('+'), invasions });
    }
    return out;
  });
  ck('no champion ever stands in the first delve', cut[0].elites===0,
     cut[0].elites+' over ten cuts');
  ck('no pitch in the first two', cut[0].barrels===0 && cut[1].barrels===0,
     cut[0].barrels+' and '+cut[1].barrels+' barrels');
  ck('and pitch from the third on', cut[2].barrels>0 && cut[3].barrels>0,
     cut[2].barrels+' then '+cut[3].barrels);
  ck('nothing but thralls in the first', cut[0].kinds==='thrall', cut[0].kinds);
  ck('flankers in the second, no anchors', cut[1].kinds==='eclipse+thrall',
     cut[1].kinds);
  ck('anchors from the third', cut[2].kinds.indexOf('breaker')>=0, cut[2].kinds);
  ck('never invaded while it is still teaching',
     cut[0].invasions===0 && cut[1].invasions===0 && cut[2].invasions===0,
     'and '+cut[3].invasions+'/10 on the fourth');

  // ---- the avatar on a ramp rung ------------------------------------------
  const boss = await p.evaluate(()=>{
    const out=[];
    for (const i of [0,1,3]) {
      startRun('isaac', LEVELS[i].id, 'riven');
      run.tech = LEVEL.quota;
      updatePortal(1/60);
      out.push({ i, title: run.boss.title,
                 guard: enemies.filter(e=>e.kind==='lieutenant').length });
    }
    return out;
  });
  ck('he arrives plainly on the first rung, and alone',
     /Gilded/.test(boss[0].title) && boss[0].guard===0, boss[0].title);
  ck('with one Lieutenant on the second', boss[1].guard===1);
  ck('and named for what he can do from the fourth',
     /Deceiver,/.test(boss[2].title), boss[2].title);

  // ---- the lesson is shown, not explained --------------------------------
  const said = await p.evaluate(()=>{
    startRun('isaac', LEVELS[0].id, 'riven');
    return { note: LEVEL.lesson, banner: run.banner>0, custom: run.bannerNote };
  });
  ck('the opening line of a ramp delve is its lesson',
     !!said.note && said.banner && !said.custom, said.note);

  await p.evaluate(()=>{ state='menu'; showScreen('splash'); });
  await sleep(120);
  await enterHub(p); await p.click('#toDelve'); await sleep(400);
  const cards = await p.evaluate(()=>{
    const r=[...document.querySelectorAll('#levelPick .rung')];
    return { teach: r.filter(c=>c.querySelector('.teach')).length,
             first: r[0].querySelector('.teach') &&
                    r[0].querySelector('.teach').textContent };
  });
  ck('and the ladder says it too, on the ramp rungs only', cards.teach===N,
     cards.teach+' cards carry one: "'+cards.first+'"');

  ck('no console errors', errs.length===0, errs.slice(0,3).join(' | '));
  console.log('\nPASS '+pass.length+'\n  '+pass.join('\n  '));
  console.log('\nFAIL '+fail.length+(fail.length?'\n  '+fail.join('\n  '):''));
  await b.close(); process.exit(fail.length?1:0);
})();
