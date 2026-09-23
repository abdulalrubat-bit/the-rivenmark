/* The loop around a delve: descending, ending, and going again.
 *
 * The core already owns all of it -- startRun, endRun, bankRun, stepThrough,
 * the corpse, the stash -- and it already composes the outcome copy. endRun
 * writes that copy into `el`, the canvas build's map of DOM nodes, which the
 * host stubs as a store; so this reads back what the core wrote rather than
 * writing the same sentences a second time and letting the two drift.
 *
 * DOM, like the HUD, and for the same reasons: real buttons, crisp text, and
 * it survives the renderer.
 */

/* global hcFellAway, DIFFICULTIES, player, run, stash, state, LEVELS, LEVEL, LEVEL_BY_ID, HEROES,
          startRun, endRun, stepThrough, blankStash, el, stashPower, resumeRun,
          REGION_BY_ID, REGION_RELIC, hardcore, setHardcore, honoured, delveStanding,
          recommendedLevel,
          todaysBounty, bountyDone,
          SLOTS, SLOT_BY_ID, RARITY, itemPower, affixText, saveStash,
          VENDOR, vendorCost, canAfford, vendorBuy, HALL, hallTier,
          HALL_MAX, hallBuy, vaultCap, loadoutCap, saveLoadout, applyLoadout,
          deleteLoadout, discardFromVault, gearCtx, closeGear, compareLines,
          bagCap, player, LOADOUT_MAX */

