/* THE WAY IN.
 *
 * Every other Phaser suite enters through ?nogate, which drops a delve on the
 * screen -- because each of them is about one thing that happens INSIDE a
 * delve and none of them should fail because a menu moved. This one is the
 * other half of that bargain: it is the only suite that opens the game the way
 * a player does, on a phone-shaped viewport at a phone's pixel ratio, and
 * presses the real buttons the whole way down.
 *
 * It exists because the Phaser build spent its whole life booting straight
 * into rung 4 as somebody called Isaac, with none of that chosen. Everything
 * the gate-house offers was built, and none of it was reachable, and no test
 * noticed for a month -- because every test skipped the front door.
 *
 * WHAT WOULD MAKE THIS VACUOUS, AND WHAT STOPS IT.
 *   - "the card is up before the bundle" would pass trivially if the bundle
 *     had in fact already run, so the same sample records __game and the
 *     check fails unless it was genuinely absent.
 *   - "the bar moves" would pass on a bar someone animated, so it is measured
 *     against a HELD atlas and asserted to start at the sliver.
 *   - "Descend takes you to the rung you chose" would pass on the default
 *     rung whatever the button did, so it picks one that is NOT the default
 *     and names it.
 *   - "the canvas is sharp" would pass if every number were the same, so the
 *     CSS size is checked against the viewport as well as the buffer against
 *     the ratio.
 */
const { chromium } = require('playwright');
const { spawn, execFileSync } = require('child_process');
const path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pass = [], fail = [];
const ck = (n, ok, note) => (ok ? pass : fail).push((ok ? '' : 'x ') + n + (note ? '  [' + note + ']' : ''));

// A phone, and a phone's pixel ratio. Not a default desktop context: half of
// what this suite is about only differs from 1 when the ratio does.
const VIEW = { width: 390, height: 844 };
const DPR = 3;

/* Every field is optional-chained. If the card is reduced to a bare div --
 * which is what removing it from the shell and rebuilding it in the bundle
 * looks like -- these must come back null and be reported as named failures,
 * not throw and take the rest of the suite with them. */
const cardState = () => {
  const b = document.getElementById('boot');
  const bar = b && b.querySelector('.bar');
  return {
    t: Math.round(performance.now()),
    up: !!b,
    game: !!window.__game,
    out: b ? b.classList.contains('out') : null,
    title: b?.querySelector('h1')?.textContent.replace(/\s+/g, ' ').trim() ?? null,
    say: b?.querySelector('.say')?.textContent ?? null,
    /* Measured off the screen, not off the inline style. The sliver the bar
     * starts at is set in the shell's stylesheet and there IS no inline
     * style until title.js first writes one -- so reading style.width made
     * "it starts at a sliver" report 0% for the very case it exists to
     * check, the card standing there with no bundle behind it. */
    bar: bar && bar.querySelector('i')
      ? Math.round(100 * bar.querySelector('i').getBoundingClientRect().width /
                   (bar.getBoundingClientRect().width || 1))
      : null
  };
};

