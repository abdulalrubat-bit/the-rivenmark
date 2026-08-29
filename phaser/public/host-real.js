/* The host functions core.js needs beyond the generated no-ops.
 *
 * Shared by the game (index.html) and the headless test page (core-test.html),
 * so the two cannot drift: a stub that exists only on the test page is one that
 * will be missing from the game exactly once, at the worst possible moment.
 *
 * Load order matters and is not arbitrary:
 *
 *   host-stubs.js   generated — a no-op for every name core.js calls and does
 *                   not declare, so nothing is ever merely absent
 *   host-real.js    this file — claims back the few that need real behaviour
 *   core.js         runs top-level initialisers as it loads, and some of them
 *                   reach for the host. Declared afterwards, the first of them
 *                   threw "resize is not defined" and aborted the whole script.
 */
(function () {
  const STORE_KEY = 'rivenmark.best.v1';
  const STASH_KEY = 'rivenmark.stash.v1';
  const noop = () => {};

  // --- persistence, real ---------------------------------------------------
  // Absent from the core only because they touch localStorage, which the rule
  // excluded as a browser API. They carry the stash between delves; a no-op
  // would lose every run's loot.
  window.loadBest = () => {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; }
    catch (e) { return {}; }
  };
  window.saveBest = b => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(b)); } catch (e) {}
  };
  window.saveStash = () => {
    try {
      stash.seq = itemSeq;
      localStorage.setItem(STASH_KEY, JSON.stringify(stash));
    } catch (e) {}
  };
  // The canvas build's version migrates old saves; this is the part that
  // matters here — read it back if it is there, start clean if it is not.
  window.loadStash = () => {
    let st = null;
    try { st = JSON.parse(localStorage.getItem(STASH_KEY)); } catch (e) {}
    if (!st || typeof st !== 'object') return blankStash();
    const base = blankStash();
    return Object.assign(base, st, { gear: Object.assign(base.gear, st.gear || {}) });
  };

  // --- dressing, drawn by Phaser instead -----------------------------------
  // Nothing in the simulation reads what these produce — checked, not assumed.
  window.buildStains = noop;
  window.forgeGround = noop;
  window.forgeWallCourses = noop;
  // NOT forgeCut: that is the hall's forge discount, not a sprite. Stubbing it
  // made every vendor price NaN.
  // A placeholder only until the game boots: src/overlay.js replaces this
  // with the real one, and the core's False Dawn crystal is placed under the
  // map by reading it. The core-test page has no map, so this stands there.
  window.minimapBox = () => ({ x: 0, y: 0, s: 0, pad: 0, over: 0 });

  // --- render state the core still touches ---------------------------------
  // resetRun() clears both. Phaser draws from its atlas, so SPR stays empty —
  // but it has to exist to be cleared.
  window.wallGrads = new Map();
  window.SPR = {};

  // --- the DOM menus, not yet ported ---------------------------------------
  window.showScreen = noop;
  window.buildKit = noop;
  window.syncKit = noop;
  window.syncHeroSkin = noop;
  window.renderGear = noop;
  window.renderHall = noop;
  window.renderVendor = noop;
  window.refreshBestLine = noop;
  window.refreshHallLine = noop;
  window.refreshVendorLine = noop;
  window.refreshKitLine = noop;
  window.forge = () => null;
  window.$ = () => null;

  // The canvas build's map of DOM nodes. Anything reaching into it gets
  // something harmless rather than a ReferenceError: every write lands on a
  // throwaway object and every read hands one back.
  window.el = new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : (t[k] = {
      textContent: '', innerHTML: '', hidden: false, style: {},
      classList: { toggle() {}, add() {}, remove() {} }
    })),
    set: (t, k, v) => (t[k] = v, true)
  });

  // The simulation reads the viewport: spawnEnemy places bodies in a ring just
  // past the edge of the screen, sized from view.w/h. Left at 0x0 that ring
  // collapses to 60 units and the delve sends a fraction of what it should —
  // extract.js caught it as 6 bodies then 4 against the canvas build's 11 then
  // 18. Whoever hosts the core owes it a real viewport.
  window.__setView = (w, h, dpr) => {
    if (typeof view === 'undefined') return;
    view.w = w; view.h = h; view.dpr = dpr || 1;
  };
  window.resize = () => {
    // Overridden by the game once Phaser's scale manager exists.
    if (typeof view !== 'undefined' && !view.w) window.__setView(390, 844, 1);
  };
})();