const CSS = `
/* The safe areas, same as the HUD -- see the note at the top of hud.js. The
   scrim wants the whole glass, so the padding is on the scroller and the
   cards live inside it: a pinned Descend at bottom:0 was sitting in the home
   indicator's strip. */
#screens{position:fixed;inset:0;z-index:40;display:none;place-items:center;
  padding:var(--sa-t) var(--sa-r) var(--sa-b) var(--sa-l);box-sizing:border-box;
  background:rgba(8,7,6,.86);font:13px ui-monospace,Menlo,monospace;color:#cebe9e;
  -webkit-user-select:none;user-select:none;overflow:auto}
#screens.up{display:grid}
/* CUT FROM THE SAME STONE AS THE DELVE.
 *
 * These were flat dark boxes with a hairline round them, which was fine while
 * the HUD was flat dark discs -- and stopped being fine the moment the kit
 * grew a bronze band and a slate face. Everything the player looks at is one
 * object now: a band of bronze lit from the north-west, a dark line, and a
 * slate face under it.
 *
 * Done with a transparent border and two background layers rather than a
 * wrapper element, so the markup of four stations does not have to change:
 * the face is clipped to the padding box and the band to the border box, so
 * the border IS the band and the radius follows both.
 */
#screens .card{width:min(340px,92vw);border:3px solid transparent;border-radius:10px;
  /* The face must be OPAQUE. Half-transparent, the band underneath shows
     straight through it -- the band is painted over the whole border box, and
     the face only clips WHERE it lands, not what is beneath -- so the top of
     the card came out bright bronze instead of dark stone. */
  background-image:linear-gradient(#241f18,#15120e 40%,#100e0b),
    linear-gradient(#e2b96a,#a67c3a 34%,#6d4d22 70%,#3a2610);
  background-origin:border-box;background-clip:padding-box,border-box;
  padding:16px;box-shadow:0 12px 40px rgba(0,0,0,.6),inset 0 1px 0 rgba(150,172,200,.18);
  margin:16px 0}
/* The title takes the rule the gate-house plates have. */
#screens h1{font:22px Georgia,"Times New Roman",serif;color:#eee0c0;margin:0 0 10px;
  padding-bottom:8px;border-bottom:1px solid rgba(166,124,58,.45);
  box-shadow:0 1px 0 rgba(0,0,0,.6)}
#screens h1 em{font-style:normal;color:#d6b26e}
#screens h1 span{color:#c0392b}
#screens .sub{color:#a89878;font-style:italic;margin:0 0 12px;line-height:1.45}
#screens .stats{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:0 0 14px}
#screens .stats div{background:#1a1712;border:1px solid #33291f;border-radius:5px;
  padding:6px 8px;display:flex;justify-content:space-between}
#screens .stats b{color:#eee0c0}
/* A scrolling list cut off mid-row reads as a bug rather than as more below,
   so the last few pixels fade out. Sticky rather than fixed: the fade belongs
   to the bottom of the viewport of this list, wherever that has scrolled to. */
#screens .rows{display:grid;gap:6px;margin:0 0 14px;max-height:44vh;overflow:auto;
  position:relative;
  -webkit-mask-image:linear-gradient(#000 calc(100% - 22px),transparent);
  mask-image:linear-gradient(#000 calc(100% - 22px),transparent)}
#screens .row{display:flex;justify-content:space-between;align-items:center;gap:8px;
  background:#1a1712;border:1px solid #33291f;border-radius:6px;padding:9px 10px;
  text-align:left;color:inherit;font:inherit;min-height:44px}
#screens .row.on{border:2px solid transparent;
  background-image:linear-gradient(rgba(44,36,22,.95),rgba(24,19,12,.98)),
    linear-gradient(#e2b96a,#a67c3a 34%,#6d4d22 70%,#3a2610);
  background-origin:border-box;background-clip:padding-box,border-box;
  box-shadow:inset 0 1px 0 rgba(214,178,110,.22)}
#screens .row small{color:#8c8168;display:block}
/* A row with a second, smaller control beside it: discard on a vault piece,
   let go on a preset. Kept apart from the row so the big target does the
   common thing and the rare, permanent one needs its own deliberate tap. */
#screens .pair{display:flex;gap:6px}
#screens .pair>.row{flex:1;min-width:0}
#screens .drop{flex:none;min-width:44px;min-height:44px;border-radius:6px;padding:0 6px;
  background:#191510;border:1px solid #4a3f30;color:#8c8168;font:inherit}
#screens .drop.armed{border-color:#c0392b;color:#ffb4a0;background:#2a1612}
/* What a carried piece would change against what is worn, per stat. */
#screens .cmp{display:block;margin-top:3px;font-size:11px}
#screens .cmp .up{color:#8fd08a}
#screens .cmp .down{color:#e08a7a}
/* THE ONE BUTTON THAT DOES THE THING, ALWAYS WITHIN REACH.
 *
 * Measured on a 390x844 phone: the gate-house card is 1317px tall -- four
 * stations, a purse, a power, two heroes, eight rungs, the daily, the ground
 * and Hardcore -- and Descend sat at 1266, four hundred and seventy pixels
 * below the fold. The main menu's primary action could not be seen, and the
 * only way to find out the game had one was to scroll past everything else.
 *
 * Sticky rather than a shorter card. What is above it is genuinely worth
 * reading -- which rung, which hero, what today's bounty pays -- so the answer
 * is not to cut it; it is that the way out of the menu should not scroll
 * away. The bar under it is opaque and runs the full width of the card's
 * padding box, or rows slide out from behind the button and read as a
 * rendering fault.
 */
#screens .go.pinned{position:sticky;bottom:0;z-index:2;
  margin:4px -16px -16px;width:calc(100% + 32px);border-radius:0 0 7px 7px;
  border-width:2px 0 0}
#screens .go.pinned:before{content:'';position:absolute;left:0;right:0;
  bottom:100%;height:18px;pointer-events:none;
  background:linear-gradient(transparent,#100e0b)}
/* The one button that does the thing, on the same plate as an ability. */
#screens .go{width:100%;min-height:48px;border-radius:8px;
  border:2px solid transparent;
  background-image:linear-gradient(rgba(58,44,24,.92),rgba(28,20,11,.96)),
    linear-gradient(#e2b96a,#a67c3a 34%,#6d4d22 70%,#3a2610);
  background-origin:border-box;background-clip:padding-box,border-box;
  color:#f0e2c2;font:15px Georgia,serif;
  box-shadow:inset 0 1px 0 rgba(214,178,110,.3)}
#screens .go:active{background-image:linear-gradient(rgba(78,60,34,.95),rgba(44,32,18,.98)),
    linear-gradient(#e2b96a,#a67c3a 34%,#6d4d22 70%,#3a2610)}
/* The second way out of a card. Same size and same target -- a 44px rule does
   not stop applying because a button is the lesser of two -- but it does not
   take the gold, so a glance still finds the one you probably want. */
#screens .alt{width:100%;min-height:48px;border-radius:8px;background:#191510;
  color:#a89878;border:1px solid #6d4d22;font:14px Georgia,serif;margin-top:8px;
  box-shadow:inset 0 1px 0 rgba(150,172,200,.1)}
#screens .alt:active{background:#241d15}
#screens .seal{display:block;font-size:22px;color:#8c6830;margin:0 0 2px}
#screens .purse{display:flex;justify-content:space-between;margin:0 0 10px;color:#a89878}
#screens .tabs{display:flex;gap:6px;margin:0 0 12px}
#screens .tabs button{flex:1;min-height:40px;border-radius:6px;background:#1a1712;
  color:#a89878;border:1px solid #33291f;font:inherit}
/* The station you are in wears the band; the others are plain, so the rail
   reads as one object with a piece of it lit rather than as four boxes. */
#screens .tabs button.on{color:#f0e2c2;border:2px solid transparent;
  background-image:linear-gradient(rgba(48,38,22,.95),rgba(26,20,12,.98)),
    linear-gradient(#e2b96a,#a67c3a 34%,#6d4d22 70%,#3a2610);
  background-origin:border-box;background-clip:padding-box,border-box}
#screens .item{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
/* The name and its affixes are one column and must own the space they need,
   or the piece's power and the word for what tapping does drift left and land
   at the end of the affix line -- "+13% damage take off" read as one phrase. */
#screens .item>span:first-child{flex:1;min-width:0}
#screens .item .aff{color:#8c8168;font-size:11px;display:block;margin-top:2px;line-height:1.35}
#screens .pw{color:#d6b26e;white-space:nowrap;text-align:right;flex:none}
/* And the word is a tag, not more text. It is the only part of a row that
   says what happens if you touch it, so it is the part that must not look
   like the affixes it was sitting beside. */
#screens .act{display:block;color:#a89878;font-size:10px;margin-top:4px;
  letter-spacing:.5px;padding:2px 6px;border:1px solid #4a3f30;border-radius:3px;
  background:rgba(20,17,14,.6)}
#screens .empty{color:#6a6154;font-style:italic}
`;

