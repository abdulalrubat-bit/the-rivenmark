/* Auto-strike off, for a suite that measures blows it asks for itself.
 *
 * The game turns auto-strike on by default, so a hero stood next to a body
 * swings at it unasked. A fixture that stages one blow -- an ability's, a
 * killing one, a thrown ring -- and then reads what it did would be reading
 * that plus whatever the automatic swings did around it: a body killed
 * before the ability reached it, a hit where a kill was staged. Installed as
 * an init script, so it holds across every load and every localStorage.clear()
 * the suite does. A suite that means to test auto-strike does not use this
 * (smoke:thumbs).
 */
module.exports = function manualBlows(target) {
  return target.addInitScript(() => {
    try {
      const k = 'rivenmark.settings.v1';
      const s = JSON.parse(localStorage.getItem(k) || '{}') || {};
      if (s.autostrike !== false) { s.autostrike = false; localStorage.setItem(k, JSON.stringify(s)); }
    } catch (e) { /* storage refused: the suite will say so on its own */ }
  });
};
