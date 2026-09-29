/* ROOM MOODS: each kind of room has its own air.
 *
 *   - every room of every region has a mood (set pieces in the Moors, the
 *     older rooms elsewhere), and no two set pieces share a grade
 *   - moodAt reads the room you stand in, and nothing in a corridor
 *   - each room lights a soft pool of its own colour at its heart
 *
 * The blending itself is the renderer's (atmosphere.js), and a screenshot is
 * the only honest check of how it looks; this checks that the core hands it
 * the right room, which is what would make it wrong everywhere at once.
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
  await p.waitForFunction(() => typeof moodAt === 'function', null, { timeout: 30000 });

  const R = await p.evaluate(() => {
    const o = { noMood: [], inside: 0, insideOk: 0, corridor: 0, corridorOk: 0, glows: 0, rooms: 0 };
    for (const region of REGIONS.map(r => r.id)) {
      for (let t = 0; t < 3; t++) {
        stash = blankStash(); stash.region = region;
        startRun('isaac', LEVELS[3 + t].id, 'riven');
        for (const rm of rooms) {
          o.rooms++;
          const M = moodOf(rm);
          if (!M) { o.noMood.push(region + ':' + (rm.set || rm.kind)); continue; }
          if (lamps.some(L => L.room && L.x === rm.x && L.y === rm.y && L.span >= 260 && L.color === M.glow)) o.glows++;
          // A cell well inside the room reads as the room.
          const c = openCells.find(q => roomAt(q.x, q.y) === rm);
          if (c) { o.inside++; if (moodAt(c.x, c.y) === M) o.insideOk++; }
        }
        // And the corridors read as nothing.
        for (const c of openCells.filter((q, i) => i % 23 === 0)) {
          if (roomAt(c.x, c.y)) continue;
          o.corridor++;
          if (moodAt(c.x, c.y) === null) o.corridorOk++;
        }
      }
    }
    const setGrades = ['throne', 'forge', 'ossuary', 'garrison', 'stores', 'chapel', 'cistern']
      .map(id => ROOM_MOODS[id].grade);
    o.distinct = new Set(setGrades).size;
    return o;
  });

  ck('every room of every region has a mood', R.noMood.length === 0 && R.rooms > 20,
     R.noMood.slice(0, 5).join(', ') || R.rooms + ' rooms');
  ck('no two set pieces share a colour', R.distinct === 7, R.distinct + ' of 7');
  ck('standing in a room reads that room', R.inside > 20 && R.insideOk === R.inside, R.insideOk + ' of ' + R.inside);
  ck('a corridor reads as no room', R.corridor > 20 && R.corridorOk === R.corridor, R.corridorOk + ' of ' + R.corridor);
  ck('each room lights its own pool at its heart', R.glows === R.rooms - R.noMood.length, R.glows + ' of ' + R.rooms);
  ck('no console errors', errs.length === 0, errs.slice(0, 3).join(' | '));

  console.log('\nPASS ' + pass.length + '\n  ' + pass.join('\n  '));
  console.log('\nFAIL ' + fail.length + (fail.length ? '\n  ' + fail.join('\n  ') : ''));
  await b.close(); pages.stop(); process.exit(fail.length ? 1 : 0);
})();