export class Screens {
  /* onDescend(hero, levelId, diffId) starts a delve; onAbandon() throws the current
   * one away and comes back up. Both belong to the scene rather than here:
   * beginning or ending a delve means destroying and rebuilding every sprite
   * in it, and a menu has no business knowing that. */
  constructor(onDescend, onAbandon) {
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    this.onDescend = onDescend;
    this.onAbandon = onAbandon || (() => {});
    this.root = document.createElement('div');
    this.root.id = 'screens';
    document.body.appendChild(this.root);
    // Difficulty is chosen per visit, as the canvas build did, and starts at
    // Riven -- the game as it is meant to be played -- every session.
    this.pick = { hero: 'isaac', level: null, diff: 'riven' };
    this.name = null;
  }

  show(name) {
    this.name = name;
    if (!name) { this.root.classList.remove('up'); return; }
    this.root.classList.add('up');
    if (name === 'paused') this.renderPaused();
    else if (name === 'over') this.renderOver();
    // 'gear' is two screens. Mid-delve the core opens it on the bag you are
    // carrying (openGear('run'), which also stops the delve); from the
    // gate-house it is the Forge, on the vault.
    else if (name === 'gear') {
      if (state === 'gear' && gearCtx && gearCtx.live) this.renderBag();
      else this.renderForge();
    }
    else if (name === 'vendor') this.renderVendor();
    else if (name === 'hall') this.renderHall();
    else this.renderGatehouse();
  }

  /* Held. The delve is still standing behind this -- the scene keeps drawing
   * it, the core simply stops being stepped -- so the card says so and offers
   * the two things a stopped run can do. Abandoning is deliberately the lesser
   * button and deliberately says what it costs: nothing is banked.
   */
  /* In Hardcore, abandoning IS dying (see abandonDelve in the core), so the
   * button says so and takes two taps -- the same two-tap confirm as taking up
   * one life, for the same reason: it is the direction that cannot be undone.
   */
  renderPaused(armed) {
    const hc = typeof hardcore !== 'undefined' && hardcore;
    const leave = !hc ? 'Abandon the delve'
      : armed ? 'Tap again \u2014 this ends your life'
              : 'Abandon the delve \u2014 in Hardcore, this is death';
    this.root.innerHTML =
      '<div class="card">' +
        '<span class="seal">\u2620\ufe0e</span>' +   // FE0E: the glyph, not the emoji
        '<h1>Held</h1>' +
        '<p class="sub">The delve waits. It does not wait kindly.</p>' +
        '<button class="go" type="button">Press on</button>' +
        '<button class="alt" type="button">' + leave + '</button>' +
      '</div>';
    this.root.querySelector('.go').addEventListener('click', () => {
      if (typeof resumeRun === 'function') resumeRun();
      else this.show(null);
    });
    this.root.querySelector('.alt').addEventListener('click', () => {
      if (hc && !armed) return this.renderPaused(true);
      this.onAbandon();
    });
  }

  /* THE DAILY.
   *
   * One delve a day, named in advance, on ground that has been changed. Both
   * the twist and the rung fall out of the date, so there is nothing to
   * synchronise and nothing to store except whether you have taken it.
   */
  daily() {
    if (typeof todaysBounty !== 'function') return '';
    const b = todaysBounty();
    const done = bountyDone();
    const armed = !done && stash.bountyArmed;
    return '<p class="sub">Today\u2019s bounty.</p>' +
      '<button class="row' + (armed ? ' on' : '') + '" id="bountyRow" type="button"' +
        (done ? ' disabled' : '') + '><span>' + b.name +
        '<small>' + b.note + '<br>' + b.level +
        /* The reward as a chip, not as more grey text. It sat beside a
         * two-line description in the same colour at the same size, and the
         * eye read straight across the two columns -- "and each / a Hallowed"
         * on one line, "one worth less. / piece" on the next. */
        '</small></span><span class="act">' +
        (done ? 'paid' : armed ? 'taken' : 'a Hallowed piece') +
      '</span></button>';
  }

  /* ONE LIFE.
   *
   * Hardcore is a second stash, not a setting on the first, so switching
   * destroys nothing -- the other kit is put down and picked up again later.
   * The two-tap confirm is only on the way IN, because that is the direction
   * where the next death is final; coming back out is free and asking about
   * it would only teach the player to tap through the question.
   */
  oneLife() {
    const on = typeof hardcore !== 'undefined' && hardcore;
    const won = typeof honoured === 'function' && honoured();
    const arm = this.hcArmed && !on;
    return '<button class="row' + (on ? ' on' : '') + '" id="hcToggle" type="button">' +
      '<span>' + (on ? 'Hardcore' : 'One life') +
        '<small>' + (on && typeof hcFellAway !== 'undefined' && hcFellAway
          ? 'Your last life ended: its delve was left unfinished. Begin again.'
          : arm
          ? 'Tap again. One death ends everything this Vanguard owns.'
          : on ? 'One death ends it. Loot and Regalia come half again as often.'
               : 'A separate stash, and a separate life. Tap to take it up.') +
        '</small></span>' +
      (won ? '<small>\u25c8 crimson</small>' : (on ? '<small>\u00d71.5</small>' : '')) +
      '</button>';
  }

