#!/usr/bin/env node
/* Does the Phaser build boot, load the atlas, and animate?

   Served over http rather than opened as a file, because a WebGL context over
   file:// is refused on some builds -- which is also why the Termux workflow
   serves. A test that loaded the file directly could fall back to the Canvas
   renderer and pass while proving the opposite of what it claims.

   DESKTOP ONLY: needs Playwright + Chromium, which Termux cannot run.
   .cjs because this workspace is "type": "module" and this wants require().
   Run: npm run smoke
*/
const { chromium } = require('playwright');
const buildOnce = require('./build-once.cjs');
const { spawn } = require('child_process');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const pass=[],fail=[]; const ck=(n,ok,note)=>(ok?pass:fail).push((ok?'':'x ')+n+(note?'  ['+note+']':''));

(async()=>{
  buildOnce();                       // the suite must test src/, not a stale bundle
  const srv = spawn(process.execPath,
    [require('path').join(__dirname,'serve.js')],
    { env:{...process.env, PORT:'8137'}, stdio:'ignore' });
  await sleep(700);
  const b=await chromium.launch();
  const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  p.on('console',m=>{ if(m.type()==='error') errs.push(m.text()); });
  const bad=[]; p.on('response',r=>{ if(r.status()>=400) bad.push(r.status()+' '+r.url()); });

  await p.goto('http://localhost:8137/?scene=proving');
  await sleep(3500);

  const R = await p.evaluate(()=>{
    const g=window.__game;
    if(!g) return {booted:false};
    const sc=g.scene.getScene('proving');
    const tex=g.textures.get('art');
    const kids=sc && sc.bodies ? sc.bodies.getChildren() : [];
    const one=kids[0];
    return {
      booted:true,
      renderer: g.renderer.type === 2 ? 'WebGL' : (g.renderer.type===1?'Canvas':'unknown'),
      atlasFrames: tex ? tex.getFrameNames().length : 0,
      atlasW: tex && tex.source[0] ? tex.source[0].width : 0,
      bodies: kids.length,
      anims: sc ? sc.anims.anims.size : 0,
      playable: sc ? sc.playable.length : 0,
      playing: one ? !!(one.anims && one.anims.isPlaying) : false,
      frameNow: one && one.frame ? one.frame.name : null,
      hud: sc && sc.hud ? sc.hud.text.replace(/\n/g,' | ') : ''
    };
  });

  ck('the game boots', R.booted);
  ck('on the GPU renderer', R.renderer==='WebGL', R.renderer +
     ' — the whole reason for the move; Canvas here would mean no gain');
  ck('the atlas loads as one texture', R.atlasFrames>200 && R.atlasW===2048,
     R.atlasFrames+' frames in a '+R.atlasW+'px sheet');
  ck('every kind got a run cycle', R.playable>=9, R.playable+' kinds animating');
  ck('and the bodies are actually animating', R.playing && !!R.frameNow,
     'showing '+R.frameNow);
  ck('nothing 404d', bad.length===0, bad.slice(0,3).join(' | '));
  ck('no console errors', errs.length===0, errs.slice(0,3).join(' | '));

  // Load it up and see what it does.
  await p.evaluate(()=>{ const s=window.__game.scene.getScene('proving'); s.spawn(240); });
  await sleep(3000);
  const heavy = await p.evaluate(()=>{
    const s=window.__game.scene.getScene('proving');
    const st=s.log.stats();
    return { bodies:s.count, p50:st.p50, worst:st.worst };
  });
  ck('and holds up with three hundred bodies', heavy.p50 < 34,
     heavy.bodies+' bodies, median frame '+heavy.p50+'ms, worst '+heavy.worst+
     'ms (software GL here — a phone GPU is the real test)');

  // --- the diagnostics dump -------------------------------------------------
  // The point of it is a phone reporting numbers I cannot measure, so what
  // matters is that the block CONTAINS them, and that it still works when the
  // clipboard does not -- which is the common case, because the clipboard API
  // needs a secure context and a phone reaching another machine over plain
  // http is not one.
  const ctxHasClipboard = await p.evaluate(()=>!!(navigator.clipboard && window.isSecureContext));
  await p.click('#diagBtn');
  await sleep(300);
  const dump = await p.evaluate(async ()=>{
    const ta=document.querySelector('#diagOut textarea');
    if(ta && !document.querySelector('#diagOut').hidden) return ta.value;
    try { return await navigator.clipboard.readText(); } catch(e){ return '(unreadable)'; }
  });
  const wants = ['renderer','gpu','dpr','worst','over 20ms','buffer','bodies','fps'];
  const missing = wants.filter(k=>dump.indexOf(k)<0);
  ck('the diagnostics dump carries every field', missing.length===0,
     missing.length ? 'missing: '+missing.join(', ') : dump.split('\n').length+' lines');
  ck('and names the renderer it actually used', /renderer\s+WebGL/.test(dump),
     (dump.match(/renderer.*/)||[''])[0]);
  ck('and reports the worst frame, not just an average',
     /worst\s+[\d.]+ms in window, [\d.]+ms ever/.test(dump),
     (dump.match(/worst.*/)||[''])[0]);
  // Force the path a phone on a plain-http address takes.
  const fallback = await p.evaluate(async ()=>{
    document.querySelector('#diagOut').hidden = true;
    const real = navigator.clipboard;
    try { Object.defineProperty(navigator,'clipboard',{value:undefined,configurable:true}); }
    catch(e){}
    document.querySelector('#diagBtn').click();
    await new Promise(r=>setTimeout(r,200));
    const panel=document.querySelector('#diagOut');
    const shown = !panel.hidden && panel.querySelector('textarea').value.length > 100;
    try { Object.defineProperty(navigator,'clipboard',{value:real,configurable:true}); }
    catch(e){}
    return shown;
  });
  ck('and falls back to a selectable panel with no clipboard', fallback,
     'the phone case: the clipboard API needs a secure context');
  ck('the button is a thumb target', await p.evaluate(()=>{
       const r=document.querySelector('#diagBtn').getBoundingClientRect();
       return r.height>=44 && r.width>=44; }), 'at least 44px');

  await p.evaluate(()=>{ document.querySelector('#diagOut').hidden=true; });
  await p.screenshot({path:require('path').join(__dirname,'..','proving.png')});
  console.log('\nPASS '+pass.length+'\n  '+pass.join('\n  '));
  console.log('\nFAIL '+fail.length+(fail.length?'\n  '+fail.join('\n  '):''));
  await b.close(); srv.kill();
  process.exit(fail.length?1:0);
})();
