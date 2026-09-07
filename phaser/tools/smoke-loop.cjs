#!/usr/bin/env node
/* The loop around a delve: it has to be able to END and to start again.
 *
 * Until this existed a run had no way out and nothing to spend what it earned
 * on. What is checked is the whole circuit -- dying, the outcome the CORE
 * wrote, the gate-house, descending again into a different world -- plus the
 * two things that make a second run different from a first: the corpse it left
 * behind, and the sprites from the last delve being gone rather than pooled
 * into the next one.
 *
 * DESKTOP ONLY (Playwright). Run: npm run smoke:loop
 */
const { chromium } = require('playwright');
const buildOnce = require('./build-once.cjs');
const { spawn } = require('child_process');
const path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pass = [], fail = [];
const ck = (n, ok, note) => (ok ? pass : fail).push((ok ? '' : 'x ') + n + (note ? '  [' + note + ']' : ''));

(async () => {
  buildOnce();                       // the suite must test src/, not a stale bundle
  const PORT = process.env.PORT || '8233';
  const srv = spawn(process.execPath, [path.join(__dirname, 'serve.js')],
                    { env: { ...process.env, PORT }, stdio: 'ignore' });
  await sleep(800);
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('http://localhost:' + PORT + '/?nogate');
  await sleep(3200);

  const first = await p.evaluate(() => ({ level: LEVEL.id, name: LEVEL.name,
                                          walls: walls.length, up: !!run }));
  ck('a run is under way', first.up && first.walls > 10, first.name);

  // Kill the hero and let the core end the run its own way.
  const died = await p.evaluate(async () => {
    // Something to lose. endRun writes a corpse only if the run was carrying
    // finds or coin, so a hero who dies empty-handed leaves nothing -- and the
    // gate-house then has no corpse to mention, correctly.
    run.time = 42; run.kills = 7; run.tech = 11; run.coins = 25;
    player.invuln = 0; player.ward = 0;
    hurtPlayerBy(player.maxHp * 5, player.x, player.y);
    await new Promise(r => setTimeout(r, 300));
    const s = document.querySelector('#screens');
    return { hp: player.hp, state,
             screenUp: !!(s && s.classList.contains('up')),
             title: (document.querySelector('#screens h1') || {}).textContent || '',
             sub: (document.querySelector('#screens .sub') || {}).textContent || '',
             stats: document.querySelectorAll('#screens .stats div').length,
             corpse: !!stash.corpse };
  });
  ck('dying ends the run', died.hp <= 0 && died.screenUp);
  ck('and the outcome is the one the core wrote',
     /Slain/.test(died.title) && /hive-mind/i.test(died.sub),
     died.title + ' — ' + died.sub.slice(0, 60) + '…');
  ck('with the run’s figures on it', died.stats >= 2, died.stats + ' stat boxes');

  await p.screenshot({ path: path.join(__dirname, '..', 'over.png') });

  // The corpse is named at the gate-house — asked HERE, with the corpse still
  // in the stash. It cannot be asked after descending again: the run that
  // ended fell on the spawn point, so the next descent into the same rung
  // stands on its own corpse and claims it before anything can look.
  const corpseSaid = await p.evaluate(() => {
    const sc = window.__game.scene.getScene('delve');
    sc.screens.show('splash');
    const said = /corpse of yours/i.test(document.querySelector('#screens').textContent);
    sc.screens.show('over');
    return said;
  });
  ck('the corpse the run left is named', died.corpse && corpseSaid,
     died.corpse ? '' : 'the run carried nothing, so there is no corpse to name');

  // --- the two ways off the outcome card ----------------------------------
  // "To the gate-house" used to be the only one, and the gate-house was the
  // only way back to a menu at all.
  const overBtns = await p.evaluate(() => ({
    go: (document.querySelector('#screens .go') || {}).textContent || '',
    alt: (document.querySelector('#screens .alt') || {}).textContent || ''
  }));
  ck('the outcome offers going again and going back',
     /again/i.test(overBtns.go) && /gate-house/i.test(overBtns.alt),
     overBtns.go + ' / ' + overBtns.alt);

  // Straight back down, without the trip through a menu.
  const endedAt = await p.evaluate(() => LEVEL.id);
  await p.click('#screens .go'); await sleep(1600);
  const again = await p.evaluate(() => ({
    state, level: LEVEL.id, walls: walls.length, time: run.time,
    up: document.querySelector('#screens').classList.contains('up')
  }));
  ck('“Descend again” descends, without a menu in between',
     again.state === 'play' && !again.up && again.walls > 10);
  ck('and into the rung the run that ended was on', again.level === endedAt,
     endedAt + ' → ' + again.level);

  // --- holding a delve -----------------------------------------------------
  // The core has had pauseRun since the canvas build; the Phaser side never
  // grew the button or the card, so `state` could never leave 'play' except by
  // dying. The proof is the clock: run.time only moves while update() is being
  // called, so it is the one number that says whether the world is stopped.
  const held = await p.evaluate(async () => {
    const t0 = run.time;
    await new Promise(r => setTimeout(r, 350));
    const ranBefore = run.time - t0;
    // A thumb on the stick at the moment it is held. Left down it would still
    // be steering when the delve came back, so pauseRun lets it go -- and a
    // probe that never put one down could not tell.
    stickStart(9, 100, 400);
    const stickBefore = !!stick.active;
    // No button is a FAILURE, not an exception. A probe that throws where it
    // should fail takes the whole suite down and reports nothing -- which is
    // how a missing control has hidden here before.
    const btn = document.querySelector('#hud .hold button');
    if (!btn) return { missing: 'no #hud .hold button', ranBefore,
                       whileHeld: -1, state, stickBefore, stick: !!stick.active,
                       up: false, title: '' };
    btn.click();
    await new Promise(r => setTimeout(r, 60));
    const t1 = run.time;
    await new Promise(r => setTimeout(r, 350));
    return { ranBefore, whileHeld: run.time - t1, state,
             up: document.querySelector('#screens').classList.contains('up'),
             title: (document.querySelector('#screens h1') || {}).textContent || '',
             stickBefore, stick: !!stick.active };
  });
  // Both halves, or this passes on a build where the clock never ran at all.
  ck('the delve’s clock runs while it is being played', held.ranBefore > 0.15,
     '+' + held.ranBefore.toFixed(2) + 's over 350ms');
  ck('and the hold button stops it dead',
     !held.missing && held.state === 'pause' && held.whileHeld === 0,
     held.missing || ('state ' + held.state + ', clock +' + held.whileHeld.toFixed(3) + 's'));
  ck('with a card that says so', held.up && /Held/.test(held.title), held.title);
  ck('and the thumb on the stick let go', held.stickBefore && !held.stick,
     held.stickBefore ? '' : 'the probe never put a thumb down — proves nothing');
  await p.screenshot({ path: path.join(__dirname, '..', 'held.png') });

  const pressedOn = await p.evaluate(async () => {
    const btn = document.querySelector('#screens .go');
    if (!btn) return { missing: 'no “Press on” on the card', state, moved: -1, up: true };
    btn.click();
    await new Promise(r => setTimeout(r, 60));
    const t = run.time;
    await new Promise(r => setTimeout(r, 350));
    return { state, moved: run.time - t,
             up: document.querySelector('#screens').classList.contains('up') };
  });
  ck('“Press on” gives the delve back',
     !pressedOn.missing && pressedOn.state === 'play' && !pressedOn.up &&
     pressedOn.moved > 0.15,
     pressedOn.missing || ('clock +' + pressedOn.moved.toFixed(2) + 's'));

  // --- walking out ---------------------------------------------------------
  // Abandoning is not extracting: nothing is banked. That is the whole point
  // of it, so it is what this checks, not just that a menu appeared.
  const walkedOut = await p.evaluate(async () => {
    const before = { xp: stash.xp || 0, coins: stash.coins || 0 };
    run.tech = 99; run.coins = 77;                 // something worth keeping
    const hold = document.querySelector('#hud .hold button');
    if (!hold) return { missing: 'no hold button', before, state,
                        xp: -1, coins: -1, tech: -1, time: -1,
                        gatehouse: false, props: 0, walls: 0 };
    hold.click();
    await new Promise(r => setTimeout(r, 60));
    const out = document.querySelector('#screens .alt');
    if (!out) return { missing: 'no “Abandon the delve” on the held card',
                       before, state, xp: -1, coins: -1, tech: -1, time: -1,
                       gatehouse: false, props: 0, walls: 0 };
    out.click();
    await new Promise(r => setTimeout(r, 400));
    const sc = window.__game.scene.getScene('delve');
    return { state, before, xp: stash.xp || 0, coins: stash.coins || 0,
             tech: run.tech, time: run.time,
             gatehouse: !!document.querySelector('#screens #descend'),
             props: sc.propImgs.length, walls: walls.length };
  });
  ck('“Abandon the delve” comes back up',
     !walkedOut.missing && walkedOut.state === 'menu' && walkedOut.gatehouse,
     walkedOut.missing || ('state ' + walkedOut.state));
  ck('and banks nothing on the way',
     !walkedOut.missing && walkedOut.xp === walkedOut.before.xp &&
     walkedOut.coins === walkedOut.before.coins,
     '99 slag and 77 coin left behind');
  ck('the abandoned run is gone, not paused',
     !walkedOut.missing && walkedOut.tech === 0 && walkedOut.time === 0);
  ck('and the scene is standing on a world, not the last one’s wreckage',
     !walkedOut.missing && walkedOut.props > 20 && walkedOut.walls > 10,
     walkedOut.props + ' scenery images');

  await p.screenshot({ path: path.join(__dirname, '..', 'gatehouse.png') });
  const hall = await p.evaluate(() => ({
    heroes: document.querySelectorAll('#screens [data-hero]').length,
    rungs: document.querySelectorAll('#screens [data-level]').length,
    purse: /Purse/.test(document.querySelector('#screens').textContent),
    power: parseFloat((document.querySelectorAll('#screens .purse b')[1] || {}).textContent),
    hints: new Set([...document.querySelectorAll('#screens [data-level] small')]
                   .map(n => n.textContent).filter(t => /match|within|weight/.test(t))).size
  }));
  ck('the gate-house offers both heroes and a ladder',
     hall.heroes === 2 && hall.rungs >= 4, hall.heroes + ' heroes, ' + hall.rungs + ' rungs');
  ck('and the purse is shown', hall.purse);

  /* --- ASKING FOR THE GROUND ---------------------------------------------
   * The Regalia is scattered by region, which is advice nobody can act on
   * unless the gate-house lets you ask for a region. Only offered where there
   * is a choice: the first rungs are cut from one region and a picker with a
   * single option in it is furniture.
   */
  const ground = await p.evaluate(async () => {
    const sc = window.__game.scene.getScene('delve');
    const deep = LEVELS.find(l => l.regions.length >= 3);
    const shallow = LEVELS.find(l => l.regions.length === 1);
    sc.screens.pick.level = shallow.id; sc.screens.show('splash');
    const onOne = { rows: document.querySelectorAll('#regionRows').length,
                    says: document.querySelector('#screens').textContent };
    sc.screens.pick.level = deep.id; sc.screens.show('splash');
    const rows = [...document.querySelectorAll('[data-region]')];
    const before = stash.region;
    const wanted = deep.regions[deep.regions.length - 1];
    const btn = rows.find(r => r.dataset.region === wanted);
    if (btn) btn.click();
    await new Promise(r => setTimeout(r, 120));
    const on = document.querySelector('[data-region].on');
    return { onOne, offered: rows.length, pool: deep.regions.length,
             names: rows.map(r => r.dataset.region),
             before, after: stash.region, wanted,
             lit: on && on.dataset.region,
             keeps: (btn && btn.textContent) || '',
             deepName: deep.name, shallowName: shallow.name,
             shallowRegion: (REGION_BY_ID[shallow.regions[0]] || {}).name || '' };
  });
  ck('a one-region rung is not given a picker with one option in it',
     ground.onOne.rows === 0, ground.shallowName + ' has ' + ground.onOne.rows + ' pickers');
  ck('but it still says what its ground keeps',
     ground.onOne.says.includes(ground.shallowRegion) &&
     /keeps/.test(ground.onOne.says), ground.shallowRegion);
  ck('a rung cut from several offers every one of them, and “whatever it rolls”',
     ground.offered === ground.pool + 1,
     ground.deepName + ': ' + ground.names.join(' '));
  ck('asking for one records it', ground.after === ground.wanted && ground.lit === ground.wanted,
     'was ' + JSON.stringify(ground.before) + ', now ' + JSON.stringify(ground.after));
  ck('and the row says what that ground keeps', /the [a-z]/.test(ground.keeps),
     JSON.stringify(ground.keeps.trim()));
  await p.evaluate(() => { stash.region = null; saveStash(); });

  /* --- ONE LIFE ------------------------------------------------------------
   * Hardcore is a second stash rather than a setting on the first, so the
   * gate-house toggle must put one kit down and pick another up without
   * touching what it left. Two taps to go in, one to come back: the direction
   * where the next death is final is the one worth a question.
   */
  const oneLife = await p.evaluate(async () => {
    const sc = window.__game.scene.getScene('delve');
    setHardcore(false);
    stash = blankStash(); stash.coins = 404;
    for (const sl of SLOTS) stash.gear[sl.id] = rollItem(0.5, sl.id);
    saveStash();
    sc.screens.hcArmed = false;
    sc.screens.show('splash');
    const t = () => document.querySelector('#hcToggle');
    const said = () => (t() || {}).textContent || '';
    const off = said();
    t().click(); await new Promise(r => setTimeout(r, 80));
    const armed = said();
    t().click(); await new Promise(r => setTimeout(r, 80));
    const on = { text: said(), hardcore, loot: lootMult(),
                 coins: stash.coins,
                 gear: SLOTS.filter(sl => stash.gear[sl.id]).length };
    // ...and back out in ONE tap, with the ordinary kit exactly as it was.
    t().click(); await new Promise(r => setTimeout(r, 80));
    const back = { hardcore, coins: stash.coins,
                   gear: SLOTS.filter(sl => stash.gear[sl.id]).length };
    setHardcore(false);
    // Put the stash back as it was found. This block furnishes one to prove
    // the switch does not touch it, and eight pieces of gear left lying around
    // sent the ladder check below "well within you" on every rung.
    stash = blankStash(); saveStash();
    sc.screens.show('splash');
    return { off, armed, on, back };
  });
  ck('the gate-house offers one life, and asks twice before taking it',
     /Tap again/.test(oneLife.armed) && !/Tap again/.test(oneLife.off) &&
     oneLife.on.hardcore === true,
     JSON.stringify(oneLife.off.slice(0, 40)) + ' → ' +
     JSON.stringify(oneLife.armed.slice(0, 40)));
  ck('taking it up hands you an empty stash at half again the loot',
     oneLife.on.coins === 0 && oneLife.on.gear === 0 && oneLife.on.loot === 1.5,
     oneLife.on.gear + ' pieces, ' + oneLife.on.coins + ' coin, loot ×' + oneLife.on.loot);
  ck('and putting it down gives the ordinary kit straight back, in one tap',
     oneLife.back.hardcore === false && oneLife.back.coins === 404 &&
     oneLife.back.gear === 8,
     oneLife.back.gear + ' pieces and ' + oneLife.back.coins + ' coin returned');
  // Power reaching the screen as NaN compared false against every rung and
  // labelled the whole ladder "an even match" -- a wrong answer that looked
  // like a plausible one.
  // A fresh hero is under every rung on offer, so ONE verdict across the
  // ladder is the right answer, not a broken one. What proves the ladder is
  // judged against power is that the verdicts move when power does.
  const judged = await p.evaluate(() => {
    const read = () => [...document.querySelectorAll('#screens [data-level] small')]
      .map(n => n.textContent).filter(t => /match|within|weight/.test(t)).join('|');
    const weak = read();
    stash.level = 45;                       // a hero far up the ladder
    window.__game.scene.getScene('delve').screens.show('splash');
    const strong = read();
    stash.level = 1;
    window.__game.scene.getScene('delve').screens.show('splash');
    return { weak, strong, power: stashPower() };
  });
  ck('power is a number', Number.isFinite(hall.power), 'power ' + hall.power);
  ck('and the ladder is judged against it', judged.weak !== judged.strong,
     'at power 1: ' + judged.weak.split('|')[0] +
     ' … at rank 45: ' + judged.strong.split('|')[0]);

  // Pick a different rung, descend, and check the world really changed.
  await p.evaluate(() => {
    const rows = [...document.querySelectorAll('#screens [data-level]')];
    const other = rows.find(r => r.dataset.level !== LEVEL.id) || rows[0];
    other.click();
  });
  await sleep(150);
  await p.click('#screens #descend');
  await sleep(1600);
  const second = await p.evaluate(() => {
    const sc = window.__game.scene.getScene('delve');
    return { level: LEVEL.id, name: LEVEL.name, walls: walls.length,
             screenUp: document.querySelector('#screens').classList.contains('up'),
             props: sc.propImgs.length, pool: sc.pool.length,
             bodies: enemies.filter(e => e.hp > 0).length,
             heroAt: [Math.round(sc.hero.x), Math.round(sc.hero.y)],
             playerAt: [Math.round(player.x), Math.round(player.y)] };
  });
  ck('descending starts a new delve', !second.screenUp && second.walls > 10,
     second.name);
  ck('and it is a different one', second.level !== first.level,
     first.name + ' → ' + second.name);
  ck('the last delve’s scenery is gone', second.props > 20,
     second.props + ' scenery images for the new world');
  ck('the body pool did not carry the dead across', second.pool <= second.bodies + 2,
     second.pool + ' sprites for ' + second.bodies + ' bodies');
  ck('and the hero is where the new run put him',
     Math.abs(second.heroAt[0] - second.playerAt[0]) < 2, second.heroAt.join(','));

  ck('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  await p.screenshot({ path: path.join(__dirname, '..', 'loop.png') });
  console.log('\nPASS ' + pass.length + '\n  ' + pass.join('\n  '));
  console.log('\nFAIL ' + fail.length + (fail.length ? '\n  ' + fail.join('\n  ') : ''));
  await b.close(); srv.kill();
  process.exit(fail.length ? 1 : 0);
})();