  /* WHICH GROUND, and what it keeps.
   *
   * A rung deep enough to reach the Rot-Weald can be cut from five regions,
   * and the delve used to roll one -- which made "the rings are in the
   * Rot-Weald" advice nobody could act on. Asking for the ground is what turns
   * the Regalia's scattering into a reason to go somewhere.
   *
   * Only shown where there is a choice. On the first rungs the pool is one
   * region and a picker with one option in it is furniture.
   */
  /* HOW HARD. Three difficulties were built into the rules -- a delve to learn
   * on, the game as it is, and one where the Regalia surfaces -- and until now
   * only the canvas build could choose between them: this build always played
   * Riven. The multipliers are shown because they are the real trade, and the
   * note says what they mean in a sentence. */
  difficulty() {
    return '<p class="sub">How hard the delve comes at you.</p>' +
      '<div class="rows" id="diffRows">' +
      DIFFICULTIES.map(D =>
        '<button class="row' + (this.pick.diff === D.id ? ' on' : '') +
        '" data-diff="' + D.id + '" type="button"><span>' + D.name +
        '<small>' + D.note + '</small></span>' +
        '<small class="verdict">threat \u00d7' + D.threat.toFixed(2) +
        ' \u00b7 loot \u00d7' + D.lootRate.toFixed(2) + '</small></button>').join('') +
      '</div>';
  }

  ground() {
    const L = LEVEL_BY_ID[this.pick.level];
    if (!L || !L.regions || L.regions.length < 2) {
      // Still say what the one region keeps -- that is the whole point of
      // naming them, and it is true whether or not there is anything to pick.
      const only = L && L.regions && L.regions[0];
      const keeps = only && this.relicWord(only);
      return keeps ? '<p class="sub">Cut from ' +
        (REGION_BY_ID[only] || {}).name + ', which keeps ' + keeps + '.</p>' : '';
    }
    const want = stash.region;
    const cell = (id, label, note) =>
      '<button class="row' + ((want || 'any') === id ? ' on' : '') +
      '" data-region="' + id + '" type="button"><span>' + label +
      (note ? '<small>' + note + '</small>' : '') + '</span></button>';
    return '<p class="sub">The ground, and what the Regalia left in it.</p>' +
      '<div class="rows" id="regionRows">' +
        cell('any', 'Whatever the rung offers', 'a region rolled per delve') +
        L.regions.map(id => cell(id, (REGION_BY_ID[id] || {}).name || id,
                                  this.relicWord(id))).join('') +
      '</div>';
  }

  /* "the blade and the amulet", from the slots this region keeps. Written out
   * rather than listed, because a row of slot ids is a database and this is a
   * sentence about a place. */
  relicWord(regionId) {
    const slots = (typeof REGION_RELIC !== 'undefined' && REGION_RELIC[regionId]) || null;
    if (!slots || !slots.length) return '';
    const seen = [], names = [];
    for (const id of slots) {
      const sl = SLOT_BY_ID[id];
      if (!sl || seen.indexOf(sl.name) >= 0) continue;   // both rings are "Ring"
      seen.push(sl.name);
      names.push(sl.name.toLowerCase());
    }
    if (!names.length) return '';
    const many = slots.length > names.length;            // ring1 + ring2
    const said = names.length === 1 ? 'the ' + names[0] + (many ? 's' : '')
               : 'the ' + names.slice(0, -1).join(', the ') + ' and the ' + names[names.length - 1];
    return said;
  }

  /* The outcome. Every word of it was written by endRun -- which knows what
   * was banked, what the corpse kept and whether an older one was lost -- and
   * read back out of the store the host gives it.
   *
   * Two ways off it. "To the gate-house" was the only one, which made going
   * again a three-tap trip through a menu you had just been told the result
   * of; and the gate-house was the only way back to a menu at all, because
   * until now there was no leaving a delve except by dying or extracting.
   */
  renderOver() {
    const title = (el.overTitle && el.overTitle.innerHTML) || 'The delve ends';
    const sub = (el.overSub && el.overSub.textContent) || '';
    const stats = (el.overStats && el.overStats.innerHTML) || '';
    this.root.innerHTML =
      '<div class="card">' +
        '<h1>' + title + '</h1>' +
        '<p class="sub">' + sub + '</p>' +
        '<div class="stats">' + stats + '</div>' +
        '<button class="go" type="button">Descend again</button>' +
        '<button class="alt" type="button">To the gate-house</button>' +
      '</div>';
    // The same delve and the same hero the run that just ended used. run is
    // still the finished run at this point -- endRun banks it, it does not
    // clear it -- so it is the only place that answers "again" correctly.
    const hero = (run && run.hero) || this.pick.hero;
    const lvl = (run && run.level_id) || this.pick.level;
    const diff = (run && run.diff_id) || this.pick.diff;
    this.root.querySelector('.go').addEventListener('click', () => {
      this.pick.hero = hero;
      if (lvl) this.pick.level = lvl;
      this.pick.diff = diff;
      this.onDescend(hero, lvl, diff);
    });
    /* THROUGH THE SAME DOOR AS ABANDONING, NOT STRAIGHT TO THE CARD.
     *
     * This used to call show('splash') and nothing else, so the gate-house
     * came up over the delve you had just died in -- the corpse, the horde
     * and all -- with `state` still 'over' and no world of its own. It
     * recovered the moment you descended again, which is why nobody saw it,
     * but the screen in between was the last delve with a menu on top.
     *
     * onAbandon is exactly the verb: put the delve down, take nothing
     * further from it, and stand in the gate-house on fresh ground. That the
     * run here has already been banked by endRun makes no difference to what
     * has to happen to the world.
     */
    this.root.querySelector('.alt').addEventListener('click', () => this.onAbandon());
  }

