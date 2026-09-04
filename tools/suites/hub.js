/* Moved out of a scratch directory and into the repo.
 *
 * These suites were the entire safety net for a 14,000-line single file, and
 * they lived only in /tmp -- one container restart from gone, and certain to
 * go when the session that made them ended. The page they drive is found
 * relative to this file now instead of by an absolute path, so they run from
 * any clone, on a desktop or under Termux.
 */
// The gate-house is a tab bar over four stations now, and the kit is reachable
// two ways -- from the bar, and from the bag button inside a delve. Those two
// have to look different: a tab bar over a live run would offer to walk you
// out of a fight, which is not a thing the game lets you do.
const { chromium } = require('playwright');
// RIVENMARK_PAGE points the suite at a different page without touching its
// source. verify-core uses it to run the SAME file against index.html and
// against the extracted core; it used to rewrite the URL with a string
// replace, which silently stopped matching the moment this line changed.
const PAGE = f => process.env.RIVENMARK_PAGE ||
  ('file://' + require('path').join(__dirname, '..', '..', f));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const pass=[],fail=[]; const ck=(n,ok,note)=>(ok?pass:fail).push((ok?'':'x ')+n+(note?'  ['+note+']':''));
const shown = (p,sel) => p.$eval(sel, e=>e.classList.contains('on')).catch(()=>false);
const barUp = p => p.$eval('#hubtabs', e=>!e.hidden).catch(()=>false);
const selected = p => p.$$eval('#hubtabs .tab',
  ts => ts.filter(t=>t.getAttribute('aria-selected')==='true').map(t=>t.id));