(async () => {
  execFileSync(process.execPath, [path.join(__dirname, 'build.js')], { stdio: 'ignore' });
  const PORT = process.env.PORT || '8267';
  const srv = spawn(process.execPath, [path.join(__dirname, 'serve.js')],
                    { env: { ...process.env, PORT }, stdio: 'ignore' });
  await sleep(800);
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...{ viewport: VIEW }, deviceScaleFactor: DPR,
                                   isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });

  /* A shorter leash than the default thirty seconds, because this suite's
   * whole job is to notice when a control the player needs is not there, and
   * a missing one should be a named failure rather than a stack trace half a
   * minute later with none of the checks printed.
   *
   * Ten, not four. Four was enough standalone and not enough in a batch run:
   * sixteen browser suites in a row on software GL contend badly, and the
   * suite failed on a button that was there and would have been clicked a
   * second later. A test that fails because the machine is busy teaches
   * people to ignore it. */
  const tap = sel => p.click(sel, { timeout: 10000 });

  const report = () => {
    console.log('\nPASS ' + pass.length + '\n  ' + pass.join('\n  '));
    console.log('\nFAIL ' + fail.length + (fail.length ? '\n  ' + fail.join('\n  ') : ''));
  };

  try {

  /* ---- 1. the card, over a load that is deliberately slow ----------------
   * Both big files are held back, and for two different reasons.
   *
   * bundle.js, because the first claim here is that the card does not wait
   * for the bundle -- and on a warm local server the bundle has arrived and
   * run inside 200ms, so a check timed against it would pass or fail on the
   * speed of the machine rather than on where the markup lives. Held, the
   * claim is proved by construction: the card is looked at while the bundle
   * is demonstrably still in flight.
   *
   * atlas.png, because the loading phase is otherwise too short to sample
   * twice and "the bar moved" would have nowhere to take its two readings.
   *
   * This is also what a phone on a bad connection actually does.
   */
  await p.route('**/bundle.js', async r => { await sleep(1400); await r.continue(); });
  await p.route('**/atlas.png', async r => { await sleep(2200); await r.continue(); });
  const base = 'http://localhost:' + PORT + '/';
  // commit, not load: the point is to be looking at the page while it loads.
  await p.goto(base, { waitUntil: 'commit' });
  await sleep(120);
  const first = await p.evaluate(cardState);
  ck('the title card is up while the bundle that would draw it is still in flight',
     first.up && first.game === false,
     'at ' + first.t + 'ms: card ' + (first.up ? 'up' : 'absent') +
     ', __game ' + (first.game ? 'ALREADY THERE' : 'not yet') +
     ', bundle held 1400ms');
  ck('and it names the game',
     /THE\s*RIVENMARK/i.test(first.title || ''), JSON.stringify(first.title));
  ck('and its bar starts at a sliver, not at nothing and not at a number it made up',
     first.bar !== null && first.bar > 0 && first.bar < 20, 'bar ' + first.bar + '%');

  await p.waitForFunction(
    () => document.querySelector('#boot .say')?.textContent === 'forging the delve…',
    null, { timeout: 20000 }).catch(() => {});
  await sleep(1100);
  const mid = await p.evaluate(cardState);
  ck('the bar tracks the load rather than an animation',
     mid.up && mid.bar > first.bar + 10 && mid.bar < 100,
     'sliver ' + first.bar + '% -> ' + (mid.bar === null ? 'card gone' : mid.bar + '%') +
     ' while the atlas was held');
  ck('and it says what it is waiting for', mid.say === 'forging the delve…', mid.say);

  await p.waitForFunction(() => !document.getElementById('boot'), null, { timeout: 30000 });
  const goneAt = await p.evaluate(() => Math.round(performance.now()));
  ck('the card comes down once the game is behind it', goneAt > 3600 && goneAt < 25000,
     'gone at ' + goneAt + 'ms, with the bundle held 1400ms and the atlas 2200ms');

  /* ---- 2. the game opens at the gate-house, not in a delve --------------- */
  const gate = await p.evaluate(() => ({
    state: state,
    screensUp: document.getElementById('screens').classList.contains('up'),
    h1: document.querySelector('#screens h1')?.textContent,
    tabs: [...document.querySelectorAll('#screens .tabs button')].map(t => t.textContent),
    heroes: [...document.querySelectorAll('#screens [data-hero]')].map(h => h.dataset.hero),
    rungs: [...document.querySelectorAll('#screens [data-level]')].map(r => r.dataset.level),
    descend: !!document.getElementById('descend'),
    runTime: run ? +(run.time || 0).toFixed(1) : null,
    /* NOT offsetParent: it is null for a position:fixed element whatever
       * its visibility, so it called the HUD "down" in every state and the
       * check passed without looking at anything. The rendered box is the
       * honest measure. */
      hudUp: (h => !!h && h.getBoundingClientRect().height > 0)
             (document.getElementById('hud'))
  }));
  ck('the game opens at the gate-house and not in a delve',
     gate.state === 'menu' && gate.screensUp && /Gate-House/i.test(gate.h1 || ''),
     'state ' + gate.state + ', showing ' + JSON.stringify(gate.h1));
  ck('and no run has been started behind it', gate.runTime === 0,
     'run.time ' + gate.runTime);
  ck('and every station is on the rail',
     ['Descend', 'Forge', 'Vendor', 'Hall'].every(t => gate.tabs.includes(t)),
     gate.tabs.join(' / '));
  ck('the HUD is not standing behind the menu for a run nobody started',
     gate.hudUp === false, 'HUD ' + (gate.hudUp ? 'VISIBLE at the gate-house' : 'down'));
  ck('and there is a hero and a rung to choose',
     gate.heroes.length >= 2 && gate.rungs.length >= 4,
     gate.heroes.length + ' heroes, ' + gate.rungs.length + ' rungs');

  /* ---- 2b. and its one button is where a thumb can reach it -------------
   * The card is 1300-odd pixels of rungs, bounty, ground and Hardcore on an
   * 844px phone, and Descend used to sit 470px below the fold: the main
   * menu's primary action could not be seen without scrolling past all of
   * it. The check would be vacuous on a card that happens to fit, so the
   * overflow is asserted alongside it.
   */
  const reach = await p.evaluate(() => {
    const r = document.getElementById('screens');
    const g = document.getElementById('descend').getBoundingClientRect();
    return { over: r.scrollHeight - r.clientHeight,
             top: Math.round(g.top), bottom: Math.round(g.bottom), h: innerHeight };
  });
  ck('Descend is on the screen without scrolling for it',
     reach.over > 100 && reach.top >= 0 && reach.bottom <= reach.h + 1,
     'button at ' + reach.top + '-' + reach.bottom + ' in ' + reach.h +
     'px, with ' + reach.over + 'px of card below the fold');

  /* The verdict beside each rung comes from the core's delveStanding, which
   * has four bands and a colour for each -- not from a second copy in the
   * menu with different numbers and no colour. Checked by the colour, since
   * that is the part only the core has. */
  const verdicts = await p.evaluate(() => [...document.querySelectorAll('#rungRows .verdict')]
    .map(v => ({ text: v.textContent, colour: v.style.color })));
  const PALETTE = ['rgb(127, 168, 105)', 'rgb(196, 183, 149)',
                   'rgb(201, 134, 62)', 'rgb(192, 80, 63)'];
  ck('each rung wears the core’s own verdict, colour and all',
     verdicts.length >= 4 && verdicts.every(v => PALETTE.includes(v.colour)),
     verdicts.length + ' rungs, ' +
     [...new Set(verdicts.map(v => v.text))].join(' / '));

  /* And the menu keeps off them too. #screens is a scroller with the card
   * centred in normal flow, so there padding IS the right tool -- unlike the
   * HUD, where the same idea does nothing (see the note in hud.js). Checked
   * separately for exactly that reason: the two use different mechanisms and
   * one of them can break while the other holds. */
  const menuFlat = await p.evaluate(() =>
    Math.round(document.getElementById('descend').getBoundingClientRect().bottom));
  const menuInset = await p.evaluate(() => {
    const st = document.createElement('style');
    st.id = 'faux-safe-area';
    st.textContent = ':root{--sa-t:44px;--sa-b:44px;--sa-l:44px;--sa-r:44px}';
    document.head.appendChild(st);
    return new Promise(done => requestAnimationFrame(() => requestAnimationFrame(() =>
      done(Math.round(document.getElementById('descend').getBoundingClientRect().bottom)))));
  });
  ck('and so does the gate-house',
     menuFlat - menuInset === 44,
     'with a 44px inset: Descend ends at ' + menuFlat + ' -> ' + menuInset);
  await p.evaluate(() => document.getElementById('faux-safe-area')?.remove());

  /* ---- 3. the stations open --------------------------------------------- */
  const station = async (tab, want) => {
    await tap('#screens .tabs button[data-tab="' + tab + '"]');
    await sleep(220);
    const h = await p.evaluate(() => document.querySelector('#screens h1')?.textContent || '');
    ck('the ' + tab + ' station opens', want.test(h), JSON.stringify(h));
  };
  await station('gear', /Forge/i);
  await station('vendor', /Vendor|Ashen|Trader|Stall/i);
  await station('hall', /Hall/i);
  await station('splash', /Gate-House/i);

  /* ---- 4. Descend, on a rung that is NOT the default --------------------- */
  const want = gate.rungs[2];
  await tap('#screens [data-level="' + want + '"]');
  await sleep(200);
  await tap('#descend');
  await sleep(1400);
  const delve = await p.evaluate(() => {
    const sc = window.__game.scene.getScene('delve');
    return { state, level: LEVEL.id, screensUp: document.getElementById('screens').classList.contains('up'),
             bodies: sc.pool.length, walls: walls.length, hp: Math.round(player.hp),
             hud: !!document.querySelector('#hud .conduit'),
             hudUp: (h => !!h && h.getBoundingClientRect().height > 0)(document.getElementById('hud')),
             kit: document.querySelectorAll('#hud .kit button').length };
  });
  ck('Descend takes you into the rung you chose, not the one it defaulted to',
     delve.state === 'play' && delve.level === want && want !== gate.rungs[0],
     'asked for ' + want + ', got ' + delve.level +
     ' (default was ' + gate.rungs[0] + ')');
  ck('and the gate-house is out of the way', delve.screensUp === false);
  ck('and there is a delve under it',
     delve.walls > 10 && delve.bodies > 20 && delve.hp > 0,
     delve.walls + ' walls, ' + delve.bodies + ' bodies, ' + delve.hp + ' hp');
  ck('and the HUD came with it', delve.hudUp && delve.hud && delve.kit >= 3,
     'HUD ' + (delve.hudUp ? 'up' : 'STILL DOWN') + ', conduit ' +
     (delve.hud ? 'up' : 'MISSING') + ', ' + delve.kit + ' kit buttons');

  /* ---- 4b. and the kit is legible ---------------------------------------
   * Two defects, both of which a screenshot showed and no test did.
   *
   * The word on a button ran the full width of a ROUND button and was cut
   * off at both ends by its overflow -- and because the tag itself fitted its
   * own box, the ellipsis never fired and nothing anywhere reported it. So
   * the text run is measured against the CHORD of the disc at the height the
   * text sits, which is the width that is actually visible.
   *
   * And a disabled button was drawn at 62% opacity, so the delve showed
   * through its face: two of the five had pillars standing in the middle of
   * them. A button you can see the floor through does not read as
   * unavailable. The check needs a disabled button to be meaningful, so it
   * says how many it found.
   */
  const kit = await p.evaluate(() => [...document.querySelectorAll('#hud .kit button')]
    .map(bt => {
      const t = bt.querySelector('.tag');
      const br = bt.getBoundingClientRect(), tr = t.getBoundingClientRect();
      // The glyph run, not the box it is centred in.
      const rg = document.createRange(); rg.selectNodeContents(t);
      const ink = rg.getBoundingClientRect().width;
      const R = br.width / 2, cy = br.top + R;
      const dy = Math.max(Math.abs(tr.top - cy), Math.abs(tr.bottom - cy));
      const chord = 2 * Math.sqrt(Math.max(0, R * R - dy * dy));
      return { tag: t.textContent, ink: Math.round(ink), chord: Math.round(chord),
               disabled: bt.disabled, opacity: +getComputedStyle(bt).opacity };
    }));
  const tight = kit.filter(k => k.ink > k.chord);
  /* The floor is a fixture control, not a claim about the bar: it says the
   * query found buttons at all, so "none of them are tight" cannot pass on an
   * empty list. It read >= 4 for a five-ability bar; the bar is three now (see
   * the note over ABILITIES) and the floor moved with it rather than the
   * check being loosened. */
  ck('every ability’s name fits inside the disc it is written on',
     kit.length >= 3 && tight.length === 0,
     kit.length + ' buttons, widest ' +
     kit.reduce((a, k) => k.ink / k.chord > a.ink / a.chord ? k : a, kit[0] || { ink: 0, chord: 1 }).tag +
     ' at ' + (kit[0] ? Math.max(...kit.map(k => k.ink)) : 0) + 'px in a ' +
     (kit[0] ? kit[0].chord : 0) + 'px chord' +
     (tight.length ? ' — CUT: ' + tight.map(k => k.tag).join(', ') : ''));
  const off = kit.filter(k => k.disabled);
  ck('and an unavailable one is opaque, not a hole you can see the delve through',
     off.length > 0 && off.every(k => k.opacity === 1),
     off.length + ' of ' + kit.length + ' unavailable, opacity ' +
     [...new Set(off.map(k => k.opacity))].join('/'));

  /* ---- 4c. the parts of the glass the phone has already taken -----------
   * The page asks for viewport-fit=cover so the delve reaches the edge, and
   * the HUD then has to keep off the notch and the home indicator itself.
   * env() cannot be set from a test, so the four insets are read through
   * custom properties and this sets them: what is being proved is that the
   * padding carries -- that every control moves inward by exactly the inset
   * -- which is the half that silently stops working.
   */
  const INSET = 44;
  const pin = () => ({
    life: Math.round(document.querySelector('#hud .top').getBoundingClientRect().top),
    conduit: Math.round(innerHeight -
             document.querySelector('#hud .conduit').getBoundingClientRect().bottom),
    hold: Math.round(document.querySelector('#hud .hold button').getBoundingClientRect().top)
  });
  const flat = await p.evaluate(pin);
  const inset = await p.evaluate(n => {
    const st = document.createElement('style');
    st.id = 'faux-safe-area';
    st.textContent = ':root{--sa-t:' + n + 'px;--sa-b:' + n + 'px;' +
                     '--sa-l:' + n + 'px;--sa-r:' + n + 'px}';
    document.head.appendChild(st);
    return new Promise(done => requestAnimationFrame(() => requestAnimationFrame(() => {
      const r = {
        life: Math.round(document.querySelector('#hud .top').getBoundingClientRect().top),
        conduit: Math.round(innerHeight -
                 document.querySelector('#hud .conduit').getBoundingClientRect().bottom),
        hold: Math.round(document.querySelector('#hud .hold button').getBoundingClientRect().top)
      };
      done(r);
    })));
  }, INSET);
  ck('the HUD keeps off the notch and the home indicator',
     inset.life - flat.life === INSET && inset.conduit - flat.conduit === INSET &&
     inset.hold - flat.hold === INSET,
     'with a ' + INSET + 'px inset: life ' + flat.life + '->' + inset.life +
     ', conduit ' + flat.conduit + '->' + inset.conduit +
     ', hold ' + flat.hold + '->' + inset.hold);
  await p.evaluate(() => document.getElementById('faux-safe-area')?.remove());

  /* ---- 5. hold, press on, abandon --------------------------------------- */
  await tap('#hud .hold button');
  await sleep(300);
  const held = await p.evaluate(() => ({
    state, h1: document.querySelector('#screens h1')?.textContent,
    hudUp: (h => !!h && h.getBoundingClientRect().height > 0)(document.getElementById('hud')),
    up: document.getElementById('screens').classList.contains('up') }));
  ck('the delve can be held', held.state === 'pause' && held.up && /Held/i.test(held.h1 || ''),
     'state ' + held.state + ', showing ' + JSON.stringify(held.h1));
  // Held is not the menu -- the delve is still standing behind the card, so
  // the HUD stays. The hide rule is about whether there is a run, not about
  // whether a screen is up, and this is the case that tells the two apart.
  ck('and holding it does not take the HUD away, because the delve is still there',
     held.hudUp === true, 'HUD ' + (held.hudUp ? 'up' : 'GONE while merely held'));

  await tap('#screens .go');
  await sleep(300);
  const back = await p.evaluate(() => ({
    state, up: document.getElementById('screens').classList.contains('up') }));
  ck('and pressed on again', back.state === 'play' && back.up === false, 'state ' + back.state);

  await tap('#hud .hold button');
  await sleep(300);
  await tap('#screens .alt');
  await sleep(900);
  const home = await p.evaluate(() => ({
    state, h1: document.querySelector('#screens h1')?.textContent,
    up: document.getElementById('screens').classList.contains('up'),
    walls: walls.length }));
  ck('and abandoning it comes back to the gate-house',
     home.state === 'menu' && home.up && /Gate-House/i.test(home.h1 || ''),
     'state ' + home.state + ', showing ' + JSON.stringify(home.h1));
  ck('with ground under the menu rather than the corpse of the last delve',
     home.walls > 10, home.walls + ' walls');

  /* ---- 5b. and dying gets you back too ----------------------------------
   * The last transition on the list, and the one that was broken: "To the
   * gate-house" on the death card raised the menu and nothing else, so it
   * came up over the delve you had just died in, with the run still marked
   * over and no fresh world underneath. It recovered as soon as you
   * descended again, which is why it survived this long.
   */
  await tap('#descend');
  await sleep(1400);
  // Through the door damage comes through, not by writing hp to zero: the
  // run ends inside hurtPlayerBy, and a hero whose number was simply set to
  // nothing never reaches it. Carrying something, so there is a corpse and
  // the outcome card has figures to show.
  await p.evaluate(() => {
    run.time = 42; run.kills = 7; run.tech = 11; run.coins = 25;
    player.invuln = 0; player.ward = 0;
    hurtPlayerBy(player.maxHp * 5, player.x, player.y);
  });
  await p.waitForFunction(() => state === 'over', null, { timeout: 8000 }).catch(() => {});
  const dead = await p.evaluate(() => ({
    state, up: document.getElementById('screens').classList.contains('up'),
    h1: document.querySelector('#screens h1')?.textContent,
    hudUp: (h => !!h && h.getBoundingClientRect().height > 0)(document.getElementById('hud')),
    alt: document.querySelector('#screens .alt')?.textContent }));
  ck('dying raises the outcome, and takes the HUD with it',
     dead.state === 'over' && dead.up && dead.hudUp === false,
     'state ' + dead.state + ', showing ' + JSON.stringify(dead.h1) +
     ', HUD ' + (dead.hudUp ? 'STILL UP' : 'down'));
  ck('and it offers the way back', /gate-house/i.test(dead.alt || ''),
     JSON.stringify(dead.alt));
  await tap('#screens .alt');
  await sleep(900);
  const after = await p.evaluate(() => ({
    state, h1: document.querySelector('#screens h1')?.textContent,
    walls: walls.length, runTime: +(run.time || 0).toFixed(1) }));
  ck('and taking it stands you in the gate-house on fresh ground, not over the corpse',
     after.state === 'menu' && /Gate-House/i.test(after.h1 || '') &&
     after.walls > 10 && after.runTime === 0,
     'state ' + after.state + ', ' + after.walls + ' walls, run.time ' + after.runTime);

  /* ---- 6. the frame the whole thing was drawn into ----------------------- */
  const px = await p.evaluate(() => {
    const g = window.__game, c = g.canvas;
    return { buffer: [c.width, c.height], css: [Math.round(c.getBoundingClientRect().width),
                                                Math.round(c.getBoundingClientRect().height)],
             dpr: window.devicePixelRatio,
             cam: g.scene.getScene('delve').cameras.main.zoom };
  });
  ck('the canvas is filled at the device’s own resolution',
     px.buffer[0] === Math.round(px.css[0] * px.dpr) &&
     px.buffer[1] === Math.round(px.css[1] * px.dpr) && px.dpr === DPR,
     'buffer ' + px.buffer.join('x') + ', css ' + px.css.join('x') + ' at dpr ' + px.dpr);
  ck('and shown at the size of the phone, so the two are not the same number',
     px.css[0] === VIEW.width && px.css[1] === VIEW.height && px.buffer[0] !== px.css[0],
     'css ' + px.css.join('x') + ' against a ' + VIEW.width + 'x' + VIEW.height + ' viewport');
  ck('and a world unit is still a CSS pixel', Math.abs(px.cam - DPR) < 0.01,
     'camera zoom ' + px.cam);

  /* ---- 7. the debug entrance still bypasses all of it -------------------- */
  await p.unroute('**/atlas.png');
  await p.unroute('**/bundle.js');
  await p.goto(base + '?nogate');
  for (let i = 0; i < 40; i++) {
    await sleep(250);
    if (await p.evaluate(() => !!(window.__game && typeof state !== 'undefined' && state === 'play'))
          .catch(() => false)) break;
  }
  const dbg = await p.evaluate(() => ({
    state, boot: !!document.getElementById('boot'),
    up: document.getElementById('screens')?.classList.contains('up') }));
  ck('?nogate still drops straight into a delve, with no card in the way',
     dbg.state === 'play' && dbg.boot === false && dbg.up === false,
     'state ' + dbg.state + ', card ' + (dbg.boot ? 'STILL UP' : 'gone'));

  ck('no console errors anywhere on the way in', errs.length === 0, errs.slice(0, 3).join(' | '));
  } catch (e) {
    // A throw is a finding, not a crash: something the path needs was not
    // there. Name it and print everything that DID get checked first.
    ck('the way in got all the way through', false, e.message.split('\n')[0]);
  }

  report();
  await b.close(); srv.kill();
  process.exit(fail.length ? 1 : 0);
})();