  /* Which delve, and who goes down. The ladder is long, so this shows the
   * rungs around the one you can actually handle rather than all fifty-two. */
  renderGatehouse() {
    // stashPower(), not powerLevel(). powerLevel takes (gear, level) and
    // called bare returns NaN -- which then compares false against every rung
    // and quietly labelled the whole ladder "an even match".
    const power = typeof stashPower === 'function' ? stashPower() : 1;
    /* Open where the core says to, not on rung 0 for everybody. This used to
     * be `LEVELS[0].id` flat, so a hero geared deep enough for rung 47 was
     * shown the first eight rungs -- all of them "well within you" -- and had
     * to scroll past thirty-nine to reach anything worth doing. The canvas
     * gate-house had always picked a rung; the two builds simply disagreed. */
    if (!this.pick.level) {
      this.pick.level = typeof recommendedLevel === 'function'
        ? recommendedLevel(power) : LEVELS[0].id;
    }
    const here = LEVELS.findIndex(l => l.id === this.pick.level);
    const from = Math.max(0, here - 3), to = Math.min(LEVELS.length, from + 8);
    const rungs = LEVELS.slice(from, to);

    // What the corpse is carrying, said only where there is something to say:
    // "0 finds and 25 coin" is a sentence written by arithmetic rather than by
    // anyone.
    let corpse = '';
    if (stash.corpse) {
      const c = stash.corpse, bits = [];
      if (c.items.length) bits.push(c.items.length + ' find' + (c.items.length === 1 ? '' : 's'));
      if (c.coins) bits.push(c.coins + ' coin');
      corpse = '<p class="sub">A corpse of yours lies in ' +
        ((LEVEL_BY_ID[c.level_id] || {}).name || 'a delve') +
        (bits.length ? ' with ' + bits.join(' and ') : '') +
        '. Descend there and take it back.</p>';
    }

    this.root.innerHTML =
      '<div class="card">' +
        '<h1>The Gate-House</h1>' +
        this.tabs('splash') +
        '<p class="sub">Choose a rung and one of the Clear-Sighted.</p>' +
        this.purse() +
        '<div class="purse"><span>Power</span><b>' + power + '</b></div>' +
        corpse +
        '<div class="rows" id="heroRows">' +
          Object.values(HEROES).map(h =>
            '<button class="row' + (this.pick.hero === h.id ? ' on' : '') +
            '" data-hero="' + h.id + '" type="button"><span>' + h.name +
            '<small>' + h.title + '</small></span></button>').join('') +
        '</div>' +
        '<div class="rows" id="rungRows">' +
          rungs.map(l =>
            /* THE CORE'S VERDICT, NOT A SECOND ONE.
             *
             * This used to carry its own copy -- a flat plus-or-minus two
             * around the rung's power -- while the core has had
             * delveStanding all along, with four bands and a colour for
             * each. Two verdict functions on the same pair of numbers is
             * one that will disagree, and they did: the core calls a rung
             * an even match up to fourteen points under you, this called it
             * "well within you" at three. The gate-house is where the
             * player decides what to attempt, and it was giving different
             * advice from every other place the same question is asked.
             */
            ((v) =>
            '<button class="row' + (this.pick.level === l.id ? ' on' : '') +
            '" data-level="' + l.id + '" type="button"><span>' + l.name +
            '<small>power ' + l.power + ' · ' + l.quota + ' slag</small></span>' +
            '<small class="verdict" style="color:' + v.colour + '">' + v.text +
            '</small></button>')(delveStanding(l, power))).join('') +
        '</div>' +
        this.difficulty() +
        this.daily() +
        this.ground() +
        this.oneLife() +
        '<button class="go pinned" type="button" id="descend">Descend</button>' +
      '</div>';

    this.root.querySelectorAll('[data-hero]').forEach(b =>
      b.addEventListener('click', () => { this.pick.hero = b.dataset.hero; this.renderGatehouse(); }));
    this.root.querySelectorAll('[data-level]').forEach(b =>
      b.addEventListener('click', () => { this.pick.level = b.dataset.level; this.renderGatehouse(); }));
    this.root.querySelectorAll('[data-diff]').forEach(b =>
      b.addEventListener('click', () => { this.pick.diff = b.dataset.diff; this.renderGatehouse(); }));
    const bt = this.root.querySelector('#bountyRow');
    if (bt) bt.addEventListener('click', () => {
      const b = todaysBounty();
      if (bountyDone()) return;
      stash.bountyArmed = !stash.bountyArmed;
      // Taking it also takes you to its rung: a daily you have to go and find
      // on the ladder is a daily half the people who took it never ran.
      if (stash.bountyArmed) this.pick.level = b.level_id;
      saveStash();
      this.renderGatehouse();
    });
    const hc = this.root.querySelector('#hcToggle');
    if (hc) hc.addEventListener('click', () => {
      // Nothing is destroyed by switching: the two stashes are separate keys
      // and the other one is simply put down. The confirmation is for turning
      // Hardcore ON, where the next death is final, and not for coming back.
      if (!hardcore && !this.hcArmed) { this.hcArmed = true; this.renderGatehouse(); return; }
      this.hcArmed = false;
      setHardcore(!hardcore);
      this.pick.hero = stash.hero || this.pick.hero;
      this.renderGatehouse();
    });
    this.root.querySelectorAll('[data-region]').forEach(b =>
      b.addEventListener('click', () => {
        const id = b.dataset.region;
        stash.region = id === 'any' ? null : id;
        saveStash();
        this.renderGatehouse();
      }));
    this.wireTabs();
    this.root.querySelector('#descend').addEventListener('click', () => {
      this.root.classList.remove('up');
      this.onDescend(this.pick.hero, this.pick.level, this.pick.diff);
    });
  }

