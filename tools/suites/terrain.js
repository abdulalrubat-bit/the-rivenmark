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
  await p.evaluate(()=>{
    window.requestAnimationFrame = () => 0;
    // A cut is not guaranteed to hold any one kind, so tests ask for the
    // scenery they need and delves are recut until one does.
    window.withProp = (kind) => {
      for (let t=0; t<25; t++) {
        startRun('isaac', LEVELS[20].id, 'riven');
        const pr = propGrid.find(o=>o.kind===kind);
        if (pr) return pr;
      }
      return null;
    };
  });

  // One cut need not contain both kinds -- some delves get no barrels at all --
  // so sample a spread and ask what is reachable rather than what one map drew.
  const setup = await p.evaluate(()=>{
    stash=blankStash(); saveStash();
    const kinds = new Set();
    let none = 0, tot = 0, brk = 0, whole = true;
    for (let i=0;i<12;i++){
      startRun('isaac', LEVELS[(i*4)%LEVELS.length].id, 'riven');
      propGrid.forEach(p=>kinds.add(p.kind));
      if (!propGrid.length) none++;
      tot += props.length; brk += propGrid.length;
      if (!propGrid.every(p=>p.hp>0 && !p.gone)) whole = false;
    }
    return { kinds: [...kinds].sort(), none, avgTot: Math.round(tot/12),
             avgBrk: Math.round(brk/12), whole };
  });
  ck('every delve has scenery you can break', setup.none===0,
     setup.avgBrk+' breakable of '+setup.avgTot+' props on average');
  ck('and only the right kinds', setup.kinds.join(',')==='barrel,pillar',
     setup.kinds.join(','));
  ck('all of it starts whole', setup.whole);

  // ---- a barrel ----------------------------------------------------------
  const barrel = await p.evaluate(()=>{
    const pr = withProp('barrel');
    if(!pr) return {skip:true};
    slams.length=0; hazards.length=0; enemies.length=0;
    // a body standing next to it, and the player well clear
    const t = newBody('thrall', pr.x+30, pr.y, 0); t.awake=true;
    t.hp=t.maxHp=100000; enemies.push(t);
    player.x = pr.x + 600; player.y = pr.y;
    player.hp = player.maxHp = 100000; player.invuln = 0;
    enemyGrid.clear(); enemyGrid.insert(t, t.x, t.y);
    hurtProp(pr, 9999);
    const lit = { gone: pr.gone, fuse: slams.length===1,
                  isBarrel: slams[0] && !!slams[0].barrel };
    const h0 = t.hp;
    // nothing happens during the fuse
    for(let i=0;i<Math.floor(60*(BARREL_FUSE-0.15));i++) updateSlams(1/60);
    const early = t.hp < h0;
    for(let i=0;i<20;i++) updateSlams(1/60);
    return { ...lit, early, hurt: h0 - t.hp, fire: hazards.length,
             fuse_s: BARREL_FUSE };
  });
  ck('a barrel can be broken', !barrel.skip && barrel.gone);
  ck('breaking one lights a fuse rather than going off at once',
     !barrel.skip && barrel.fuse && barrel.isBarrel && !barrel.early, barrel.fuse_s+'s');
  ck('then it takes what is standing near it', !barrel.skip && barrel.hurt>0,
     Math.round(barrel.hurt)+' damage to a body beside it');
  ck('and leaves the ground burning', !barrel.skip && barrel.fire>0, barrel.fire+' fires');

  // ---- it does not take sides --------------------------------------------
  const own = await p.evaluate(()=>{
    const pr = withProp('barrel');
    if(!pr) return {skip:true};
    slams.length=0; hazards.length=0; enemies.length=0;
    player.x=pr.x; player.y=pr.y; player.invuln=0;
    player.hp=player.maxHp=100000;
    const hp0=player.hp;
    hurtProp(pr, 9999);
    for(let i=0;i<Math.ceil(60*(BARREL_FUSE+0.4));i++) updateSlams(1/60);
    const stood = hp0-player.hp;
    // and standing clear of it is free
    const pr2 = withProp('barrel');
    if(!pr2) return {skip:true};
    slams.length=0; hazards.length=0;
    player.x=pr2.x+BARREL_R+60; player.y=pr2.y; player.invuln=0;
    player.hp=player.maxHp=100000;
    const hp1=player.hp;
    hurtProp(pr2, 9999);
    for(let i=0;i<Math.ceil(60*(BARREL_FUSE+0.4));i++) updateSlams(1/60);
    return { stood, clear: hp1-player.hp };
  });
  ck('standing in your own blast costs you', !own.skip && own.stood>0,
     Math.round(own.stood)+' damage');
  ck('stepping out of it does not', !own.skip && own.clear===0, 'reach '+
     (await p.evaluate(()=>BARREL_R))+' units');

  // ---- pitch spreads ------------------------------------------------------
  const chain = await p.evaluate(()=>{
    const pr = withProp('barrel');
    if(!pr) return {skip:true};
    slams.length=0; hazards.length=0;
    player.x=pr.x+900; player.y=pr.y; player.hp=player.maxHp=1e6;
    // plant a neighbour inside the blast
    const nb = { x: pr.x+60, y: pr.y, q:0, kind:'barrel', hp:PROP_HP.barrel,
                 gone:false, shake:0 };
    props.push(nb); propGrid.push(nb);
    hurtProp(pr, 9999);
    for(let i=0;i<Math.ceil(60*(BARREL_FUSE+0.2));i++) updateSlams(1/60);
    return { neighbourLit: nb.gone, fuses: slams.filter(s=>s.barrel).length };
  });
  ck('pitch takes its neighbours with it', !chain.skip && chain.neighbourLit);

  // ---- a pillar comes down at once ---------------------------------------
  const pillar = await p.evaluate(()=>{
    const pr = withProp('pillar');
    if(!pr) return {skip:true};
    slams.length=0; enemies.length=0;
    const t = newBody('thrall', pr.x+30, pr.y, 0); t.awake=true;
    t.hp=t.maxHp=100000; enemies.push(t);
    enemyGrid.clear(); enemyGrid.insert(t, t.x, t.y);
    player.x=pr.x+900; player.y=pr.y; player.hp=player.maxHp=1e6;
    const h0=t.hp, rub0=props.filter(o=>o.kind==='rubble').length;
    hurtProp(pr, 9999);
    const marked = slams.length===1 && !!slams[0].pillar;
    // shorter warning than a barrel's, but a warning
    const early = (()=>{ const hp=t.hp;
      for(let i=0;i<Math.floor(60*(PILLAR_FUSE-0.15));i++) updateSlams(1/60);
      return t.hp < hp; })();
    for(let i=0;i<20;i++) updateSlams(1/60);
    return { gone: pr.gone, marked, early, hurt: h0-t.hp,
             rubble: props.filter(o=>o.kind==='rubble').length - rub0,
             quicker: PILLAR_FUSE < BARREL_FUSE,
             tougher: PROP_HP.pillar > PROP_HP.barrel };
  });
  ck('a pillar takes more breaking than a barrel', pillar.tougher,
     PROP_HP_note(pillar));
  ck('and it leans before it goes',
     !pillar.skip && pillar.gone && pillar.marked && !pillar.early);
  ck('but not for as long as a barrel', pillar.quicker,
     PILLAR_FUSE_note());
  ck('crushing what stood under it', !pillar.skip && pillar.hurt>0,
     Math.round(pillar.hurt)+' damage');
  ck('and leaving rubble where it stood', !pillar.skip && pillar.rubble>0, pillar.rubble+' pieces');

  function PROP_HP_note(){ return 'pillar is tougher'; }
  function PILLAR_FUSE_note(){ return 'stone falls sooner than pitch lights'; }

  // ---- a slam brings the room down too ------------------------------------
  const bySlam = await p.evaluate(()=>{
    const pr = withProp('barrel');
    if(!pr) return {skip:true};
    slams.length=0; hazards.length=0;
    player.x=pr.x+900; player.y=pr.y; player.hp=player.maxHp=1e6;
    slams.push({ x:pr.x, y:pr.y, r:SLAM_R, wind:0.01, t:0, dmg:200, struck:false });
    for(let i=0;i<8;i++) updateSlams(1/60);
    return { broke: pr.gone };
  });
  ck('a Lieutenant’s slam brings the room down as readily as your blade',
     !bySlam.skip && bySlam.broke);

  // ---- a broken prop stops being drawn or hit -----------------------------
  const after = await p.evaluate(()=>{
    const pr = withProp('pillar');
    hurtProp(pr, 9999);
    const before = props.filter(o=>o.gone).length;
    hurtProp(pr, 9999);                       // must not fire twice
    return { gone: before, still: props.filter(o=>o.gone).length,
             standing: props.filter(o=>STANDING[o.kind] && !o.gone).length };
  });
  ck('a broken prop cannot be broken twice', after.gone===after.still);
  ck('and drops out of the standing set', after.standing>0);

  // Standable ground is indexed before the chasms are cut. A hole takes floor
  // away, so the index has to be retaken -- otherwise everything that samples
  // openCells (packs, scenery, loot, the corpse, the ambush ring) can be
  // dropped into a pit, and the wall resolver then throws it clear across the
  // rock mass the pit belongs to.
  const idx = await p.evaluate(()=>{
    let solid=0, inRect=0, tot=0;
    for (let lv=0; lv<12; lv++){
      startRun('isaac', LEVELS[lv*2].id, 'riven');
      for (const c of openCells){
        tot++;
        if (cellAt(Math.floor(c.x/CELL_W), Math.floor(c.y/CELL_W))===SOLID) solid++;
        for (let i=0;i<walls.length;i++){ const w=walls[i];
          if (c.x>w.x && c.x<w.x+w.w && c.y>w.y && c.y<w.y+w.h){ inRect++; break; } }
      }
    }
    return {solid, inRect, tot};
  });
  ck('every indexed open cell is still open floor', idx.solid===0,
     idx.solid+' of '+idx.tot+' turned to rock');
  ck('and none of them sits inside a wall or a pit', idx.inRect===0,
     idx.inRect+' of '+idx.tot+' inside a rect');

  // A body that walks into a block is stopped at the face it came to, not
  // shoved through to the far side of the mass. With rooms cut out of
  // continuous rock a single block can be most of the map wide, so "push it
  // out the way it was travelling" would teleport anything that touches one.
  const eject = await p.evaluate(()=>{
    let worst = 0, tried = 0;
    for (let lv=0; lv<8; lv++){
    startRun('isaac', LEVELS[lv*3].id, 'riven');
    for (let i=0; i<walls.length; i++){
      const w = walls[i];
      if (w.w < 120 || w.h < 120) continue;
      // stand just clear of the left face, then walk into it -- but only where
      // that is real floor: blocks abut, and starting inside the neighbour
      // tests nothing.
      const ex = w.x - 23 - 1, ey = w.y + w.h/2;
      if (ex > 23 && !pointInWalls(ex, ey, 23)) {
        tried++;
        const e = {x: ex, y: ey, r: 23};
        moveEntity(e, 6, 0);
        worst = Math.max(worst, Math.abs(e.x - (w.x - 23)));
      }
      const fx = w.x + w.w/2, fy = w.y - 23 - 1;
      if (fy > 23 && !pointInWalls(fx, fy, 23)) {
        tried++;
        const f = {x: fx, y: fy, r: 23};
        moveEntity(f, 0, 6);
        worst = Math.max(worst, Math.abs(f.y - (w.y - 23)));
      }
    }
    }
    return {worst: Math.round(worst), tried};
  });
  ck('walking into a block stops at its face', eject.tried>0 && eject.worst<=1,
     eject.worst+' units past the face, over '+eject.tried+' blocks');

  // Sheet-backed scenery: the strip has to arrive, cover every kind that
  // claims it, and leave a forged sprite standing in for the rest.
  const art = await p.evaluate(async ()=>{
    const img = new Image();
    await new Promise(r => { img.onload = img.onerror = r; img.src = PROP_SHEET; });
    const kinds = Object.keys(PROP_ART);
    const rows = Math.max(...kinds.map(k => PROP_ART[k].row)) + 1;
    startRun('isaac', LEVELS[16].id, 'riven');
    const seen = {};
    for (const pr of props) seen[pr.kind] = (seen[pr.kind]||0) + 1;
    return {
      embedded: /^data:image\/png;base64,/.test(PROP_SHEET),
      decoded: img.naturalWidth > 0, w: img.naturalWidth, h: img.naturalHeight,
      fits: img.naturalWidth === PROP_CELL * PROP_VARIANTS &&
            img.naturalHeight === PROP_CELL * rows,
      kinds,
      // every q a prop can carry must land on a real variant
      qOk: props.every(pr => !PROP_ART[pr.kind] ||
                            (pr.q % PROP_VARIANTS) < PROP_VARIANTS),
      // and the forged fallback still exists for all of them
      forged: kinds.every(k => SPR['p_' + k + '_0']),
      tombs: seen.tomb || 0, bones: seen.bones || 0
    };
  });
  ck('the scenery strip travels inside the page', art.embedded);
  ck('and decodes to the cells the code asks for',
     art.decoded && art.fits, art.w+'x'+art.h+' for '+art.kinds.join(', '));
  ck('every variant a prop can pick exists', art.qOk);
  ck('and a forged one still stands in until it lands', art.forged);
  ck('tombs are actually scattered', art.tombs > 0, art.tombs+' in one cut');

  ck('no console errors', errs.length===0, errs.slice(0,3).join(' | '));
  console.log('\nPASS '+pass.length+'\n  '+pass.join('\n  '));
  console.log('\nFAIL '+fail.length+(fail.length?'\n  '+fail.join('\n  '):''));
  await b.close(); process.exit(fail.length?1:0);
})();
