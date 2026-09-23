// The UI hooks core.js fires, as no-ops.
//
// The core calls these to tell the page something changed -- a screen to show,
// a badge to refresh -- and the page is free to not care. Each is a no-op here
// and is claimed by whoever does care: host-real.js for the ones with real
// behaviour, src/ for the ones Phaser draws. Loaded BEFORE core.js, and each is
// assigned only if nothing has claimed it already.
//
// tools/check-core.js fails the build if core.js calls a function that is not
// here, in host-real.js, or in core.js itself. Add new hooks here.
(function (g) {
  const noop = function () {};
  if (g.saveStash === undefined) g.saveStash = noop;
  if (g.showScreen === undefined) g.showScreen = noop;
  if (g.syncBagBadge === undefined) g.syncBagBadge = noop;
  if (g.loadHonours === undefined) g.loadHonours = noop;
  if (g.buildKit === undefined) g.buildKit = noop;
  if (g.syncHeroSkin === undefined) g.syncHeroSkin = noop;
  if (g.renderGear === undefined) g.renderGear = noop;
  if (g.refreshKitLine === undefined) g.refreshKitLine = noop;
  if (g.buildStains === undefined) g.buildStains = noop;
  if (g.hitFlashUI === undefined) g.hitFlashUI = noop;
  if (g.rememberHardcore === undefined) g.rememberHardcore = noop;
  if (g.loadStash === undefined) g.loadStash = noop;
  if (g.dropHardcoreStash === undefined) g.dropHardcoreStash = noop;
  if (g.minimapBox === undefined) g.minimapBox = noop;
  if (g.forgeGround === undefined) g.forgeGround = noop;
  if (g.forgeWallCourses === undefined) g.forgeWallCourses = noop;
  if (g.syncHud === undefined) g.syncHud = noop;
  if (g.renderHall === undefined) g.renderHall = noop;
  if (g.$ === undefined) g.$ = noop;
  if (g.refreshVendorLine === undefined) g.refreshVendorLine = noop;
  if (g.refreshHallLine === undefined) g.refreshHallLine = noop;
  if (g.renderVendor === undefined) g.renderVendor = noop;
  if (g.loadBest === undefined) g.loadBest = noop;
  if (g.saveBest === undefined) g.saveBest = noop;
  if (g.saveHonours === undefined) g.saveHonours = noop;
  if (g.refreshBestLine === undefined) g.refreshBestLine = noop;
})(typeof window !== 'undefined' ? window : globalThis);