  tabs(on) {
    const t = (id, label) =>
      '<button type="button" data-tab="' + id + '" class="' + (on === id ? 'on' : '') +
      '">' + label + '</button>';
    return '<div class="tabs">' + t('splash', 'Descend') + t('gear', 'Forge') +
           t('vendor', 'Vendor') + t('hall', 'Hall') + '</div>';
  }

  // A line of coin, shown wherever coin is spent.
  purse() {
    return '<div class="purse"><span>Purse</span><b>' +
           (stash.coins || 0) + ' coin</b></div>';
  }

  /* The vendor. Costs and affordability come from the core -- vendorCost reads
   * the hall's discount and the pity counter -- so the price on the button is
   * the price that will actually be taken.
   */
  renderVendor() {
    const rows = VENDOR.map(v => {
      const cost = vendorCost(v);
      const can = canAfford(v);
      return '<button class="row" type="button" data-buy="' + v.id + '"' +
        (can ? '' : ' disabled') + '><span class="item"><span><b>' + v.name +
        '</b><span class="aff">' + v.note + '</span></span>' +
        '<span class="pw"><span data-cost="' + cost + '">' + cost + '</span>' +
        '<span class="act">' + (can ? 'coin' : 'too dear') +
        '</span></span></span></button>';
    }).join('');

    this.root.innerHTML =
      '<div class="card">' +
        '<h1>The Vendor</h1>' + this.tabs('vendor') + this.purse() +
        (this.note ? '<p class="sub">' + this.note + '</p>' : '') +
        '<div class="rows">' + rows + '</div>' +
        (this.slotFor ? this.slotPicker() : '') +
      '</div>';

    this.wireTabs();
    this.root.querySelectorAll('[data-buy]').forEach(b =>
      b.addEventListener('click', () => this.buy(b.dataset.buy)));
    this.root.querySelectorAll('[data-slot]').forEach(b =>
      b.addEventListener('click', () => {
        const v = VENDOR.find(x => x.id === this.slotFor);
        this.finishBuy(v, b.dataset.slot);
      }));
    this.root.querySelectorAll('[data-cancel]').forEach(b =>
      b.addEventListener('click', () => { this.slotFor = null; this.renderVendor(); }));
  }

  /* Two of the three services need to know WHICH slot, so the purchase is a
   * two-step rather than a guess. Temper offers only what is worn, because
   * rerolling nothing is not a service. */
  slotPicker() {
    const v = VENDOR.find(x => x.id === this.slotFor);
    const list = SLOTS.filter(sl => v && v.worn ? !!stash.gear[sl.id] : true);
    if (!list.length)
      return '<p class="sub">Nothing is worn to temper.</p>' +
             '<button class="go" type="button" data-cancel="1">Back</button>';
    return '<p class="sub">Which slot?</p><div class="rows">' +
      list.map(sl => '<button class="row" type="button" data-slot="' + sl.id + '">' +
        '<span>' + sl.mark + ' ' + sl.name +
        (stash.gear[sl.id] ? '<small>' + stash.gear[sl.id].name + '</small>' : '') +
        '</span></button>').join('') +
      '</div><button class="go" type="button" data-cancel="1">Back</button>';
  }

  buy(id) {
    const v = VENDOR.find(x => x.id === id);
    if (!v) return;
    if (v.slot || v.worn) { this.slotFor = id; this.note = null; this.renderVendor(); return; }
    this.finishBuy(v, null);
  }

  finishBuy(v, arg) {
    const before = stash.coins || 0;
    const ok = vendorBuy(v, arg);
    this.slotFor = null;
    this.note = ok === false
      ? 'The vendor turns you away.'
      : 'Done — ' + (before - (stash.coins || 0)) + ' coin.';
    saveStash();
    this.renderVendor();
  }

