/* The seventeen things core.js calls that it does not declare.
 *
 * The list is generated at the foot of core.js, so this file is checked
 * against it rather than remembered: tools/verify-core.cjs fails if the two
 * disagree, which is what stops a stub quietly going missing after an edit to
 * index.html.
 *
 * Three kinds live here:
 *
 *   PERSISTENCE  saveStash / loadBest / saveBest are real. They are only
 *                absent from the core because they touch localStorage, which
 *                is a browser API and so was excluded by the rule -- but they
 *                carry the stash between delves and a no-op would lose every
 *                run's loot.
 *
 *   DRESSING     buildStains, forgeGround, forgeWallCourses, forgeCut and
 *                minimapBox make pictures. Nothing in the simulation reads
 *                what they produce (checked, not assumed), so they are no-ops
 *                here and Phaser draws its own.
 *
 *   UI           showScreen and the render/sync family drive the DOM menus.
 *                Phaser will supply its own; until it does they are no-ops so
 *                the simulation can be exercised headlessly.
 */

const STORE_KEY = 'rivenmark.best.v1';
const STASH_KEY = 'rivenmark.stash.v1';

export function installHost(g, opts = {}) {
  const noop = () => {};

  // --- persistence, real ---------------------------------------------------
  g.loadBest = () => {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; }
    catch (e) { return {}; }
  };
  g.saveBest = b => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(b)); } catch (e) {}
  };
  g.saveStash = () => {
    try {
      g.stash.seq = g.itemSeq;
      localStorage.setItem(STASH_KEY, JSON.stringify(g.stash));
    } catch (e) {}
  };

  // --- dressing, drawn by Phaser instead ------------------------------------
  g.buildStains = noop;          // floor decals; nothing reads them back
  g.forgeGround = noop;          // ground tile sprites
  g.forgeWallCourses = noop;     // masonry sprites
  g.forgeCut = noop;             // gear icon cut from a sheet
  // Returns a box the canvas HUD used. Phaser lays its own out; a zero box is
  // honest about there being no minimap here rather than inventing one.
  g.minimapBox = () => ({ x: 0, y: 0, s: 0, pad: 0, over: 0 });

  // --- the DOM menus, not yet ported ---------------------------------------
  g.showScreen = opts.showScreen || noop;
  g.buildKit = noop;
  g.syncKit = noop;
  g.syncHeroSkin = noop;
  g.renderGear = noop;
  g.renderHall = noop;
  g.renderVendor = noop;
  // The simulation reads the viewport: spawnEnemy places bodies in a ring just
  // past the edge of the screen, sized from view.w/h. Left at 0x0 the ring
  // collapses to 60 units and the delve sends a fraction of what it should, so
  // resize is real -- it copies Phaser's scale into the core's `view`.
  g.resize = opts.resize || function () {
    if (!opts.scale || !g.view) return;
    g.view.w = opts.scale.width;
    g.view.h = opts.scale.height;
    g.view.dpr = window.devicePixelRatio || 1;
  };
  // The canvas build's element lookup. Everything asking for one is a menu
  // that does not exist yet, and every caller null-checks, so null is the
  // truthful answer rather than a fake element that swallows writes.
  g.$ = () => null;

  // Render state the core still touches: resetRun clears the gradient cache and
  // the sprite table. Phaser draws from its atlas, so SPR stays empty -- but it
  // has to be there to be cleared.
  g.wallGrads = new Map();
  g.SPR = {};

  // Run flow and the remaining menu lines. endRun is the one that matters:
  // the simulation calls it when the hero dies or the gate is reached, so the
  // host has to decide what happens next. A no-op here leaves a headless run
  // simply carrying on, which is what the suites want.
  g.endRun = opts.endRun || noop;
  g.refreshHallLine = noop;
  g.refreshVendorLine = noop;
  g.refreshKitLine = noop;
  g.forge = () => null;   // sprite forge; Phaser draws from the atlas

  return g;
}
