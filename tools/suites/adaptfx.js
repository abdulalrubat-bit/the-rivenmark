/* Moved out of a scratch directory and into the repo.
 *
 * These suites were the entire safety net for a 14,000-line single file, and
 * they lived only in /tmp -- one container restart from gone, and certain to
 * go when the session that made them ended. The page they drive is found
 * relative to this file now instead of by an absolute path, so they run from
 * any clone, on a desktop or under Termux.
 */
// The adaptive-effects loop, tested on the hardware that actually broke it: a
// vsync-locked 60Hz display. Headless Chromium paces rAF at ~60Hz, which is
// the phone case exactly.
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
  const p=await (await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2})).newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto(PAGE('index.html')); await sleep(800);

  // What the display is actually delivering, so the test states its own premise
  // rather than assuming it.
  await p.evaluate(()=>{ window.__iv=[]; let last=0;
    const raf=window.requestAnimationFrame.bind(window);
    (function tick(t){ if(last) window.__iv.push(t-last); last=t; raf(tick); })(0); });
  await p.evaluate(()=>startRun('isaac', LEVELS[3].id, 'riven'));
  await sleep(1200);
  const hz = await p.evaluate(()=>{
    const q=window.__iv.slice(5).sort((a,b)=>a-b);
    return +q[q.length>>1].toFixed(1);
  });
  // The premise is not "60Hz" specifically -- it is that a vsync-locked display
  // delivers frames on the SCREEN's cadence, never on the game's, so the
  // delivered interval never approaches the 11ms the old climb-out demanded.
  // 16.7ms (60Hz) and 33.3ms (30Hz) both qualify; the second is the harder case.
  ck('the display paces frames well above the old 11ms climb-out', hz > 12,
     hz+'ms between frames — a game with any amount of headroom still reports '+
     'this, which is why measuring the interval could never see headroom');

  // Force the degraded state, the way one rough patch would, then leave the
  // game idling with plenty of headroom and see whether it ever comes back.
  await p.evaluate(()=>{ lowFx = true; fxGood = 0; fxAccum = 0; fxFrames = 0; });
  await sleep(3000);
  const after = await p.evaluate(()=>({ lowFx, fxGood }));
  ck('a degraded frame recovers once there is headroom again', after.lowFx===false,
     'left lowFx on for three seconds of an idle delve');

  // And it must still engage when the work is genuinely too heavy. Charge the
  // sampler with expensive frames rather than faking the flag.
  const engaged = await p.evaluate(async ()=>{
    lowFx=false; fxGood=0; fxAccum=0; fxFrames=0;
    const realDraw = draw;
    // A draw that costs more than the budget, which is the condition the
    // sampler exists to notice.
    draw = function(t){ const s=performance.now(); realDraw(t);
                        while(performance.now()-s < 20){} };
    await new Promise(r=>setTimeout(r,2500));
    draw = realDraw;
    return lowFx;
  });
  ck('and still sheds the glow when a frame is too dear', engaged===true,
     'a 20ms draw must trip it');

  // Back to cheap frames: it climbs out again rather than latching.
  await sleep(3000);
  const back = await p.evaluate(()=>lowFx);
  ck('and climbs back out afterwards', back===false, 'no latch, no flap');

  ck('no console errors', errs.length===0, errs.slice(0,3).join(' | '));
  console.log('\nPASS '+pass.length+'\n  '+pass.join('\n  '));
  console.log('\nFAIL '+fail.length+(fail.length?'\n  '+fail.join('\n  '):''));
  await b.close(); process.exit(fail.length?1:0);
})();