  /* The hall. Four stations, three tiers each, and every tier says what it
   * changes rather than what it costs alone. */
  renderHall() {
    const rows = HALL.map(h => {
      const t = hallTier(h.id);
      const whole = t >= HALL_MAX;
      const next = whole ? null : h.tiers[t];
      const can = next && (stash.coins || 0) >= next.cost;
      return '<button class="row" type="button" data-hall="' + h.id + '"' +
        (whole || !can ? ' disabled' : '') + '><span class="item"><span><b>' +
        h.mark + ' ' + h.name + '</b><span class="aff">' +
        (whole ? 'Whole. ' + h.note : next.text) + '</span></span>' +
        '<span class="pw"><span data-cost="' + (whole ? '' : next.cost) + '">' +
        (whole ? '&mdash;' : next.cost) + '</span>' +
        '<span class="act">' + (whole ? 'built' : t + ' of ' + HALL_MAX) +
        '</span></span></span></button>';
    }).join('');

    this.root.innerHTML =
      '<div class="card">' +
        '<h1>The Hall</h1>' + this.tabs('hall') + this.purse() +
        (this.note ? '<p class="sub">' + this.note + '</p>' : '') +
        '<p class="sub">What you build here outlasts every delve.</p>' +
        '<div class="rows">' + rows + '</div>' +
      '</div>';

    this.wireTabs();
    this.root.querySelectorAll('[data-hall]').forEach(b =>
      b.addEventListener('click', () => {
        const h = HALL.find(x => x.id === b.dataset.hall);
        const why = hallBuy(h);
        this.note = why ? 'The mason shakes his head — ' + why + '.' : 'Built.';
        this.renderHall();
      }));
  }
  wireTabs() {
    this.root.querySelectorAll('[data-tab]').forEach(b =>
      b.addEventListener('click', () => this.show(b.dataset.tab)));
  }

  /* The Forge: what is worn, and what is in the vault.
   *
   * Equipping acts straight on stash.gear and stash.vault, the way the core's
   * own applyLoadout does. The canvas build routes this through a selection
   * model bound to its DOM, which is exactly the part that did not come
   * across, and re-implementing that model here would be inventing a second
   * way for the same two arrays to change.
   */
  /* One piece, as a row's contents: its name in its rarity's colour, what it
   * does, its power, and the word for what tapping does. */
  itemCard(it, act, extra) {
    const r = RARITY.find(x => x.id === it.rarity) || RARITY[0];
    const aff = it.affixes.map(a => affixText(a, stash.hero)).filter(Boolean).join(' · ');
    return '<span class="item"><span><b style="color:' + r.colour + '">' + it.name +
           '</b><span class="aff">' + (aff || '&mdash;') + '</span>' + (extra || '') +
           '</span>' +
           // The number is the piece's power; the word is what tapping does.
           // "41 · off" read as a state rather than an action.
           '<span class="pw">' + Math.round(itemPower(it)) +
           (act ? '<span class="act">' + act + '</span>' : '') +
           '</span></span>';
  }

  renderForge() {
    const cap = typeof vaultCap === 'function' ? vaultCap() : stash.vault.length;
    this.root.innerHTML =
      '<div class="card">' +
        '<h1>The Forge</h1>' +
        this.tabs('gear') +
        '<div class="purse"><span>Power</span><b>' + stashPower() + '</b></div>' +
        (this.note ? '<p class="sub">' + this.note + '</p>' : '') +
        '<p class="sub">Worn</p>' +
        '<div class="rows">' +
          SLOTS.map(sl => {
            const it = stash.gear[sl.id];
            return '<button class="row" type="button" data-off="' + sl.id + '"' +
              (it ? '' : ' disabled') + '>' +
              (it ? this.itemCard(it, 'take off')
                  : '<span class="item"><span>' + sl.mark + ' ' + sl.name +
                    '<span class="aff empty">nothing worn</span></span></span>') +
              '</button>';
          }).join('') +
        '</div>' +
        this.presets() +
        '<p class="sub">The vault &mdash; ' + stash.vault.length + ' of ' + cap + '</p>' +
        '<div class="rows">' +
          (stash.vault.length
            ? stash.vault.map((it, i) =>
                '<div class="pair"><button class="row" type="button" data-on="' + i + '">' +
                this.itemCard(it, 'wear') + '</button>' +
                '<button class="drop' + (this.dropArmed === i ? ' armed' : '') +
                '" type="button" data-drop="' + i + '" aria-label="discard">' +
                (this.dropArmed === i ? 'discard?' : '\u2715') + '</button></div>').join('')
            : '<div class="row"><span class="empty">Nothing here yet. ' +
              'Champions and the avatar carry the Regalia.</span></div>') +
        '</div>' +
      '</div>';

    // Any tap other than the second one on the same piece stands the discard
    // down again, so an armed button never lingers to be hit by accident.
    const done = () => { this.dropArmed = null; this.renderForge(); };
    this.wireTabs();
    this.root.querySelectorAll('[data-on]').forEach(b =>
      b.addEventListener('click', () => { this.note = null; this.equip(+b.dataset.on); done(); }));
    this.root.querySelectorAll('[data-off]').forEach(b =>
      b.addEventListener('click', () => { this.note = null; this.unequip(b.dataset.off); done(); }));
    this.root.querySelectorAll('[data-drop]').forEach(b =>
      b.addEventListener('click', () => {
        const i = +b.dataset.drop;
        if (this.dropArmed !== i) { this.dropArmed = i; this.renderForge(); return; }
        const it = discardFromVault(i);
        this.note = it ? it.name + ' is gone.' : null;
        done();
      }));
    this.root.querySelectorAll('[data-load]').forEach(b =>
      b.addEventListener('click', () => {
        const L = stash.loadouts[+b.dataset.load];
        const r = applyLoadout(L);
        this.note = L.name + ': ' + r.set + ' equipped' +
          (r.missing ? ', ' + r.missing + ' no longer in the vault' : '') + '.';
        done();
      }));
    this.root.querySelectorAll('[data-unload]').forEach(b =>
      b.addEventListener('click', () => {
        const i = +b.dataset.unload;
        if (this.unloadArmed !== i) { this.unloadArmed = i; this.renderForge(); return; }
        const name = (stash.loadouts[i] || {}).name;
        deleteLoadout(i);
        this.unloadArmed = null;
        this.note = name ? name + ' is let go. Nothing in it was touched.' : null;
        done();
      }));
    const sv = this.root.querySelector('#saveKit');
    if (sv) sv.addEventListener('click', () => {
      const L = saveLoadout();
      this.note = L.name + ' saved \u2014 the kit you are wearing, as it is now.';
      done();
    });
  }

