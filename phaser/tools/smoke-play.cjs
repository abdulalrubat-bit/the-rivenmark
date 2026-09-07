#!/usr/bin/env node
/* Can it actually be played?
 *
 * Booting and drawing are not the same as playable. This drags the stick and
 * checks the hero walks, presses an ability button and checks the core reacts,
 * and then MEASURES the layout: a control off the screen, under another
 * control, or too small for a thumb is broken however good the code behind it
 * is. The canvas build taught that repeatedly, and every time it was found by
 * measuring rather than by looking.
 *
 * DESKTOP ONLY (Playwright). Run: npm run smoke:play
 */
const { chromium } = require('playwright');
const buildOnce = require('./build-once.cjs');
const { spawn } = require('child_process');
const path=require('path');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const pass=[],fail=[]; const ck=(n,ok,note)=>(ok?pass:fail).push((ok?'':'x ')+n+(note?'  ['+note+']':''));
(async()=>{
  buildOnce();                       // the suite must test src/, not a stale bundle
  const srv=spawn(process.execPath,[require('path').join(__dirname,'serve.js')],
    {env:{...process.env,PORT:'8215'},stdio:'ignore'});
  await sleep(800);
  const b=await chromium.launch();
  const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await p.goto('http://localhost:8215/?nogate'); await sleep(3500);

  const before = await p.evaluate(()=>({x:player.x,y:player.y,hp:player.hp}));
  // Drag from the middle-left of the play area, well clear of the HUD.
  await p.mouse.move(120, 500); await p.mouse.down();
  for(let i=0;i<12;i++){ await p.mouse.move(120+i*6, 500); await sleep(40); }
  const held = await p.evaluate(()=>({active:stick.active, mv:moveVector()}));
  await sleep(900);
  const moved = await p.evaluate(()=>({x:player.x,y:player.y}));
  await p.mouse.up();
  await sleep(200);
  const released = await p.evaluate(()=>stick.active);

  ck('a drag takes the stick', held.active===true);
  ck('and it reads as a direction', Math.abs(held.mv.x)>0.2,
     'x '+held.mv.x.toFixed(2)+', y '+held.mv.y.toFixed(2));
  ck('the hero walks', Math.hypot(moved.x-before.x, moved.y-before.y) > 30,
     Math.round(Math.hypot(moved.x-before.x, moved.y-before.y))+' units');
  ck('and lets go on release', released===false);

  // The kit. Anchoring Strike builds a charge, which is the cheapest thing to
  // observe: no target needed for the press to be refused or accepted.
  const kit = await p.evaluate(async ()=>{
    player.gcd = 0; player.charges = 0; player.cds = {};
    // Stand a body next to the hero, on ground that is actually clear. Placed
    // blind at player.x+30 it can land in rock, where moveEntity shoves it out
    // past the bash's 62-unit reach -- and then the check fails for reasons
    // nothing to do with the button.
    let spot = null;
    for (let k = 0; k < 32 && !spot; k++) {
      const a = k * Math.PI * 2 / 16, d = 26 + ((k / 16) | 0) * 10;
      const x = player.x + Math.cos(a) * d, y = player.y + Math.sin(a) * d;
      if (!pointInWalls(x, y, 16) && clearShot(player.x, player.y, x, y)) spot = { x, y };
    }
    if (!spot) return { noSpot: true };
    const e = newBody('thrall', spot.x, spot.y, 0);
    e.awake = true; enemies.push(e); updateEnemies(0.001);
    // and prove the fixture before trusting what it measures
    const inReach = !!nearestBody(ABILITY_BY_ID.anchor.reach);
    const btn = document.querySelector('#hud .kit button[data-id="anchor"]');
    if (!btn) return { noBtn: true };
    btn.dispatchEvent(new PointerEvent('pointerdown', {bubbles:true}));
    await new Promise(r=>setTimeout(r,60));
    return { charges: player.charges, gcd: +(player.gcd||0).toFixed(2),
             // The beat this ability asks for, not a number typed in here.
             // It used to be "> 1", which stopped being true the moment the
             // primary was put on a shorter beat than the rest of the bar --
             // and the fixture then reported a passing build as broken.
             wants: +(GCD_TIME * ABILITY_BY_ID.anchor.gcd).toFixed(2),
             hurt: e.hp < e.maxHp, inReach };
  });
  ck('the fixture put a body in reach', !kit.noBtn && !kit.noSpot && kit.inReach,
     kit.noSpot ? 'NO CLEAR GROUND — the press would prove nothing' : '');
  ck('an ability button casts', !kit.noBtn && kit.charges===1,
     kit.noBtn ? 'no button in the DOM' : 'built '+kit.charges+' charge, gcd '+kit.gcd);
  ck('and the blow lands', !kit.noBtn && kit.hurt);
  ck('and it starts the beat the ability asks for',
     !kit.noBtn && kit.gcd > kit.wants - 0.12 && kit.gcd <= kit.wants,
     'gcd ' + kit.gcd + ' of ' + kit.wants + 's');

  const hud = await p.evaluate(()=>({
    life: document.querySelector('#hud .life b').textContent,
    slag: document.querySelector('#hud .slag').textContent,
    pips: document.querySelectorAll('#hud .pip').length,
    buttons: document.querySelectorAll('#hud .kit button').length,
    swap: !!document.querySelector('#hud .swap button')
  }));
  ck('the HUD shows the run', /\d+ \/ \d+/.test(hud.life) && /slag/.test(hud.slag),
     hud.life+'   '+hud.slag);
  /* A cooldown you can read without reading.
   *
   * It used to replace the ability's mark with a number, which took away the
   * one thing that says WHICH ability this is at exactly the moment you are
   * waiting for it. The mark stays now and the time is a wedge draining round
   * the button. So: the marks survive a cooldown, and the wedge actually
   * tracks it.
   */
  const wedge = await p.evaluate(async () => {
    const btns = () => [...document.querySelectorAll('#hud .kit button')];
    const marksIdle = btns().map(b => b.querySelector('.mark').textContent).join('');
    /* Cast an ability with a REAL cooldown of its own -- Isaac's first two are
     * cd 0 and gated by the beat alone, so firing one of those never put a
     * number where a mark had been and the check could not see the thing it
     * is about. `mass` is 12 seconds. */
    const own = ABILITIES[player.hero].find(a => a.cd > 0) || ABILITIES[player.hero][0];
    player.charges = CHARGE_MAX; player.tension = TENSION_MAX;  // cost is not the blocker
    player.gcd = 0;                                             // nor the beat
    const why = abilityBlock(own);
    castAbility(own.id);
    await new Promise(r => setTimeout(r, 220));
    const hot = btns().map(b => +(b.style.getPropertyValue('--cd') || 0));
    const marksHot = btns().map(b => b.querySelector('.mark').textContent).join('');
    await new Promise(r => setTimeout(r, 700));
    const later = btns().map(b => +(b.style.getPropertyValue('--cd') || 0));
    // Did anything actually go on its own cooldown? Without this the check
    // passes on a kit where nothing was cooling, which is no check at all.
    const cooled = ABILITIES[player.hero].some(a => a.cd > 0 && (player.cds || {})[a.id] > 0);
    return { marksIdle, marksHot, hot, later, cooled, tried: own.id, why: why || 'nothing' };
  });
  ck('an ability keeps its mark while it cools',
     wedge.marksHot === wedge.marksIdle && wedge.marksIdle.length >= 3 && wedge.cooled,
     'idle "' + wedge.marksIdle + '" vs cooling "' + wedge.marksHot + '"' +
     (wedge.cooled ? ' (' + wedge.tried + ' cooling)'
                   : ' — ' + wedge.tried + ' never went on cooldown, blocked by "' +
                     wedge.why + '", so this proves nothing'));
  ck('and the wedge drains as it does',
     wedge.hot.every(v => v > 0.2) && wedge.later.every((v, i) => v < wedge.hot[i]),
     'just cast ' + wedge.hot.join(' ') + '  ->  0.7s later ' + wedge.later.join(' '));

  ck('with a button for every ability and a swap',
     hud.buttons===5 && hud.swap && hud.pips===3,
     hud.buttons+' buttons, '+hud.pips+' charge pips');
  // Layout, measured. The canvas build taught this the hard way more than
  // once: a control that is off the screen, under another control, or too
  // small for a thumb is broken however good the code behind it is.
  const lay = await p.evaluate(()=>{
    const vw = innerWidth, vh = innerHeight;
    const r = el => { const b = el.getBoundingClientRect();
                      return {x:b.x,y:b.y,w:b.width,h:b.height,r:b.right,b:b.bottom}; };
    const btns = [...document.querySelectorAll('#hud .kit button')].map(r);
    const swap = r(document.querySelector('#hud .swap button'));
    const diag = r(document.querySelector('#diagBtn'));
    const res  = document.querySelector('#hud .res').children.length
                 ? r(document.querySelector('#hud .res')) : null;
    return { vw, vh, btns, swap, diag, res };
  });
  const onScreen = b => b.x >= 0 && b.y >= 0 && b.r <= lay.vw + 0.5 && b.b <= lay.vh + 0.5;
  const hits = (a,b) => a.x < b.r && b.x < a.r && a.y < b.b && b.y < a.b;
  ck('every kit button is on the screen', lay.btns.every(onScreen),
     lay.btns.filter(b=>!onScreen(b)).length + ' of ' + lay.btns.length + ' off a ' +
     lay.vw + 'x' + lay.vh + ' screen');
  ck('and big enough for a thumb', lay.btns.every(b=>b.w>=44&&b.h>=44),
     Math.round(lay.btns[0].w) + 'px');
  ck('the swap is on screen and clear of the kit',
     onScreen(lay.swap) && !lay.btns.some(b=>hits(b, lay.swap)));
  ck('and nothing sits under the diagnostics button',
     !lay.btns.some(b=>hits(b, lay.diag)) && !hits(lay.swap, lay.diag),
     'diag at ' + Math.round(lay.diag.x) + ',' + Math.round(lay.diag.y));
  ck('the resource meter is on screen', !lay.res || onScreen(lay.res));

  ck('no console errors', errs.length===0, errs.slice(0,3).join(' | '));

  await p.screenshot({path:path.join(__dirname,'..','playable.png')});
  console.log('\nPASS '+pass.length+'\n  '+pass.join('\n  '));
  console.log('\nFAIL '+fail.length+(fail.length?'\n  '+fail.join('\n  '):''));
  await b.close(); srv.kill(); process.exit(fail.length?1:0);
})();
