/* ROOM ENCOUNTERS: a set piece that happens, and a coffer it keeps sealed.
 *
 *   - most Slag-Moors delves past the first hold two or three
 *   - the coffer is locked until the room is beaten: standing on it opens
 *     nothing, and says so
 *   - walking in (or reaching for the coffer, in the rooms that wait for
 *     that) wakes bodies of the rung's own kinds, inside the room
 *   - killing them all unseals the coffer, and it can then be opened
 *   - the chapel is held, not cleared: standing off the heart does not count
 *   - none of it on the proving ground
 */
const { chromium } = require('playwright');
const pages = require('./_pages.js');
const pass = [], fail = [];
const ck = (n, ok, note) => (ok ? pass : fail).push((ok ? '' : 'x ') + n + (note ? '  [' + note + ']' : ''));

(async () => {
  await pages.serve();
  const b = await chromium.launch();
  const p = await (await b.newContext()).newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(pages.core());
  await p.waitForFunction(() => typeof placeEncounters === 'function', null, { timeout: 30000 });

  const R = await p.evaluate(() => {
    const o = {};
    const step = secs => { for (let i = 0, n = Math.round(secs * 60); i < n; i++) update(1 / 60); };
    const fresh = idx => {
      stash = blankStash(); stash.region = 'slag';
      startRun('isaac', LEVELS[idx].id, 'riven');
      for (const e of enemies) e.hp = 0;
      enemies.length = 0;
      player.hp = player.maxHp = 1e9; player.invuln = 1e9;
    };

    // --- how many ----------------------------------------------------------
    let runs = 0, withEnc = 0, total = 0, badKind = 0;
    for (let t = 0; t < 20; t++) {
      fresh(2 + (t % 10)); runs++;
      if (encounters.length) withEnc++;
      total += encounters.length;
      for (const en of encounters) if (!en.chest.locked) badKind++;
    }
    o.count = { runs, withEnc, total, unlocked: badKind };
    fresh(0);
    o.proving = encounters.length;

    // --- one that is cleared -------------------------------------------------
    const find = pred => {
      for (let t = 0; t < 40; t++) {
        fresh(2 + (t % 10));
        const en = encounters.find(pred);
        if (en) return en;
      }
      return null;
    };
    let en = find(e => !ENCOUNTERS[e.id].hold);
    if (!en) return o;
    o.id = en.id;
    const ch = en.chest;
    // Standing on the locked coffer: nothing opens.
    const trig = ENCOUNTERS[en.id].trigger;
    player.x = ch.x; player.y = ch.y;
    step(0.2);
    o.lockedHeld = { open: ch.open, locked: ch.locked, state: en.state };
    // It has been triggered by now either way (standing on the coffer is
    // inside the room and within reach of it).
    o.woke = { state: en.state, n: en.foes.length,
               kinds: [...new Set(en.foes.map(e => e.kind))],
               ofRung: en.foes.every(e => LEVEL.horde.includes(e.kind)),
               inside: en.foes.every(e => e.x > en.room.box.x0 - 40 && e.x < en.room.box.x1 + 40 &&
                                          e.y > en.room.box.y0 - 40 && e.y < en.room.box.y1 + 40),
               awake: en.foes.every(e => e.awake) };
    // Kill them all.
    for (const e of en.foes) damageEnemy(e, 1e12, e.x, e.y);
    step(0.5);
    o.cleared = { state: en.state, locked: ch.locked };
    player.x = ch.x + 200; player.y = ch.y; step(0.1);
    player.x = ch.x; player.y = ch.y; step(0.3);
    o.opened = ch.open;

    // --- the chapel is held --------------------------------------------------
    en = find(e => e.id === 'chapel');
    if (en) {
      const rm = en.room;
      player.x = rm.x; player.y = rm.y; step(0.1);
      const live = en.state === 'live';
      // Off the heart: the clock stands still.
      const c = openCells.filter(q => q.x > rm.box.x0 + 30 && q.x < rm.box.x1 - 30 && q.y > rm.box.y0 + 30 &&
                                      q.y < rm.box.y1 - 30 && Math.hypot(q.x - rm.x, q.y - rm.y) > ENC_HOLD_R + 20)[0];
      let off = null;
      if (c) { const h0 = en.hold; player.x = c.x; player.y = c.y; step(2); off = +(en.hold - h0).toFixed(2); }
      player.x = rm.x; player.y = rm.y;
      step(ENCOUNTERS.chapel.hold + 0.5);
      o.chapel = { live, off, state: en.state, locked: en.chest.locked, raised: en.foes.length };
    }
    return o;
  });

  const C = R.count;
  ck('most delves past the first hold an encounter', C.withEnc >= C.runs * 0.7, C.withEnc + ' of ' + C.runs);
  ck('and every one keeps its coffer locked', C.unlocked === 0 && C.total > 0, JSON.stringify(C));
  ck('none on the proving ground', R.proving === 0, String(R.proving));
  if (R.id) {
    ck('standing on a locked coffer opens nothing', !R.lockedHeld.open && R.lockedHeld.locked,
       R.id + ' ' + JSON.stringify(R.lockedHeld));
    ck('the room wakes: bodies of the rung’s own kinds, in the room, awake',
       R.woke.state === 'live' && R.woke.n >= 2 && R.woke.ofRung && R.woke.inside && R.woke.awake,
       JSON.stringify(R.woke));
    ck('killing them all unseals the coffer', R.cleared.state === 'done' && !R.cleared.locked,
       JSON.stringify(R.cleared));
    ck('and it can then be opened', R.opened === true);
  } else ck('found a room to clear', false);
  if (R.chapel) {
    ck('the chapel: stepping off the heart stops the clock', R.chapel.live && R.chapel.off === 0,
       JSON.stringify(R.chapel));
    ck('...and holding it long enough wins the room', R.chapel.state === 'done' && !R.chapel.locked &&
       R.chapel.raised > 2, JSON.stringify(R.chapel));
  } else ck('found a chapel', false);
  ck('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));

  console.log('\nPASS ' + pass.length + '\n  ' + pass.join('\n  '));
  console.log('\nFAIL ' + fail.length + (fail.length ? '\n  ' + fail.join('\n  ') : ''));
  await b.close(); pages.stop(); process.exit(fail.length ? 1 : 0);
})();
