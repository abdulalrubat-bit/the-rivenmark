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

  const roles = await p.evaluate(()=>{
    stash=blankStash(); saveStash();
    startRun('isaac', LEVELS[10].id, 'riven');
    const seen={};
    for(const e of enemies) seen[e.kind]=e.role;
    return { seen, types: Object.fromEntries(
      Object.entries(ENEMY_TYPES).map(([k,v])=>[k,v.role])) };
  });
  ck('every kind declares a role',
     Object.values(roles.types).every(Boolean), JSON.stringify(roles.types));
  ck('placed bodies carry it', Object.entries(roles.seen).every(
       ([k,v])=>v===roles.types[k]), JSON.stringify(roles.seen));

  // ---- the flanker refuses the front -------------------------------------
  // Over one placement this says nothing: a flanker with rock where its mark
  // would go presses straight in, which is the right answer and not a failure.
  // Compare the populations instead.
  // Paired, not two independent samples. Both kinds are run from the *same*
  // spawn point on the same cut, so the map's own variance cancels instead of
  // swamping the difference being measured -- unpaired, the medians wandered
  // enough that a 2.5x bar failed on maps where nothing was wrong.
  const approach = await p.evaluate(()=>{
    startRun('isaac', LEVELS[10].id, 'riven');
    const runOne = (kind, px, py, sx, sy) => {
      enemies.length=0;
      player.x=px; player.y=py;
      const e=newBody(kind, sx, sy, 0); e.awake=true; enemies.push(e);
      const a0=Math.atan2(e.y-player.y, e.x-player.x);
      let sw=0, closed=false;
      for(let i=0;i<60*8;i++){
        updateEnemies(1/60);
        const a=Math.atan2(e.y-player.y, e.x-player.x);
        let da=a-a0; while(da>Math.PI)da-=TAU; while(da<-Math.PI)da+=TAU;
        sw=Math.max(sw,Math.abs(da));
        if(Math.hypot(e.x-player.x,e.y-player.y)<60){closed=true;break;}
      }
      return {sw:sw*57, closed};
    };
    // Pairs from several cuts, not one. Pairing killed the noise in "is the
    // flanker wider" -- both kinds run from the same spot -- but how many of
    // them find room to go round at all is a property of the map, and drawing
    // every pair from a single cut made that all-or-nothing: 17/32 on one, 9
    // on the next, with nothing different in between.
    const f=[], pr=[];
    const CUTS = 4, PER = 8;
    for(let cut=0; cut<CUTS; cut++){
      if(cut) startRun('isaac', LEVELS[10+cut].id, 'riven');
      for(let t=0;t<40 && f.length < (cut+1)*PER;t++){
      const pc = openCells[(Math.random()*openCells.length)|0];
      let sx=0, sy=0, ok=false;
      for(let k=0;k<20 && !ok;k++){
        const a=Math.random()*TAU;
        const x=pc.x+Math.cos(a)*300, y=pc.y+Math.sin(a)*300;
        if(x<40||y<40||x>WORLD.w-40||y>WORLD.h-40) continue;
        if(pointInWalls(x,y,20)) continue;
        if(!clearShot(pc.x,pc.y,x,y)) continue;
        sx=x; sy=y; ok=true;
      }
      if(!ok) continue;
      f.push(runOne('eclipse', pc.x, pc.y, sx, sy));
      pr.push(runOne('thrall',  pc.x, pc.y, sx, sy));
      }
    }
    const med=a=>a.slice().sort((x,y)=>x-y)[a.length>>1];
    // the per-pair difference, which is what "wider" actually means
    const wider = f.filter((o,i)=>o.sw > pr[i].sw + 10).length;
    return { n:f.length, fMed:Math.round(med(f.map(o=>o.sw))),
             pMed:Math.round(med(pr.map(o=>o.sw))),
             fWide:f.filter(o=>o.sw>45).length,
             pWide:pr.filter(o=>o.sw>45).length,
             fClosed:f.filter(o=>o.closed).length,
             pClosed:pr.filter(o=>o.closed).length, wider };
  });
  ck('flankers come in wider than pressers',
     approach.wider >= approach.n * 0.5,
     approach.wider+'/'+approach.n+' pairs swung wider from the same spot; '+
     'medians '+approach.fMed+'\u00b0 vs '+approach.pMed+'\u00b0');
  // How many find room to flank is a property of the map, not the code: on a
  // tight cut fewer of them get a clear mark and press instead, which is
  // correct. The bar has to sit below the whole spread, not inside it -- at
  // 0.45 it was inside, and a run that came in at 14/32 (43.8%) failed for
  // being at the low end of a statistic rather than for anything being wrong.
  // Measured over four consecutive cuts: 14, 17, 19, 22 of 32.
  ck('most of them go properly round the side',
     approach.fWide >= approach.n * 0.35,
     approach.fWide+'/'+approach.n+' swung past 45\u00b0 (pressers '+approach.pWide+')');
  ck('and a flanker still arrives', approach.fClosed >= approach.n * 0.8,
     approach.fClosed+'/'+approach.n+' closed (pressers '+approach.pClosed+')');

  // ---- the anchor holds ground -------------------------------------------
  const ANCHOR_GUARD_T = await p.evaluate(()=>ANCHOR_GUARD);
  const anchor = await p.evaluate(()=>{
    startRun('isaac', LEVELS[10].id, 'riven');
    enemies.length=0;
    // A mouth score: the cell's own walls plus its tightest neighbour's. A
    // heavy body cannot stand in a corridor, so this is the ground it can
    // actually hold -- measured over 130 placements it rises 0.42 -> 1.00,
    // better in 58% of them and worse in none.
    const mouth=(x,y)=>{ let best=0;
      if(cellAt(x+1,y)!==SOLID)best=Math.max(best,narrowGrid[gi(x+1,y)]);
      if(cellAt(x-1,y)!==SOLID)best=Math.max(best,narrowGrid[gi(x-1,y)]);
      if(cellAt(x,y+1)!==SOLID)best=Math.max(best,narrowGrid[gi(x,y+1)]);
      if(cellAt(x,y-1)!==SOLID)best=Math.max(best,narrowGrid[gi(x,y-1)]);
      return narrowGrid[gi(x,y)]+best; };
    const nAt=(x,y)=>mouth(Math.floor(x/CELL_W),Math.floor(y/CELL_W));
    // average over placements: one draw can legitimately find nothing better
    let born=0, post2=0, n=0;
    for(let i=0;i<120;i++){
      const q=openCells[(Math.random()*openCells.length)|0];
      if(pointInWalls(q.x,q.y,25)) continue;
      const t=newBody('breaker',q.x,q.y,0); takePost(t);
      born+=nAt(q.x,q.y); post2+=nAt(t.postX,t.postY); n++;
    }
    let c = openCells[(Math.random()*openCells.length)|0];
    for(let i=0;i<400 && pointInWalls(c.x,c.y,25);i++)
      c = openCells[(Math.random()*openCells.length)|0];
    const e = newBody('breaker', c.x, c.y, 0); e.awake=true; enemies.push(e);
    updateEnemies(1/60);
    const post = { x: e.postX, y: e.postY };
    const tookNarrower = post2/n > born/n;
    // Walk the player well outside the leash; it must not follow. Push away
    // from whichever edge has room -- clamping a fixed +900 into the world can
    // land the player back inside ANCHOR_GUARD, and then not following would
    // be the bug.
    const away = post.x > WORLD.w/2 ? -1 : 1;
    player.x = clamp(post.x + away*900, 60, WORLD.w-60);
    player.y = post.y;
    const outside = Math.hypot(player.x-post.x, player.y-post.y);
    for(let i=0;i<60*10;i++) updateEnemies(1/60);
    const drift = Math.hypot(e.x-post.x, e.y-post.y);
    // bring the player into its guard; it must come to meet them
    player.x = post.x + 200; player.y = post.y;
    let moved=0;
    for(let i=0;i<60*4;i++){ const bx=e.x; updateEnemies(1/60); moved+=Math.abs(e.x-bx); }
    return { tookNarrower, drift, moved, outside,
             postNarrow: +(post2/n).toFixed(2), bornNarrow: +(born/n).toFixed(2) };
  });
  ck('an anchor takes tighter ground than where it woke',
     anchor.tookNarrower, 'mouth score '+anchor.bornNarrow+' -> '+anchor.postNarrow);
  ck('it does not chase you across the delve',
     anchor.outside > ANCHOR_GUARD_T && anchor.drift < ANCHOR_GUARD_T + 20,
     Math.round(anchor.drift)+' units off its post, player '+
     Math.round(anchor.outside)+' away');
  ck('but it steps out to meet you inside its guard', anchor.moved > 20,
     Math.round(anchor.moved)+' units of travel');

  // ---- bracing ------------------------------------------------------------
  const brace = await p.evaluate(()=>{
    enemies.length=0;
    const c=openCells[(Math.random()*openCells.length)|0];
    const e=newBody('breaker', c.x, c.y, 0); e.awake=true; e.braced=false;
    e.guard=BRACE_DOWN; e.hp=e.maxHp=1e6; enemies.push(e);
    player.x=c.x+120; player.y=c.y;
    let up=0, down=0, flips=0, was=e.braced;
    for(let i=0;i<60*12;i++){ updateEnemies(1/60);
      if(e.braced!==was){flips++; was=e.braced;}
      if(e.braced) up++; else down++; }
    // damage through the guard
    e.braced=true; const h0=e.hp; damageEnemy(e,1000);
    const soaked=h0-e.hp;
    e.braced=false; const h1=e.hp; damageEnemy(e,1000);
    const open=h1-e.hp;
    // and it cannot advance while braced
    e.braced=true; player.x=c.x+150; player.y=c.y;
    const bx=e.x, by=e.y;
    for(let i=0;i<60*1.5;i++) updateEnemies(1/60);
    return { flips, up:up/60, down:down/60, soaked, open,
             rooted: Math.hypot(e.x-bx, e.y-by) < 8 };
  });
  ck('the guard goes up and down on a rhythm', brace.flips>=4,
     brace.flips+' changes in 12s ('+brace.up.toFixed(1)+'s up, '+
     brace.down.toFixed(1)+'s open)');
  ck('a braced anchor eats most of a blow', brace.soaked < brace.open*0.4,
     Math.round(brace.soaked)+' through the guard vs '+Math.round(brace.open)+' open');
  ck('and cannot advance while it holds it', brace.rooted);

  // ---- the flayer visits, it does not stay --------------------------------
  // Its contract is a shape over time, not a position: hold off, cross in one
  // run, cut, and leave again. Measured as the distance trace, because "did it
  // hit" alone would also pass for a body that simply walked in and stayed.
  const stalkR = await p.evaluate(()=>{
    startRun('isaac', LEVELS[10].id, 'riven');
    // A flayer needs room on BOTH sides: it runs through you and out again, so
    // an arena open all the way round is the only place the role can show what
    // it does. A corridor pins it against rock after the first pass and it
    // makes two cuts instead of seven -- which is correct behaviour and would
    // be reported here as the role failing. Search several cuts for one.
    let site=null;
    for(let cut=0; cut<4 && !site; cut++){
      if(cut) startRun('isaac', LEVELS[10+cut].id, 'riven');
      for(let t=0;t<4000 && !site;t++){
        const q=openCells[(Math.random()*openCells.length)|0];
        if(pointInWalls(q.x,q.y,150)) continue;      // room to be run past
        for(let k=0;k<24 && !site;k++){
          const ang=Math.random()*TAU;
          const ex=q.x+Math.cos(ang)*STALK_HOLD, ey=q.y+Math.sin(ang)*STALK_HOLD;
          if(ex<60||ey<60||ex>WORLD.w-60||ey>WORLD.h-60) continue;
          if(pointInWalls(ex,ey,70)) continue;       // and room to lurk in
          if(!clearShot(q.x,q.y,ex,ey)) continue;
          site={px:q.x,py:q.y,ex,ey};
        }
      }
    }
    // A search that finds nothing has to fail, not pass on its default.
    if(!site) return {noSite:true};
    enemies.length=0;
    player.x=site.px; player.y=site.py; player.hp=player.maxHp=1e6; player.bleed=0;
    const e=newBody('flayer', site.ex, site.ey, 0);
    e.awake=true; e.lurk=0.05; enemies.push(e);
    const trace=[]; let hits=0, wounded=0, gaps=0, far=true;
    for(let i=0;i<60*14;i++){
      const b=player.hp;
      updateEnemies(1/60);
      if(player.hp<b) hits++;
      if(player.bleed>0) wounded++;
      player.invuln=0;             // never let i-frames hide a second pass
      const d=Math.hypot(e.x-player.x,e.y-player.y);
      trace.push(d);
      // Every cut has to be separated by real ground given back.
      if(!far && d > STALK_HOLD*0.6){ far=true; gaps++; }
      else if(far && d < e.r+player.r+20) far=false;
    }
    // A pass is a cut, which is unambiguous -- counting local minima in the
    // distance trace needed a re-arm threshold, and any threshold above the
    // role's own hold band (STALK_HOLD*0.7) reports one pass however many it
    // actually made. `hits` is the count; what has to be checked separately is
    // that it went back out in between rather than grinding in melee.
    const near=trace.filter(d=>d<e.r+player.r+20).length;
    return { hits, wounded, near, n:trace.length, gaps,
             min:Math.round(Math.min(...trace)), max:Math.round(Math.max(...trace)) };
  });
  ck('a flayer finds ground to work with', !stalkR.noSite);
  ck('it comes in more than once in fourteen seconds', stalkR.hits>=3,
     stalkR.hits+' cuts, closest '+stalkR.min+', furthest '+stalkR.max);
  ck('and pulls back out between passes', stalkR.gaps>=2,
     stalkR.gaps+' withdrawals past '+'60% of its hold');
  ck('and it does not settle into melee',
     stalkR.near < stalkR.n*0.35,
     stalkR.near+'/'+stalkR.n+' frames within reach');
  ck('every pass opens a wound', stalkR.hits>0 && stalkR.wounded>0,
     stalkR.hits+' cuts, bleeding on '+stalkR.wounded+' frames');

  // ---- the shaman never comes forward --------------------------------------
  const chantR = await p.evaluate(()=>{
    startRun('isaac', LEVELS[10].id, 'riven');
    // Both ends open AND a clear line between them. A chanter with rock in the
    // way correctly casts nothing, so a fixture that only checks the player's
    // cell measures the map and reports it as the role failing.
    let site=null;
    for(let t=0;t<4000 && !site;t++){
      const q=openCells[(Math.random()*openCells.length)|0];
      if(pointInWalls(q.x,q.y,60)) continue;
      for(let k=0;k<24 && !site;k++){
        const ang=Math.random()*TAU;
        const ex=q.x+Math.cos(ang)*CHANT_WANT*0.9, ey=q.y+Math.sin(ang)*CHANT_WANT*0.9;
        if(ex<60||ey<60||ex>WORLD.w-60||ey>WORLD.h-60) continue;
        if(pointInWalls(ex,ey,40)) continue;
        if(!clearShot(q.x,q.y,ex,ey)) continue;
        site={px:q.x,py:q.y,ex,ey};
      }
    }
    if(!site) return {noSite:true};
    enemies.length=0; hazards.length=0; run.gloom=0;
    player.x=site.px; player.y=site.py; player.hp=player.maxHp=1e6;
    const e=newBody('shaman', site.ex, site.ey, 0);
    e.awake=true; e.chant=0.05; enemies.push(e);
    // Count the objects, not the array length: a pool expiring on the same
    // frame another lands leaves the length unchanged and hides a cast.
    const seenHaz=new Set();
    let glooms=0, closest=1e9, contact=0, wasG=0;
    for(let i=0;i<60*20;i++){
      updateEnemies(1/60); updateHazards(1/60); updateGloom(1/60);
      for(const h of hazards) seenHaz.add(h);
      if(run.gloom>wasG+0.5) glooms++;
      wasG=run.gloom;
      const d=Math.hypot(e.x-player.x,e.y-player.y);
      closest=Math.min(closest,d);
      if(d<e.r+player.r+6) contact++;
    }
    return { fires:seenHaz.size, glooms, closest:Math.round(closest), contact,
             dmg:e.dmg, want:CHANT_WANT, keptBack: closest > CHANT_WANT*0.4 };
  });
  ck('a shaman finds ground to work with', !chantR.noSite);
  ck('it never closes to melee', chantR.contact===0 && chantR.keptBack,
     'closest approach '+chantR.closest+' of a wanted '+chantR.want+
     '; touch frames '+chantR.contact);
  ck('it carries no melee of its own', chantR.dmg===0, 'dmg '+chantR.dmg);
  ck('it alternates fire and gloom rather than repeating one',
     chantR.fires>=2 && chantR.glooms>=2 && Math.abs(chantR.fires-chantR.glooms)<=1,
     chantR.fires+' ember pools, '+chantR.glooms+' castings of gloom');

  // ---- the gorger opens the ground it lands on -----------------------------
  // The slam itself is the lieutenant's, already covered; what is new is that
  // a gorger's leaves the floor burning, so the corridor it chose costs you
  // something after the blow has landed.
  const frac = await p.evaluate(()=>{
    startRun('isaac', LEVELS[10].id, 'riven');
    let c=null;
    for(let t=0;t<3000 && !c;t++){
      const q=openCells[(Math.random()*openCells.length)|0];
      if(!pointInWalls(q.x,q.y,90)) c=q;
    }
    if(!c) return {noSite:true};
    const land = (kind)=>{
      enemies.length=0; slams.length=0; hazards.length=0; props.length=0;
      player.x=c.x+400; player.y=c.y;                 // well clear of the blow
      player.hp=player.maxHp=1e6;
      const e=newBody(kind, c.x, c.y, 0); e.awake=true; enemies.push(e);
      // Commit the blow directly rather than waiting for the AI to choose it.
      slams.push({ x:c.x, y:c.y, r:e.r*(e.slamR||1.4), dmg:e.dmg, t:0, wind:0.5,
                   fracture:!!e.fracture, hue:e.color });
      for(let i=0;i<60*2;i++) updateSlams(1/60);
      return { hazards:hazards.length, rubble:props.filter(p=>p.kind==='rubble').length,
               hazLife:hazards.length?+hazards[0].life.toFixed(1):0,
               hazR:hazards.length?Math.round(hazards[0].r):0 };
    };
    const g=land('gorger'); const t=land('thrall');
    return { g, t, fracLife:FRACTURE_LIFE, fracDps:FRACTURE_DPS };
  });
  ck('a gorger finds ground to work with', !frac.noSite);
  ck('its slam leaves the floor burning', frac.g.hazards===1,
     frac.g.hazards+' pools, r '+frac.g.hazR+', '+frac.g.hazLife+'s left of '+frac.fracLife);
  ck('and leaves rubble where it broke', frac.g.rubble===6, frac.g.rubble+' pieces');
  ck('a body without the fracture leaves neither',
     frac.t.hazards===0 && frac.t.rubble===0,
     frac.t.hazards+' pools, '+frac.t.rubble+' rubble');

  ck('no console errors', errs.length===0, errs.slice(0,3).join(' | '));
  console.log('\nPASS '+pass.length+'\n  '+pass.join('\n  '));
  console.log('\nFAIL '+fail.length+(fail.length?'\n  '+fail.join('\n  '):''));
  await b.close(); process.exit(fail.length?1:0);
})();
