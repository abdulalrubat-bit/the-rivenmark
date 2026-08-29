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
const { spawn } = require('child_process');
const path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pass = [], fail = [];
const ck = (n, ok, note) => (ok ? pass : fail).push((ok ? '' : 'x ') + n + (note ? '  [' + note + ']' : ''));

(async () => {
  const PORT = process.env.PORT || '8233';
  const srv = spawn(process.execPath, [path.join(__dirname, 'serve.js')],
                    { env: { ...process.env, PORT }, stdio: 'ignore' });
  await sleep(800);
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('http://localhost:' + PORT + '/');
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

  // Back to the gate-house, then down again — into a DIFFERENT delve.
  await p.click('#screens .go'); await sleep(300);
  await p.screenshot({ path: path.join(__dirname, '..', 'gatehouse.png') });
  const hall = await p.evaluate(() => ({
    heroes: document.querySelectorAll('#screens [data-hero]').length,
    rungs: document.querySelectorAll('#screens [data-level]').length,
    corpseLine: /corpse of yours/i.test(document.querySelector('#screens').textContent),
    purse: /Purse/.test(document.querySelector('#screens').textContent),
    power: parseFloat((document.querySelectorAll('#screens .purse b')[1] || {}).textContent),
    hints: new Set([...document.querySelectorAll('#screens [data-level] small')]
                   .map(n => n.textContent).filter(t => /match|within|weight/.test(t))).size
  }));
  ck('the gate-house offers both heroes and a ladder',
     hall.heroes === 2 && hall.rungs >= 4, hall.heroes + ' heroes, ' + hall.rungs + ' rungs');
  ck('the corpse the run left is named', died.corpse && hall.corpseLine,
     died.corpse ? '' : 'the run carried nothing, so there is no corpse to name');
  ck('and the purse is shown', hall.purse);
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