  /* KIT PRESETS. A preset is a list of item ids, so wearing one takes each
   * piece out of the vault if it is still there and says how many were not.
   * Saved only while there is room -- the Hall's Vault is what buys more --
   * and let go of with two taps, the same as a discard. */
  presets() {
    const cap = typeof loadoutCap === 'function' ? loadoutCap() : 0;
    const Ls = stash.loadouts || [];
    return '<p class="sub">Kit presets &mdash; ' + Ls.length + ' of ' + cap + '</p>' +
      (Ls.length ? '<div class="rows">' + Ls.map((L, i) => {
        const worn = SLOTS.filter(sl => L.slots[sl.id] != null).length;
        return '<div class="pair"><button class="row" type="button" data-load="' + i + '">' +
          '<span>' + L.name + '<small>' + worn + ' of ' + SLOTS.length + ' pieces \u00b7 ' +
          ((HEROES[L.hero] || {}).name || '') + '</small></span>' +
          '<span class="act">wear</span></button>' +
          '<button class="drop' + (this.unloadArmed === i ? ' armed' : '') +
          '" type="button" data-unload="' + i + '" aria-label="let go">' +
          (this.unloadArmed === i ? 'let go?' : '\u2715') + '</button></div>';
      }).join('') + '</div>' : '') +
      (Ls.length < cap
        ? '<button class="alt" type="button" id="saveKit">Save what you are wearing</button>'
        : '<p class="sub">Every preset slot is taken. Let one go to save another' +
          (cap < LOADOUT_MAX + HALL_MAX ? ', or build out the Vault in the Hall.' : '.') + '</p>');
  }

  /* THE BAG, mid-delve. Read-only, as it always was: what you have picked up
   * and what each piece would change against what you are wearing. Swapping
   * is for the gate-house -- a menu you can change your kit in is a pause
   * button that also heals the fight. The delve is stopped while it is open
   * (the core's openGear), and Back is the core's closeGear. */
  renderBag() {
    const C = gearCtx;
    const lines = it => {
      const c = typeof compareLines === 'function' ? compareLines(it) : [];
      if (!c.length) return '<span class="cmp">no change against what you wear</span>';
      return '<span class="cmp">' + c.map(x =>
        '<span class="' + (x.good ? 'up' : 'down') + '">' + x.txt + ' ' + x.name +
        '</span>').join(' \u00b7 ') + '</span>';
    };
    this.root.innerHTML =
      '<div class="card">' +
        '<h1>The Bag</h1>' +
        '<p class="sub">Carried so far &mdash; ' + C.bag.length + ' of ' + C.cap +
          '. It banks only if you walk out with it.</p>' +
        '<div class="rows">' +
          (C.bag.length
            ? C.bag.map(it => '<div class="row">' + this.itemCard(it, null, lines(it)) +
                              '</div>').join('')
            : '<div class="row"><span class="empty">Nothing yet. Champions carry the ' +
              'best of it.</span></div>') +
        '</div>' +
        '<p class="sub">Worn</p>' +
        '<div class="rows">' +
          SLOTS.map(sl => {
            const it = C.gear[sl.id];
            return '<div class="row">' + (it ? this.itemCard(it, null)
              : '<span class="item"><span>' + sl.mark + ' ' + sl.name +
                '<span class="aff empty">nothing worn</span></span></span>') + '</div>';
          }).join('') +
        '</div>' +
        '<button class="go pinned" type="button" id="bagBack">Back to the delve</button>' +
      '</div>';
    this.root.querySelector('#bagBack').addEventListener('click', () => closeGear());
  }

  equip(index) {
    const it = stash.vault[index];
    if (!it || !SLOT_BY_ID[it.slot]) return;
    stash.vault.splice(index, 1);
    const prev = stash.gear[it.slot];
    stash.gear[it.slot] = it;
    // The piece it replaces goes back to the vault rather than vanishing --
    // losing an item to a mis-tap is not a trade anyone agreed to.
    if (prev) stash.vault.push(prev);
    saveStash();
  }

  unequip(slotId) {
    const it = stash.gear[slotId];
    if (!it) return;
    stash.gear[slotId] = null;
    stash.vault.push(it);
    saveStash();
  }
}