(async()=>{
  const b=await chromium.launch();
  const p=await (await b.newContext({viewport:{width:390,height:844}})).newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await p.goto(PAGE('index.html')); await sleep(700);

  // ---- the display face ---------------------------------------------------
  // Embedded as a data URI, so there is nothing to fetch and nothing to fail
  // over a network -- but a malformed @font-face fails silently and the
  // headings quietly go back to being Palatino, which is exactly the thing
  // this was meant to fix.
  const face = await p.evaluate(async ()=>{
    await document.fonts.ready;
    const faces=[...document.fonts].map(f=>({fam:f.family, w:f.weight, st:f.status}));
    const el=document.querySelector('#splash .title');
    // Measured, not asserted: the same string in the display face and in the
    // fallback stack must not come out the same width, or the face is not
    // actually being used however confident the computed style is.
    const probe=(fam)=>{
      const d=document.createElement('span');
      d.style.cssText='position:absolute;visibility:hidden;white-space:pre;'+
        'font-size:80px;font-weight:800;font-family:'+fam;
      d.textContent='RIVENMARK';
      document.body.appendChild(d);
      const w=d.getBoundingClientRect().width; d.remove(); return w;
    };
    return { faces, applied:getComputedStyle(el).fontFamily.split(',')[0].replace(/["']/g,''),
             loaded:document.fonts.check('800 40px Cinzel'),
             wCinzel:probe("'Cinzel'"), wFallback:probe('Georgia,serif') };
  });
  ck('the display face is embedded and loaded', face.loaded,
     JSON.stringify(face.faces));
  ck('and it is a variable face covering the weights used',
     face.faces.some(f=>/Cinzel/.test(f.fam) && /400\s+900/.test(String(f.w))),
     JSON.stringify(face.faces));
  ck('headings resolve to it', face.applied==='Cinzel', face.applied);
  ck('and it is really rendering, not silently falling back',
     Math.abs(face.wCinzel-face.wFallback) > 8,
     'Cinzel '+Math.round(face.wCinzel)+'px vs fallback '+Math.round(face.wFallback)+'px');

  // ---- the materials ------------------------------------------------------
  // Every panel is dressed by a CSS custom property holding a forged data URI.
  // If forgeSurfaces() ever silently fails the interface does not break, it
  // just goes flat -- which is exactly the kind of regression nobody notices.
  const tex = await p.evaluate(()=>{
    const cs=getComputedStyle(document.documentElement);
    const out={};
    for(const k of ['wood','leather','stone','slate','parchment','bronze'])
      out[k]=(cs.getPropertyValue('--tex-'+k)||'').trim();
    for(const k of ['runes-h','runes-v','cracks','spatter','sigil'])
      out[k]=(cs.getPropertyValue('--'+k)||'').trim();
    const t0=performance.now(); forgeSurfaces(); const t1=performance.now();
    return { out, ms:+(t1-t0).toFixed(1) };
  });
  for (const k of ['wood','leather','stone','slate','parchment','bronze'])
    ck('the '+k+' is forged', /^url\(["']?data:image\/png/.test(tex.out[k]||''),
       (tex.out[k]||'missing').slice(0,24));
  // The tablet: a runic channel, cracks through the stone, what the last one
  // left on it, and the Aegis itself.
  for (const k of ['runes-h','runes-v','cracks','spatter','sigil'])
    ck('the '+k+' is forged', /^url\(["']?data:image\/png/.test(tex.out[k]||''),
       (tex.out[k]||'missing').slice(0,24));
  ck('the two rune bands differ', tex.out['runes-h']!==tex.out['runes-v'],
     'one is the other turned, and a shared band would tile the wrong way');
  ck('every surface is distinct',
     new Set(Object.values(tex.out)).size===Object.keys(tex.out).length,
     Object.keys(tex.out).length+' surfaces');
  ck('forging them is a boot cost, not a frame cost', tex.ms < 120, tex.ms+'ms');

  // A panel actually wearing one, rather than the property merely existing.
  const dressed = await p.evaluate(()=>
    getComputedStyle(document.querySelector('.hud')).backgroundImage);
  ck('the HUD wears its stone', /data:image\/png/.test(dressed),
     dressed.slice(0,40));

  // The splash is cut from the tablet, not from hide: an id rule for the old
  // leather ground outlived the redesign and beat the new class by
  // specificity, so the title card stayed brown while everything else moved.
  const splashBg = await p.evaluate(()=>
    getComputedStyle(document.getElementById('splash')).backgroundImage);
  ck('the title card is slate', /data:image\/png/.test(splashBg) &&
     !/rgba\(78, 52, 26/.test(splashBg), splashBg.slice(0,46));
  ck('and it fills the screen', await p.evaluate(()=>{
       const r=document.getElementById('splash').getBoundingClientRect();
       return Math.round(r.height)===window.innerHeight;
     }), 'a position on .tablet once beat .screen and shrank it to its content');

  // ---- the splash ---------------------------------------------------------
  ck('the game opens on the splash', await shown(p,'#splash'));
  ck('and the splash carries no tab bar', !(await barUp(p)));
  ck('the way in is one control', (await p.$$('#toGatehouse')).length===1);

  // `hidden` is an attribute and any display declaration overrides it. The bag
  // disc has its own display, so it drew over every menu screen while the code
  // believed it was hidden. Checked here, on the splash, where it is supposed
  // to be gone -- checking it mid-delve only proves it shows when it should.
  const hid = await p.evaluate(()=>{
    const b=document.getElementById('bagBtn');
    return { attr:b.hidden, display:getComputedStyle(b).display,
             box:b.getBoundingClientRect().height };
  });
  ck('a hidden control is actually not drawn',
     hid.attr && hid.display==='none' && hid.box===0, JSON.stringify(hid));

  await p.click('#toGatehouse'); await sleep(300);
  ck('entering lands on the delve', await shown(p,'#delve'));
  ck('the bar is up', await barUp(p));
  ck('and the delve tab is the one lit', (await selected(p)).join()==='toDelve');

  // ---- moving between stations without going back -------------------------
  const stations = [['toKit','#gear'],['toVendor','#vendor'],['toHall','#hall'],
                    ['toDelve','#delve']];
  for (const [tab,scr] of stations) {
    await p.click('#'+tab); await sleep(260);
    ck('the '+tab.slice(2).toLowerCase()+' tab opens its station',
       await shown(p,scr), scr);
    ck('...and lights only itself', (await selected(p)).join()===tab,
       (await selected(p)).join()||'none');
    ck('...with the bar still up', await barUp(p));
  }

  // Straight from one station to another, no splash in between: the whole
  // point of the bar.
  await p.click('#toHall'); await sleep(220);
  await p.click('#toKit');  await sleep(260);
  ck('a station reaches a station directly',
     await shown(p,'#gear') && !(await shown(p,'#splash')));

  // ---- the captions ------------------------------------------------------
  await p.evaluate(()=>{ stash.coins=4321; saveStash(); });
  await p.click('#toVendor'); await sleep(260);
  const caps = await p.evaluate(()=>({
    vendor: el.vendorLine.textContent, kit: el.kitLine.textContent,
    hall: el.hallLine.textContent, delve: ($('delveLine')||{}).textContent }));
  ck('the purse shows on the vendor tab', /4321/.test(caps.vendor), caps.vendor);
  ck('every tab carries a caption',
     [caps.vendor,caps.kit,caps.hall,caps.delve].every(t=>t&&t.trim()),
     JSON.stringify(caps));

  // ---- leaving -----------------------------------------------------------
  await p.click('#vendorBack'); await sleep(260);
  ck('leaving returns to the splash', await shown(p,'#splash'));
  ck('and takes the bar with it', !(await barUp(p)));

  // ---- the kit inside a delve is NOT a station ---------------------------
  await p.click('#toGatehouse'); await sleep(250);
  await p.click('#beginRun'); await sleep(600);
  ck('a run starts', await p.evaluate(()=>state)==='play');
  ck('no bar over a live delve', !(await barUp(p)));
  await p.click('#bagBtn'); await sleep(300);
  ck('the bag opens the kit', await shown(p,'#gear'));
  ck('but with no tab bar over it', !(await barUp(p)),
     'a bar here would offer to walk you out of a fight');
  ck('and its way out returns to the delve, not the gate-house',
     /delve/i.test(await p.$eval('#gearClose',e=>e.textContent)),
     await p.$eval('#gearClose',e=>e.textContent));
  await p.click('#gearClose'); await sleep(300);
  ck('closing it puts you back in the run', await p.evaluate(()=>state)==='play');

  // ---- the delve is cut from the same stone -------------------------------
  // The canvas HUD is drawn, not styled, so none of the CSS checks above touch
  // it. Sampled off the finished frame: slate is blue-grey and the dungeon
  // floor is warm brown, so a pixel that should be plate and is not comes back
  // red-dominant. That is exactly how the avatar's bar was found drawing its
  // "HELD" line onto the floor below its own plate.
  const canv = await p.evaluate(()=>{
    stash=blankStash(); saveStash(); startRun('isaac', LEVELS[8].id, 'riven');
    run.banner=0; run.tech=Math.round(LEVEL.quota*0.7);
    run.bossCalled=true; spawnBoss();
    for(let i=0;i<2;i++){ const L=newBody('lieutenant',player.x+120+i*40,player.y-80,0);
                          L.awake=true; enemies.push(L); }
    window.requestAnimationFrame=()=>0;
    syncHud(); draw(2);
    const d=view.dpr;
    const px=(x,y)=>{ const q=ctx.getImageData(Math.round(x*d),Math.round(y*d),1,1).data;
                      return {r:q[0],g:q[1],b:q[2]}; };
    const y0 = HUD_H + view.safeT + 8;
    // Sampled mid-width, where no glyph falls: the question is how far the
    // plate reaches, not what colour a letter is. A first cut sampled the
    // "HELD" text itself and measured antialiased gold rather than stone.
    const mx = view.w * 0.5;
    return {
      pattern: !!texPattern('slate'),
      // the row the notice and the pips are written on
      notice: px(mx, y0 + BOSS_BAR_H - 7),
      // and just past where the plate ends, which must be world again
      past:   px(mx, y0 + BOSS_BAR_H + 8),
      // The map's frame, and the map's own field. The old probe took one
      // pixel at a hand-counted `view.w - 22`, which is not the surround at
      // all -- it is a point INSIDE the map, and it passed only because the
      // field under the map is dark blue. It failed whenever a plotted
      // corridor happened to fall on that pixel, which is a coin toss per
      // delve. Both halves are sampled where they actually are now: the band
      // framePlate draws outside the panel, and the field inside it.
      band:   (() => { const bx = minimapBox();
                       return px(bx.x - 3, bx.y + bx.s * 0.5); })(),
      field:  (() => { const bx = minimapBox();
                       return px(bx.x + 3, bx.y + 3); })(),
      // and a patch of open floor, as the control
      floor:  px(mx, view.h * 0.62)
    };
  });
  const cool = c => c.b >= c.r;      // slate is blue-grey, the floor is brown
  ck('the canvas HUD is textured', canv.pattern,
     'texPattern returned nothing, so every plate drew flat');
  ck('the world is warm, as the control', !cool(canv.floor), JSON.stringify(canv.floor));
  ck('the avatar bar keeps its notice on its own plate', cool(canv.notice),
     JSON.stringify(canv.notice) + ' -- the row HELD and the pips are written on');
  ck('and the plate stops after it', !cool(canv.past),
     JSON.stringify(canv.past) + ' -- a plate that never ends is not a plate');
  // Bronze: bright and warm, r > g > b. The same band the gate-house plates
  // and the avatar's bar are framed with, which is the point -- the map is cut
  // from the same stone as everything else.
  const bronze = c => c.r > 100 && c.r > c.g && c.g > c.b;
  ck('the map is framed in the same bronze band as every other plate',
     bronze(canv.band), JSON.stringify(canv.band));
  ck('and its field is the dark one the corridors read against',
     cool(canv.field) && canv.field.b < 90, JSON.stringify(canv.field));

  ck('no console errors', errs.length===0, errs.slice(0,3).join(' | '));
  console.log('\nPASS '+pass.length+'\n  '+pass.join('\n  '));
  console.log('\nFAIL '+fail.length+(fail.length?'\n  '+fail.join('\n  '):''));
  await b.close(); process.exit(fail.length?1:0);
})();
