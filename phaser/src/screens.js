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
          bagCap, player, LOADOUT_MAX, stashCtx, sortBag, bagShown, isUpgrade,
          BAG_SORTS, bagSort, bagFilter, TALENTS, TALENT_TIER, talentRanks, talentTreeSpent,
          talentPoints, talentBlock, learnTalent, talentResetCost, resetTalents, findTalent */

// A sound, if the engine is there to make one (it is not on the test pages).
import { settings, setSetting, setControlsSaved, SHAKES, QUALITIES } from './settings.js';

const snd = (name, mag) => { if (typeof window.sfx === 'function') window.sfx(name, undefined, undefined, mag); };

const CSS = `
#screens .sub.warn{color:#fb8d4d;border-left:2px solid #e06b27;padding-left:8px}

/* Settings: a row that holds a slider instead of being a button. */
#screens .row.slide{display:flex;align-items:center;gap:10px}
#screens .row.slide input[type=range]{flex:1;min-width:0;accent-color:#dc7e47}

/* The safe areas, same as the HUD -- see the note at the top of hud.js. The
   scrim wants the whole glass, so the padding is on the scroller and the
   cards live inside it: a pinned Descend at bottom:0 was sitting in the home
   indicator's strip. */
#screens{position:fixed;inset:0;z-index:40;display:none;place-items:center;
  padding:var(--sa-t) var(--sa-r) var(--sa-b) var(--sa-l);box-sizing:border-box;
  background:rgba(8,7,6,.86);font:13px ui-monospace,Menlo,monospace;color:#bdb4af;
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
/* The width is the CONTENT's: 16px of padding and a 3px border sit outside it,
   38px in all. Written as 92vw, a 360px Android -- one of the commonest phones
   there is -- got a 369px card and a page that scrolled sideways. The cap
   leaves 6px either side at every size, and 390px and up are unchanged. */
#screens .card{width:min(340px,calc(100vw - 50px));border:3px solid transparent;border-radius:10px;
  /* The face must be OPAQUE. Half-transparent, the band underneath shows
     straight through it -- the band is painted over the whole border box, and
     the face only clips WHERE it lands, not what is beneath -- so the top of
     the card came out bright bronze instead of dark stone. */
  background-image:linear-gradient(#221e1c,#141110 40%,#0f0d0c),
    linear-gradient(#f49158,#b95c27 34%,#7a3a15 70%,#2a2422);
  background-origin:border-box;background-clip:padding-box,border-box;
  padding:16px;box-shadow:0 12px 40px rgba(0,0,0,.6),inset 0 1px 0 rgba(150,172,200,.18);
  margin:16px 0}
/* The display face: Cinzel (SIL OFL, public/), for titles only. The
   body stays Georgia, which reads better small. swap: a title is never
   invisible while the face loads. */
@font-face{font-family:Cinzel;font-weight:400;font-display:swap;src:url(cinzel-400.woff2) format("woff2")}
@font-face{font-family:Cinzel;font-weight:600;font-display:swap;src:url(cinzel-600.woff2) format("woff2")}
/* The title takes the rule the gate-house plates have. */
#screens h1{font:600 21px Cinzel,Georgia,"Times New Roman",serif;letter-spacing:.5px;color:#efdbce;margin:0 0 10px;
  padding-bottom:8px;border-bottom:1px solid rgba(185,92,39,.45);
  box-shadow:0 1px 0 rgba(0,0,0,.6)}
#screens h1 em{font-style:normal;color:#e7905d}
#screens h1 span{color:#c0392b}
#screens .sub{color:#9a8d86;font-style:italic;margin:0 0 12px;line-height:1.45}
#screens .stats{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:0 0 14px}
#screens .stats div{background:#191614;border:1px solid #2e2826;border-radius:5px;
  padding:6px 8px;display:flex;justify-content:space-between}
#screens .stats b{color:#efdbce}
/* A scrolling list cut off mid-row reads as a bug rather than as more below,
   so the last few pixels fade out. Sticky rather than fixed: the fade belongs
   to the bottom of the viewport of this list, wherever that has scrolled to. */
#screens .rows{display:grid;gap:6px;margin:0 0 14px;max-height:44vh;overflow:auto;
  position:relative;
  -webkit-mask-image:linear-gradient(#000 calc(100% - 22px),transparent);
  mask-image:linear-gradient(#000 calc(100% - 22px),transparent)}
#screens .row{display:flex;justify-content:space-between;align-items:center;gap:8px;
  background:#191614;border:1px solid #2e2826;border-radius:6px;padding:9px 10px;
  text-align:left;color:inherit;font:inherit;min-height:44px}
#screens .row.on{border:2px solid transparent;
  background-image:linear-gradient(rgba(37,33,30,.95),rgba(20,18,17,.98)),
    linear-gradient(#f49158,#b95c27 34%,#7a3a15 70%,#2a2422);
  background-origin:border-box;background-clip:padding-box,border-box;
  box-shadow:inset 0 1px 0 rgba(231,144,93,.22)}
#screens .row small{color:#85776f;display:block}
#screens .row .teach{display:block;color:#da8859;font-style:italic;font-size:11px;
  margin-top:3px;line-height:1.35}
/* A row with a second, smaller control beside it: discard on a vault piece,
   let go on a preset. Kept apart from the row so the big target does the
   common thing and the rare, permanent one needs its own deliberate tap. */
#screens .pair{display:flex;gap:6px}
#screens .pair>.row{flex:1;min-width:0}
#screens .drop{flex:none;min-width:44px;min-height:44px;border-radius:6px;padding:0 6px;
  background:#171413;border:1px solid #423c38;color:#85776f;font:inherit}
#screens .drop.armed{border-color:#c0392b;color:#ffb4a0;background:#2a1612}
/* The vault's order and filter. Chips rather than a menu: one tap each, and
   the one in force is the lit one. */
#screens .chips{display:flex;flex-wrap:wrap;gap:5px;margin:0 0 8px}
#screens .chip{min-height:40px;min-width:40px;padding:0 10px;border-radius:20px;
  background:#171413;border:1px solid #423c38;color:#9a8d86;font:inherit;font-size:12px}
#screens .chip.on{border-color:#e7905d;color:#f1ddd0;background:#231f1d}
#screens .upmark{color:#8fd08a;margin-left:4px}
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
  background:linear-gradient(transparent,#0f0d0c)}
/* The one button that does the thing, on the same plate as an ability. */
#screens .go{width:100%;min-height:48px;border-radius:8px;
  border:2px solid transparent;
  background-image:linear-gradient(rgba(46,40,38,.92),rgba(22,19,18,.96)),
    linear-gradient(#f49158,#b95c27 34%,#7a3a15 70%,#2a2422);
  background-origin:border-box;background-clip:padding-box,border-box;
  color:#f1ddd0;font:15px Georgia,serif;
  box-shadow:inset 0 1px 0 rgba(231,144,93,.3)}
#screens .go:active{background-image:linear-gradient(rgba(87,48,25,.95),rgba(35,31,28,.98)),
    linear-gradient(#f49158,#b95c27 34%,#7a3a15 70%,#2a2422)}
/* The second way out of a card. Same size and same target -- a 44px rule does
   not stop applying because a button is the lesser of two -- but it does not
   take the gold, so a glance still finds the one you probably want. */
#screens .alt{width:100%;min-height:48px;border-radius:8px;background:#171413;
  color:#9a8d86;border:1px solid #7a3a15;font:14px Georgia,serif;margin-top:8px;
  box-shadow:inset 0 1px 0 rgba(150,172,200,.1)}
#screens .alt:active{background:#201c1a}
#screens .seal{display:block;font-size:22px;color:#9c4d20;margin:0 0 2px}
#screens .purse{display:flex;justify-content:space-between;margin:0 0 10px;color:#9a8d86}
/* THE BAR ALONG THE BOTTOM. Fixed to the glass, under the thumb, the way
   every phone game the player knows does it: an icon and a word per station,
   the one you are in lit with the band. The screens that carry it leave room
   for it (.hasbar), and their pinned button rides just above it. */
#screens{--bar:62px}
/* The bar is its buttons plus 8px of padding and a 2px rule. */
#screens.hasbar{padding-bottom:calc(var(--bar) + 10px + var(--sa-b));
  /* and anything scrolled into view (a focused row, the last vault piece)
     stops above the bar rather than under it */
  scroll-padding-bottom:calc(var(--bar) + 18px + var(--sa-b))}
#screens.hasbar .go.pinned{bottom:0}
#screens .tabs{position:fixed;left:0;right:0;bottom:0;z-index:45;display:flex;
  gap:2px;padding:4px calc(4px + var(--sa-r)) calc(4px + var(--sa-b)) calc(4px + var(--sa-l));
  background:linear-gradient(#1a1716,#0e0c0b);border-top:2px solid #7a3a15;
  box-shadow:0 -6px 18px rgba(0,0,0,.55)}
#screens .tabs button{flex:1 1 0;min-width:0;height:var(--bar);padding:4px 0 2px;
  display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;
  border-radius:8px;background:none;color:#85776f;border:2px solid transparent;font:inherit}
#screens .tabs button i{font-style:normal;font-size:21px;line-height:1}
#screens .tabs button span{font-size:10.5px;letter-spacing:.3px}
#screens .tabs button.cog{flex:0 0 44px}
/* The station you are in wears the band. */
#screens .tabs button.on{color:#f1ddd0;
  background-image:linear-gradient(rgba(39,35,32,.95),rgba(21,19,17,.98)),
    linear-gradient(#f49158,#b95c27 34%,#7a3a15 70%,#2a2422);
  background-origin:border-box;background-clip:padding-box,border-box}
#screens .tabs button.on i{color:#ffa977}
/* HOME. What you need between delves and nothing more: who, where, and the
   button -- the button big enough to be the obvious thing on the screen. */
#screens .homestats{display:flex;justify-content:space-between;margin:0 0 12px;color:#9a8d86}
#screens .homestats b{color:#efdbce;font-size:15px}
#screens .rows.heroes{grid-template-columns:1fr 1fr;max-height:none;
  -webkit-mask-image:none;mask-image:none}
#screens .row em, #screens .row.delve em{display:block;font-style:normal;font-size:10px;
  letter-spacing:1.5px;font-variant-caps:all-small-caps;color:#b95c27;margin-bottom:2px}
#screens .row.delve{width:100%;margin:0 0 14px;padding:14px 12px;min-height:96px;
  font:15px Georgia,serif;color:#efdbce;border-color:#7a3a15}
#screens .row.delve small{font:12px ui-monospace,Menlo,monospace;margin-top:4px}
#screens .row.delve .act{color:#e7905d;font:12px ui-monospace,monospace;white-space:nowrap}
#screens .go.big{min-height:64px;font:600 20px Cinzel,Georgia,serif;letter-spacing:2px}
/* THE DELVES. The whole ladder, scrolling on its own; far beyond you is
   dimmed, not hidden -- it was always yours to attempt. */
#screens .rows.ladder{max-height:52vh}
#screens .row.far{opacity:.55}
#screens .row.lore{display:block;min-height:0}
#screens .row.lore b{display:block;color:#f89d68;font:600 13px Georgia,serif;margin-bottom:3px}
#screens .row.lore small{color:#a99e97;font:12px/1.45 Georgia,serif;white-space:normal}
#screens .row.far.on{opacity:1}
#screens .item{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
/* The name and its affixes are one column and must own the space they need,
   or the piece's power and the word for what tapping does drift left and land
   at the end of the affix line -- "+13% damage take off" read as one phrase. */
#screens .item>span:first-of-type{flex:1;min-width:0}
/* Item icons: one 20px pixel cell per base off icons.png (35 cells), drawn at
   2x and kept hard-edged. The slot's own cell stands in for an empty slot. */
#screens .ico{flex:0 0 auto;width:30px;height:30px;margin-top:1px;
  background:url(icons.png) no-repeat;background-size:1050px 30px;
  background-position:calc(var(--i,0) * -30px) 0;
  image-rendering:pixelated;image-rendering:crisp-edges}
#screens .ico.none{opacity:.3;filter:grayscale(.8)}
#screens .item .aff{color:#85776f;font-size:11px;display:block;margin-top:2px;line-height:1.35}
#screens .pw{color:#e7905d;white-space:nowrap;text-align:right;flex:none}
/* And the word is a tag, not more text. It is the only part of a row that
   says what happens if you touch it, so it is the part that must not look
   like the affixes it was sitting beside. */
#screens .act{display:block;color:#9a8d86;font-size:10px;margin-top:4px;
  letter-spacing:.5px;padding:2px 6px;border:1px solid #423c38;border-radius:3px;
  background:rgba(19,17,16,.6)}
#screens .empty{color:#685d56;font-style:italic}

/* ===================================================================
   THE STATIONS, DRESSED. (Playtest: "too basic, hard to navigate,
   cramped".) A tabbed screen is a place now, not a card floating over a
   paused delve: an opaque hall of dressed stone behind it, a carved title
   plate, gold-framed panels, larger type, and a bar of medallions along the
   bottom. Everything below overrides the base rules above only on the
   stations (#screens.station); Held and the death card keep their card.
   =================================================================== */
#screens{font:15px/1.4 Georgia,"Times New Roman",serif}
#screens.station{z-index:52;
  background:
    radial-gradient(120% 50% at 50% -8%,rgba(244,145,88,.14),transparent 62%),
    radial-gradient(140% 90% at 50% 120%,rgba(0,0,0,.75),transparent 60%),
    repeating-linear-gradient(0deg,rgba(0,0,0,.22) 0 2px,transparent 2px 44px),
    repeating-linear-gradient(90deg,rgba(0,0,0,.16) 0 2px,transparent 2px 88px),
    linear-gradient(#181513,#0c0a0a)}
#screens.station.up{display:block}
body.menus #diag{display:none}
#screens.station .card{position:relative;width:auto;max-width:520px;
  margin:14px auto 12px;margin-left:max(12px,calc((100% - 520px)/2));
  margin-right:max(12px,calc((100% - 520px)/2));
  padding:18px 16px 16px;border-width:2px;border-radius:12px;
  background-image:
    radial-gradient(90% 40% at 50% 0%,rgba(244,145,88,.08),transparent 70%),
    linear-gradient(#1e1a18,#131110 38%,#0f0d0c),
    linear-gradient(135deg,#ffa977,#b95c27 30%,#652f0f 55%,#dc7e47 80%,#7a3a15);
  background-origin:border-box;background-clip:padding-box,padding-box,border-box;
  box-shadow:0 18px 50px rgba(0,0,0,.7),inset 0 0 0 1px rgba(0,0,0,.7),
    inset 0 0 0 3px rgba(185,92,39,.28),inset 0 2px 0 3px rgba(255,169,119,.08)}
/* Corner studs: a gold diamond at each top corner of the frame. */
#screens.station .card:before,#screens.station .card:after{content:'';position:absolute;top:-7px;
  width:12px;height:12px;transform:rotate(45deg);
  background:linear-gradient(135deg,#fbd0b3,#b95c27 60%,#352e2b);
  box-shadow:0 0 8px rgba(244,145,88,.45),0 0 0 1px #1e1b19}
#screens.station .card:before{left:14px}
#screens.station .card:after{right:14px}
/* The title plate: carved, centred, gilt, with a flourish under it. */
#screens.station h1{text-align:center;font:600 25px/1.2 Cinzel,Georgia,serif;letter-spacing:2px;
  margin:2px 0 14px;padding:0 0 14px;border:0;box-shadow:none;
  background:linear-gradient(#fdeadd,#f49158 55%,#b95c27);-webkit-background-clip:text;
  background-clip:text;color:transparent;text-shadow:0 2px 0 rgba(0,0,0,.35);position:relative}
#screens.station h1:after{content:'◆';position:absolute;left:0;right:0;bottom:0;height:10px;
  font:10px/10px Georgia,serif;letter-spacing:0;color:#f49158;-webkit-text-fill-color:#f49158;
  background:linear-gradient(90deg,transparent,#7a3a15 20%,#dc7e47 46%,transparent 46%,
    transparent 54%,#dc7e47 54%,#7a3a15 80%,transparent) center/100% 1px no-repeat}
/* Section labels read as labels, not asides. */
#screens.station .sub{font-size:14px;color:#a99e97}
#screens.station .sec{font:600 13px Cinzel,Georgia,serif;font-style:normal;letter-spacing:1.5px;
  font-variant-caps:all-small-caps;color:#e7905d;margin:18px 0 8px;padding:0 0 6px;
  border-bottom:1px solid rgba(185,92,39,.3);scroll-margin-top:64px}
/* The resources: pills, the way every phone game shows what you hold. */
#screens.station .homestats,#screens.station .purse{display:flex;gap:8px;justify-content:center;
  flex-wrap:wrap;margin:0 0 14px;color:#9a8d86}
#screens.station .homestats>span,#screens.station .purse{padding:7px 14px;border-radius:20px;
  background:linear-gradient(#1a1715,#100e0d);border:1px solid #7a3a15;
  box-shadow:inset 0 1px 0 rgba(244,145,88,.15),0 2px 6px rgba(0,0,0,.4)}
#screens.station .purse{width:max-content;margin-left:auto;margin-right:auto;gap:10px}
#screens.station .homestats b,#screens.station .purse b{color:#fcb58c;font-size:16px}
/* Rows are panels: taller, with a lit edge, and they press. */
#screens.station .rows{max-height:none;overflow:visible;gap:8px;
  -webkit-mask-image:none;mask-image:none}
#screens.station .rows.ladder{max-height:52vh;overflow:auto;
  -webkit-mask-image:linear-gradient(#000 calc(100% - 22px),transparent);
  mask-image:linear-gradient(#000 calc(100% - 22px),transparent)}
#screens.station .row{min-height:56px;padding:12px 13px;border-radius:9px;border-color:#362f2c;
  background:linear-gradient(#1e1a18,#151211);
  box-shadow:inset 0 1px 0 rgba(244,145,88,.08),0 2px 5px rgba(0,0,0,.35);
  transition:transform 80ms ease,filter 80ms ease}
#screens.station button.row:active:not(:disabled){transform:translateY(1px);filter:brightness(1.15)}
#screens.station .row:disabled{opacity:.62}
#screens.station .row small{font-size:12.5px;margin-top:2px}
#screens.station .row.on{box-shadow:inset 0 1px 0 rgba(231,144,93,.25),0 0 14px rgba(244,145,88,.22)}
#screens.station .row em,#screens.station .row.delve em{font:600 10.5px Cinzel,Georgia,serif;letter-spacing:1.5px}
#screens.station .item .aff{font-size:12.5px}
#screens.station .act{font:600 10.5px Cinzel,Georgia,serif;letter-spacing:.8px;font-variant-caps:all-small-caps;
  color:#e7905d;border-color:#7a3a15}
#screens.station .ico{width:36px;height:36px;background-size:1260px 36px;
  background-position:calc(var(--i,0) * -36px) 0;border-radius:6px;
  box-shadow:0 0 0 1px #362f2c,inset 0 0 8px rgba(0,0,0,.6);background-color:#0d0c0b}
#screens.station .chip{min-height:40px;font:13px Georgia,serif}
#screens.station .drop{min-width:48px;border-radius:9px}
#screens.station .alt{font:15px Georgia,serif;min-height:52px;border-radius:10px}
/* THE JUMP BAR: a long station (the Forge) is three places in one; a
   segmented control rides at the top of the scroll and takes you to each. */
#screens .seg{position:sticky;top:0;z-index:3;display:flex;gap:4px;padding:5px;margin:0 -4px 12px;
  border-radius:12px;background:rgba(12,11,10,.94);border:1px solid #3d3733;
  box-shadow:0 6px 14px rgba(0,0,0,.5);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px)}
#screens .seg button{flex:1;min-height:40px;border-radius:8px;border:1px solid transparent;
  background:none;color:#9a8d86;font:600 12px Cinzel,Georgia,serif;letter-spacing:1px;
  font-variant-caps:all-small-caps}
#screens .seg button.on{color:#141211;background:linear-gradient(#ffa977,#dc7e47 60%,#b95c27);
  border-color:#7a3a15;box-shadow:0 0 10px rgba(244,145,88,.35)}
/* Descend: the brightest thing on the screen, and it breathes. */
#screens.station .go{border-radius:10px;font:600 16px Cinzel,Georgia,serif;letter-spacing:1.5px}
#screens.station .go.big{min-height:66px;font-size:22px;letter-spacing:4px;color:#fdeadd;
  text-shadow:0 0 12px rgba(244,145,88,.55),0 2px 0 rgba(0,0,0,.5);
  animation:goGlow 2.6s ease-in-out infinite}
@keyframes goGlow{0%,100%{box-shadow:inset 0 1px 0 rgba(231,144,93,.3),0 0 0 rgba(244,145,88,0)}
  50%{box-shadow:inset 0 1px 0 rgba(231,144,93,.4),0 0 22px rgba(244,145,88,.35)}}
#screens.station .go.pinned{border-radius:0 0 10px 10px}
/* THE BAR OF MEDALLIONS. A double gilt rule with a stone set in the middle,
   and each station a round seal with its word under it; the one you are in
   is struck in gold and stands proud. */
#screens.station{--bar:70px}
#screens.station .tabs{gap:0;padding-top:6px;
  background:linear-gradient(#201c1a,#0f0d0c 60%,#0a0908);
  border-top:1px solid #f49158;box-shadow:0 -1px 0 #2a2422,0 -3px 0 rgba(244,145,88,.25),0 -10px 24px rgba(0,0,0,.65)}
#screens.station .tabs:before{content:'';position:absolute;left:50%;top:-7px;width:12px;height:12px;
  margin-left:-6px;transform:rotate(45deg);background:linear-gradient(135deg,#fbd0b3,#b95c27 60%,#352e2b);
  box-shadow:0 0 8px rgba(244,145,88,.5),0 0 0 1px #1e1b19}
#screens.station .tabs button{border:0;background:none!important;gap:3px;color:#7e716a}
#screens.station .tabs button i{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;
  font-size:18px;background:radial-gradient(circle at 40% 35%,#26211f,#100e0d);
  border:1px solid #64361c;box-shadow:inset 0 1px 0 rgba(244,145,88,.15),0 2px 4px rgba(0,0,0,.5);
  transition:transform 120ms ease}
#screens.station .tabs button span{font:600 10px Cinzel,Georgia,serif;letter-spacing:1px;font-variant-caps:all-small-caps}
#screens.station .tabs button.on{color:#fcb58c}
#screens.station .tabs button.on i{color:#141211;transform:translateY(-4px) scale(1.1);
  background:radial-gradient(circle at 40% 35%,#fcd9c2,#e7905d 55%,#9a4818);border-color:#fdeadd;
  box-shadow:0 0 14px rgba(244,145,88,.6),0 3px 6px rgba(0,0,0,.6)}
#screens.station .tabs button.cog{flex:0 0 52px}
@media (prefers-reduced-motion:reduce){#screens.station .go.big{animation:none}}
#screens .row>.item{flex:1;min-width:0}

/* THE TALENT TREE. A gilt frame round a dark field washed in the tree's
   colour; each talent a square seal with its rank on a tab at the corner,
   the way the screenshot it was asked from draws them. Locked is grey and
   flat, learnable glows, learned is struck in gold. */
#screens .tabs button{position:relative}
#screens .tabs .badge{position:absolute;top:2px;right:calc(50% - 26px);min-width:18px;height:18px;
  padding:0 4px;border-radius:9px;background:#c0392b;color:#fff;font:700 11px/18px Georgia,serif;
  box-shadow:0 0 0 2px #0f0d0c,0 0 8px rgba(192,57,43,.7)}
#screens.station .tabs button span{letter-spacing:.3px;font-size:9.5px}
#screens .seg button small{display:block;opacity:.7;font:12px Georgia,serif}
#screens .tgrid{position:relative;margin:0 0 12px;border-radius:10px;border:2px solid #7a3a15;
  background:radial-gradient(120% 70% at 50% 0%,color-mix(in srgb,var(--hue) 22%,transparent),transparent 70%),
    radial-gradient(140% 100% at 50% 120%,rgba(0,0,0,.7),transparent 60%),
    linear-gradient(#191614,#0c0b0a);
  box-shadow:inset 0 0 0 1px rgba(0,0,0,.8),inset 0 0 30px rgba(0,0,0,.6),0 4px 14px rgba(0,0,0,.5);overflow:hidden}
#screens .tgrid .gate{position:absolute;left:0;right:0;height:1px;padding-left:8px;
  font:600 10px Cinzel,Georgia,serif;letter-spacing:1px;color:#786b64;
  border-top:1px dashed rgba(185,92,39,.35);line-height:14px}
#screens .tgrid .node{position:absolute;width:64px;height:64px;padding:0;border-radius:8px;
  border:2px solid #3d3733;background:radial-gradient(circle at 40% 35%,#26211f,#0c0b0a);
  box-shadow:inset 0 0 12px rgba(0,0,0,.8),0 3px 6px rgba(0,0,0,.6);color:var(--hue);
  display:grid;place-items:center}
#screens .tgrid .node i{font-style:normal;font-size:28px;line-height:1;
  text-shadow:0 0 10px color-mix(in srgb,var(--hue) 60%,transparent)}
#screens .tgrid .node .rk{position:absolute;right:-8px;bottom:-8px;min-width:30px;padding:1px 4px;
  border-radius:5px;background:#0c0a0a;border:1px solid #7a3a15;font:700 12px/16px Georgia,serif;color:#85776f}
#screens .tgrid .node.locked{filter:grayscale(1) brightness(.55)}
#screens .tgrid .node.open{border-color:#dc7e47;animation:talGlow 2.2s ease-in-out infinite}
#screens .tgrid .node.has{border-color:#f49158}
#screens .tgrid .node.has .rk,#screens .tgrid .node.open .rk{color:#8fd08a;border-color:#8fd08a}
#screens .tgrid .node.max{border-color:#fbd0b3;background:radial-gradient(circle at 40% 35%,
  color-mix(in srgb,var(--hue) 45%,#26211f),#100e0d);box-shadow:0 0 16px rgba(244,145,88,.5),inset 0 0 10px rgba(0,0,0,.5)}
#screens .tgrid .node.max .rk{color:#fcb58c;border-color:#f49158}
#screens .tgrid .node.sel{outline:2px solid #fdeadd;outline-offset:3px}
@keyframes talGlow{0%,100%{box-shadow:0 0 0 rgba(244,145,88,0),inset 0 0 12px rgba(0,0,0,.8)}
  50%{box-shadow:0 0 14px rgba(244,145,88,.55),inset 0 0 12px rgba(0,0,0,.8)}}
#screens .tgrid .arrow{position:absolute;width:6px;border-radius:3px;background:#473f3b}
#screens .tgrid .arrow:after{content:'';position:absolute;left:-5px;bottom:-8px;border:8px solid transparent;
  border-top-color:#473f3b;border-bottom:0}
#screens .tgrid .arrow.lit{background:linear-gradient(#ffa977,#dc7e47)}
#screens .tgrid .arrow.lit:after{border-top-color:#dc7e47}
#screens .tdetail{padding:12px 14px;margin:0 0 12px;border-radius:10px;border:1px solid #7a3a15;
  background:linear-gradient(#1e1a18,#131110)}
#screens .tdetail b{display:block;font:600 17px Cinzel,Georgia,serif;color:var(--hue)}
#screens .tdetail em{display:block;font-style:normal;color:#9a8d86;font-size:13px;margin:2px 0 6px}
#screens .tdetail p{margin:0 0 8px;color:#bdb4af}
#screens .tdetail .why{color:#fb8d4d;font-style:italic;font-size:13.5px}
#screens .tdetail .go:disabled{opacity:.55}
@media (prefers-reduced-motion:reduce){#screens .tgrid .node.open{animation:none}}
#screens.station .row.delve{font:17px Georgia,serif}
#screens.station .row.delve small,#screens.station .row.delve .verdict{font:13px Georgia,serif}
#screens.station .row.delve .act{font:600 10.5px Cinzel,Georgia,serif;letter-spacing:.8px}
#screens.station .row.slide{min-height:56px;padding-top:6px;padding-bottom:6px}
#screens.station .row.slide input[type=range]{margin:0}

/* ===================================================================
   BIGGER. Playtested: "make it more readable, like it takes up space".
   A size up everywhere a player reads or taps: body text, the rows and
   what is in them, the pills, the item icons, the tags, the buttons and
   the bar of medallions. Everything else (the frame, the colours, the
   layout) stays as it was; this only makes it read from arm's length.
   =================================================================== */
#screens{font-size:17px;line-height:1.4}
#screens.station h1{font-size:31px;margin-bottom:16px;padding-bottom:16px}
#screens.station .sub{font-size:16px}
#screens.station .sec{font-size:15px;margin:22px 0 10px}
#screens.station .homestats>span,#screens.station .purse{padding:9px 18px;font-size:16px}
#screens.station .homestats b,#screens.station .purse b{font-size:21px}
#screens.station .row{min-height:66px;padding:14px 16px;gap:10px}
#screens.station .row small{font-size:14.5px;margin-top:3px}
#screens.station .row .teach{font-size:14px}
#screens.station .row em,#screens.station .row.delve em{font-size:12px}
#screens.station .row.delve{font-size:20px;min-height:110px;padding:16px}
#screens.station .row.delve small,#screens.station .row.delve .verdict{font-size:15px}
#screens.station .rows.heroes .row{font-size:19px}
#screens.station .item .aff{font-size:14.5px}
#screens.station .item b{font-size:17.5px}
#screens.station .pw{font-size:17px}
#screens.station .act,#screens.station .row.delve .act{font-size:12.5px;padding:4px 8px}
#screens.station .ico{width:46px;height:46px;background-size:1610px 46px;
  background-position:calc(var(--i,0) * -46px) 0}
#screens.station .chip{min-height:46px;font-size:15px;padding:0 14px}
#screens.station .drop{min-width:56px;font-size:16px}
#screens.station .alt{font-size:18px;min-height:60px}
#screens.station .go{font-size:19px;min-height:58px}
#screens.station .go.big{min-height:80px;font-size:28px}
#screens .seg button{min-height:48px;font-size:14px}
#screens .seg button small{font-size:14px}
#screens.station{--bar:86px}
#screens.station .tabs button{gap:4px}
#screens.station .tabs button i{width:46px;height:46px;font-size:22px}
#screens.station .tabs button span{font-size:11.5px;letter-spacing:.4px}
#screens.station .tabs button.cog{flex:0 0 58px}
#screens .tabs .badge{min-width:22px;height:22px;font-size:13px;line-height:22px;right:calc(50% - 32px)}
#screens .tdetail b{font-size:21px}
#screens .tdetail em{font-size:15px}
#screens .tdetail p{font-size:17px}
#screens .tgrid .node .rk{font-size:14px;min-width:36px}
#screens .row.lore b{font-size:16px}
#screens .row.lore small{font-size:15px}

/* The "?" in a station's corner, and its hint. */
#screens.station .card>h1{padding-left:46px;padding-right:46px}
#screens .card .help{position:absolute;top:14px;right:14px;width:40px;height:40px;border-radius:50%;
  border:1.5px solid #7a3a14;background:#171514;color:#ffb070;font:700 20px Georgia,serif;cursor:pointer}
#screens .hint{margin:0 0 16px;padding:14px 16px;border-radius:10px;border:1.5px solid #ff7a2a;
  background:linear-gradient(#2a1a10,#1a1210);box-shadow:0 0 16px rgba(255,122,42,.18)}
#screens .hint p{margin:0 0 10px;font-size:16px;line-height:1.45;color:#f4ece4}
#screens .hint .hintOk{min-height:44px;padding:0 18px;border-radius:8px;border:1px solid #ff7a2a;
  background:#3a1e0e;color:#fff0e0;font:600 15px Georgia,serif}
/* Next step, on Home. */
#screens.station .row.next{border:1.5px solid #ff7a2a;background:linear-gradient(#2a1a10,#1a1210);
  width:100%;margin:0 0 14px;color:#fff0e0}
#screens.station .row.next em{color:#ff9a4a}
/* The verdict on a vault piece. */
#screens .verdict{display:block;margin-top:5px;font:600 14px Georgia,serif;color:#bdb4af}
#screens .verdict.up{color:#8fd08a}
#screens .verdict.down{color:#e08a7a}
#screens.station .cmp{font-size:14px;line-height:1.5}
/* The outcome card: what changed stands out. */
#screens .stats div.up{border-color:#ff7a2a;box-shadow:0 0 12px rgba(255,122,42,.3)}
#screens .stats div.up b{color:#ffb070}
#screens .stats div.wide{grid-column:1/-1;flex-direction:column;gap:3px}
#screens .stats div.wide b{font-weight:400;font-size:14px;color:#f0e6dc}
#screens .stats{font-size:15px}
#screens .stats b{font-size:17px}
/* Bigger type must never push a station wider than the glass (a 320px
   phone): the card is capped to the screen, and the controls in it are
   allowed to shrink and wrap rather than set its width. */
#screens.station .card{box-sizing:border-box;max-width:min(520px,calc(100vw - 24px))}
#screens .seg button{min-width:0;padding:0 4px;overflow-wrap:anywhere}
#screens.station .row,#screens.station .item>span{min-width:0;overflow-wrap:anywhere}
`;

/* Cells of icons.png (tools/build-art.py's strip, carried over from the
 * canvas build). The first ten are the slot fallbacks and loose glyphs; every
 * base after that has its own picture. Both rings share one. */
const ICON = { blade: 0, offhand: 1, mail: 2, girdle: 3, boots: 4, amulet: 5,
               ring1: 6, ring2: 6, ring: 6, coin: 7, skull: 8, gem: 9,
               'Longsword': 10, 'Falchion': 11, 'Warblade': 12, 'Glaive': 13, 'Cleaver': 14,
               'Kite Shield': 15, 'Buckler': 16, 'Warding Focus': 17, 'Tower Shield': 18,
               'Ringmail': 19, 'Scale Hauberk': 20, 'Plated Coat': 21, 'Padded Jack': 22,
               'Leather Girdle': 23, 'Plated Belt': 24, 'Sash of Cord': 25,
               'Marching Boots': 26, 'Greaves': 27, 'Soft Treads': 28,
               'Bone Amulet': 29, 'Ley-Charm': 30, 'Sun Pendant': 31,
               'Iron Band': 32, 'Signet': 33, 'Twisted Ring': 34 };

// A rung's short name, the same on Home and on the Delves list.
const rungLabel = i => i === 0 ? 'Proving ground' : 'Delve ' + i;


/* EXPLAIN AS I GO. Playtested: "hard to understand what's happening". Each
 * station says what it is for, in two sentences, the first time you open it;
 * a "?" in its corner brings that back whenever. Seen-ness is kept per
 * station in the browser (a convenience, not progress), so a new player
 * reads each once and a returning one is not nagged. */
const HINTS = {
  splash: 'Pick a hero and a delve, then Descend. Gather slag down there, beat what it calls, and escape through the ley-gate: slag you carry out levels you up, and coin buys upgrades here.',
  delves: 'Every rung of the ladder. ★ marks the one that suits your power; harder rungs hit harder but pay more. Tap a rung, then Descend.',
  gear: 'What you wear, and what you have kept. Tap a vault piece to wear it: ▲ means it beats what you have on, and the green and red lines show exactly what changes.',
  talents: 'One point for every level. Tap a talent to read it, then Learn. Deeper rows open as you spend in that tree, and an arrow means one talent needs the one above it.',
  vendor: 'Spend coin here. Commission a new piece for a slot you choose, or temper one you are wearing to reroll its stats.',
  hall: 'Upgrades that last for ever, bought with coin: a bigger vault, cheaper forging, better drops, more life. Every delve after benefits.'
};
const HINT_KEY = 'rivenmark.hints.v1';
const hintsSeen = () => { try { return JSON.parse(localStorage.getItem(HINT_KEY)) || {}; } catch (e) { return {}; } };
const markHint = n => { try { const h = hintsSeen(); h[n] = 1; localStorage.setItem(HINT_KEY, JSON.stringify(h)); } catch (e) {} };

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
    this.onPractice = () => {};
    this.root = document.createElement('div');
    this.root.id = 'screens';
    document.body.appendChild(this.root);
    // Every button on every screen answers a tap with a soft click -- one
    // listener here rather than one per button, so a screen added later
    // cannot forget. What the tap DID (bought, built, equipped) is a second
    // sound on top, from where that happens.
    this.root.addEventListener('click', e => {
      const b = e.target.closest && e.target.closest('button');
      if (b && !b.disabled) snd('tap');
    });
    // Difficulty is chosen per visit, as the canvas build did, and starts at
    // Riven -- the game as it is meant to be played -- every session.
    this.pick = { hero: 'isaac', level: null, diff: 'riven' };
    this.name = null;
  }

  show(name) {
    this.name = name;
    if (!name) { this.root.classList.remove('up', 'station'); document.body.classList.remove('menus'); return; }
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
    else if (name === 'settings') this.renderSettings(false);
    else if (name === 'settings-pause') this.renderSettings(true);
    else if (name === 'hall') this.renderHall();
    else if (name === 'talents') this.renderTalents();
    else if (name === 'delves') this.renderDelves();
    else this.renderGatehouse();
    this.explain(name);
    // Room at the bottom for the bar, on the screens that carry it -- and
    // those are the stations, which are places rather than cards over a delve.
    const bar = !!this.root.querySelector('nav.tabs');
    this.root.classList.toggle('hasbar', bar);
    this.root.classList.toggle('station', bar);
    document.body.classList.add('menus');       // any card up hides the diagnostics dot
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
    // Practice costs nothing to leave, even in Hardcore: nothing is at stake.
    const hc = typeof hardcore !== 'undefined' && hardcore && !(run && run.room);
    const leave = run && run.room ? 'Leave practice' : !hc ? 'Abandon the delve'
      : armed ? 'Tap again \u2014 this ends your life'
              : 'Abandon the delve \u2014 in Hardcore, this is death';
    this.root.innerHTML =
      '<div class="card">' +
        '<span class="seal">\u2620\ufe0e</span>' +   // FE0E: the glyph, not the emoji
        '<h1>Held</h1>' +
        '<p class="sub">The delve waits. It does not wait kindly.</p>' +
        '<button class="go" type="button">Press on</button>' +
        '<button class="alt" type="button">' + leave + '</button>' +
        '<button class="alt snd" type="button"></button>' +
        '<button class="alt ctl" type="button"></button>' +
        '<button class="alt" type="button" id="toSettings">Settings</button>' +
      '</div>';
    this.root.querySelector('#toSettings').addEventListener('click', () => this.show('settings-pause'));
    // Which controls. The new ones are the game; the classic Conduit is kept
    // one tap away so the two can be compared on the same phone. Saved.
    const ctl = this.root.querySelector('.ctl');
    const ctlLabel = () => { ctl.textContent = 'Controls: ' +
      (controlScheme === 'classic' ? 'classic (tap / drag / hold at rim)' : 'new (hold to strike, heavy button)'); };
    ctlLabel();
    ctl.addEventListener('click', () => {
      setControls(controlScheme === 'classic' ? 'new' : 'classic');
      try { localStorage.setItem('rivenmark.controls.v1', controlScheme); } catch (e) {}
      ctlLabel();
    });
    // Sound, where a player looks for it: on the screen that stops the game.
    // The HUD has the same switch; both follow the engine, so they agree.
    const snd = this.root.querySelector('.snd'), eng = window.__sound;
    if (eng) {
      const label = m => {
        if (!snd.isConnected && snd.textContent) return false;
        snd.textContent = m ? 'Sound: off' : 'Sound: on';
      };
      eng.onMute(label);
      snd.addEventListener('click', () => eng.toggle());
    } else snd.remove();
    this.root.querySelector('.go').addEventListener('click', () => {
      if (typeof resumeRun === 'function') resumeRun();
      else this.show(null);
    });
    this.root.querySelector('.alt').addEventListener('click', () => {
      if (hc && !armed) return this.renderPaused(true);
      this.onAbandon();
    });
  }

  /* SETTINGS. Reached from the gate-house (a tab) and from the pause card
   * (and back to it). Every row says what it is set to now, and a tap moves it
   * on; the two volumes are sliders because a volume is not a list. */
  renderSettings(fromPause) {
    const eng = window.__sound;
    const pct = v => Math.round((v == null ? 1 : v) * 100);
    const row = (id, label, value, note) =>
      '<button class="row" type="button" data-set="' + id + '"><span>' + label +
      (note ? '<small>' + note + '</small>' : '') + '</span><span class="act">' + value + '</span></button>';
    const slider = (id, label, v) =>
      '<label class="row slide"><span>' + label + '</span>' +
      '<input type="range" min="0" max="100" step="5" data-vol="' + id + '" value="' + pct(v) + '">' +
      '<span class="act" data-volv="' + id + '">' + pct(v) + '%</span></label>';
    this.root.innerHTML =
      '<div class="card">' +
        '<h1>Settings</h1>' + (fromPause ? '' : this.tabs('settings')) +
        '<div class="rows">' +
          (eng ? row('mute', 'Sound', eng.muted ? 'off' : 'on') +
                 slider('fx', 'Effects volume', eng.vol.fx) +
                 slider('music', 'Music and ambience', eng.vol.music) : '') +
          row('vibrate', 'Vibration', settings.vibrate ? 'on' : 'off',
              'A blow taken, the gate, a boss falling, death') +
          row('shake', 'Screen shake', settings.shake) +
          row('flash', 'Hit flashes', settings.flash ? 'on' : 'off',
              'The white flash on a struck body and the red at the edges when you are hurt') +
          row('fx', 'Effects quality', settings.fx,
              settings.fx === 'auto' ? 'Sheds effects if the frame rate drops' : '') +
          row('controls', 'Controls', controlScheme === 'classic' ? 'classic' : 'new',
              controlScheme === 'classic' ? 'Tap to strike, drag to aim, hold at the rim to gather'
                                          : 'Hold to strike, drag to aim, the heavy button to gather') +
          (controlScheme === 'classic' ? '' :
            row('autostrike', 'Auto-strike', settings.autostrike ? 'on' : 'off',
                settings.autostrike ? 'The blade swings by itself at anything in reach; hold the Conduit to aim'
                                    : 'The blade swings only while you hold the Conduit')) +
          (typeof window.__replayTutorial === 'function'
            ? row('tutorial', 'Teach the controls again', 'next delve') : '') +
        '</div>' +
        (fromPause ? '<button class="go" type="button" id="setBack">Back</button>' : '') +
      '</div>';
    const again = () => this.renderSettings(fromPause);
    if (!fromPause) this.wireTabs();
    const back = this.root.querySelector('#setBack');
    if (back) back.addEventListener('click', () => this.show('paused'));
    this.root.querySelectorAll('[data-set]').forEach(b => b.addEventListener('click', () => {
      const k = b.dataset.set;
      if (k === 'mute' && eng) { eng.toggle(); setTimeout(again, 50); return; }
      if (k === 'vibrate') setSetting('vibrate', !settings.vibrate);
      if (k === 'flash') setSetting('flash', !settings.flash);
      if (k === 'autostrike') setSetting('autostrike', !settings.autostrike);
      if (k === 'shake') {
        const i = SHAKES.findIndex(x => x[0] === settings.shake);
        setSetting('shake', SHAKES[(i + 1) % SHAKES.length][0]);
      }
      if (k === 'fx') setSetting('fx', QUALITIES[(QUALITIES.indexOf(settings.fx) + 1) % QUALITIES.length]);
      if (k === 'controls') setControlsSaved(controlScheme === 'classic' ? 'new' : 'classic');
      if (k === 'tutorial') window.__replayTutorial();
      again();
    }));
    this.root.querySelectorAll('[data-vol]').forEach(inp => inp.addEventListener('input', () => {
      const v = (+inp.value) / 100;
      if (eng) eng.setVolume(inp.dataset.vol, v);
      const lab = this.root.querySelector('[data-volv="' + inp.dataset.vol + '"]');
      if (lab) lab.textContent = Math.round(v * 100) + '%';
    }));
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
      snd('descend'); this.onDescend(hero, lvl, diff);
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
  /* What the player must be told about their save, at the door: that the
   * last one could not be written (and why it matters), or that it was
   * damaged and the backup was loaded instead. Never silent. */
  saveNotice() {
    const out = [];
    if (window.saveTrouble)
      out.push('<b>Your progress could not be saved</b> (' + window.saveTrouble + '). ' +
               'The phone\u2019s storage may be full; free some space before you descend.');
    if (window.stashRecovered && !this.toldRecovered) {
      this.toldRecovered = true;
      out.push('Your last save was damaged, so the one before it was loaded instead.');
    }
    return out.length ? '<p class="sub warn">' + out.join('<br>') + '</p>' : '';
  }

  /* THE GATE-HOUSE IS TWO SCREENS NOW.
   *
   * It was one long scroll: the heroes, eight rungs, three difficulties, the
   * bounty, the ground, one life, practice, and Descend at the bottom of all
   * of it. Home is what you need between delves -- who goes down, where, and
   * the button -- and the Delves tab is the ladder and everything that shapes
   * a delve. Asked for by the playtest ("a home screen with tabs"), and it is
   * also how every mobile game the player already knows is laid out.
   */
  // The pick, settled: the hero last taken down, and the rung the core
  // recommends for this power. Shared by both screens.
  settlePick() {
    if (!this.heroFromStash) {
      this.heroFromStash = true;
      if (stash && HEROES[stash.hero]) this.pick.hero = stash.hero;
    }
    // stashPower(), not powerLevel(): called bare that returns NaN.
    const power = typeof stashPower === 'function' ? stashPower() : 1;
    if (!this.pick.level) {
      this.pick.level = typeof recommendedLevel === 'function'
        ? recommendedLevel(power) : LEVELS[0].id;
    }
    return power;
  }

  // What the corpse is carrying, said only where there is something to say.
  corpseLine() {
    if (!stash.corpse) return '';
    const c = stash.corpse, bits = [];
    if (c.items.length) bits.push(c.items.length + ' find' + (c.items.length === 1 ? '' : 's'));
    if (c.coins) bits.push(c.coins + ' coin');
    return '<p class="sub">A corpse of yours lies in ' +
      ((LEVEL_BY_ID[c.level_id] || {}).name || 'a delve') +
      (bits.length ? ' with ' + bits.join(' and ') : '') +
      '. Descend there and take it back.</p>';
  }


  /* The "?" in a station's corner, and its hint the first time (HINTS). */
  explain(name) {
    const key = name === 'gear' && !(state === 'gear' && gearCtx && gearCtx.live) ? 'gear' : name;
    const text = HINTS[key];
    const card = this.root.querySelector('.card');
    if (!text || !card || !this.root.querySelector('nav.tabs')) return;
    const help = document.createElement('button');
    help.type = 'button'; help.className = 'help'; help.setAttribute('aria-label', 'what is this screen');
    help.textContent = '?';
    card.appendChild(help);
    const show = () => {
      if (card.querySelector('.hint')) return;
      const h = document.createElement('div');
      h.className = 'hint';
      h.innerHTML = '<p>' + text + '</p><button type="button" class="hintOk">Got it</button>';
      const title = card.querySelector('h1');
      if (title) title.after(h); else card.prepend(h);
      h.querySelector('.hintOk').addEventListener('click', () => { markHint(key); h.remove(); });
    };
    help.addEventListener('click', () => { const h = card.querySelector('.hint'); if (h) h.remove(); else show(); });
    if (!hintsSeen()[key]) show();
  }

  /* WHAT TO DO NEXT, on Home: the one most useful thing, as a row you can tap
   * to go and do it. In order: points waiting in the talents, a stronger
   * piece sitting in the vault, something the Hall can build now, and a
   * delve better suited than the one picked. Nothing when there is nothing. */
  nextStep(power) {
    const hero = this.pick.hero;
    const free = typeof talentPoints === 'function' ? talentPoints(hero).free : 0;
    if (free > 0) return { tab: 'talents', text: 'You have ' + free + ' talent point' + (free === 1 ? '' : 's') + ' to spend' };
    const up = (stash.vault || []).find(it => isUpgrade(it, stash.gear));
    if (up) return { tab: 'gear', text: 'A stronger ' + ((SLOT_BY_ID[up.slot] || {}).name || 'piece').toLowerCase() + ' is in your vault' };
    const hall = HALL.find(h => { const t = hallTier(h.id); return t < HALL_MAX && (stash.coins || 0) >= h.tiers[t].cost; });
    if (hall) return { tab: 'hall', text: 'You can build ' + hall.name + ' in the Hall' };
    const best = typeof recommendedLevel === 'function' ? recommendedLevel(power) : null;
    const L = LEVEL_BY_ID[this.pick.level];
    if (best && L && best !== L.id && delveStanding(L, power).id === 'deadly')
      return { tab: 'delves', level: best, text: 'This delve is far beyond you — try ' + rungLabel(LEVELS.indexOf(LEVEL_BY_ID[best])) };
    return null;
  }

  renderGatehouse() {
    const power = this.settlePick();
    const L = LEVEL_BY_ID[this.pick.level] || LEVELS[0];
    const idx = LEVELS.indexOf(L);
    const v = delveStanding(L, power);
    const D = DIFFICULTIES.find(d => d.id === this.pick.diff) || DIFFICULTIES[0];
    const region = stash.region && REGION_BY_ID[stash.region];
    const bits = [D.name];
    if (region && L.regions && L.regions.includes(stash.region)) bits.push(region.name);
    if (typeof hardcore !== 'undefined' && hardcore) bits.push('one life');

    this.root.innerHTML =
      '<div class="card home">' +
        '<h1>The Gate-House</h1>' + this.saveNotice() +
        '<div class="homestats"><span>Power <b>' + power + '</b></span>' +
          '<span><b>' + (stash.coins || 0) + '</b> coin</span></div>' +
        this.corpseLine() +
        (() => { const n = this.nextStep(power); return n
          ? '<button class="row next" type="button" id="nextStep" data-tab="' + n.tab + '"' +
            (n.level ? ' data-level-to="' + n.level + '"' : '') + '><span><em>Next step</em>' + n.text +
            '</span><span class="act">go ›</span></button>' : ''; })() +
        '<div class="rows heroes" id="heroRows">' +
          Object.values(HEROES).map(h =>
            '<button class="row' + (this.pick.hero === h.id ? ' on' : '') +
            '" data-hero="' + h.id + '" type="button"><span>' + h.name +
            '<small>' + h.title + '</small></span></button>').join('') +
        '</div>' +
        // The delve you are about to take, as one card. Tapping it is the
        // way to the ladder: the Delves tab is where it is changed.
        '<button class="row delve" id="delveCard" data-tab="delves" type="button">' +
          '<span><em>' + rungLabel(idx) + '</em>' + L.name +
          '<small>power ' + L.power + ' · ' + L.quota + ' slag · ' + bits.join(' · ') + '</small>' +
          (L.lesson ? '<span class="teach">' + L.lesson + '</span>' : '') +
          '<small class="verdict" style="color:' + v.colour + '">' + v.text + '</small>' +
          '</span><span class="act">change ›</span></button>' +
        this.daily() +
        '<button class="alt" type="button" id="practice">Practice room</button>' +
        '<button class="go pinned big" type="button" id="descend">Descend</button>' +
      '</div>' + this.tabs('splash');

    this.root.querySelectorAll('[data-hero]').forEach(b =>
      b.addEventListener('click', () => { this.pick.hero = b.dataset.hero; this.renderGatehouse(); }));
    const nx = this.root.querySelector('#nextStep[data-level-to]');
    if (nx) nx.addEventListener('click', () => { this.pick.level = nx.dataset.levelTo; }, true);
    this.wirePicks();
    this.wireTabs();
    this.root.querySelector('#practice').addEventListener('click', () => {
      this.root.classList.remove('up'); document.body.classList.remove('menus');
      snd('descend'); this.onPractice(this.pick.hero);
    });
  }

  /* THE LADDER, all of it, in one list that scrolls on its own: the rung you
   * have picked is scrolled into view, the one the core recommends wears a
   * star, and the ones far beyond you are dimmed -- still yours to take, the
   * way they always were, but no longer the same weight as the rest. Then
   * everything else that shapes the delve. */
  renderDelves() {
    const power = this.settlePick();
    const best = typeof recommendedLevel === 'function' ? recommendedLevel(power) : null;
    this.root.innerHTML =
      '<div class="card">' +
        '<h1>The Delves</h1>' +
        '<p class="sub">Power ' + power + '. ★ is where you stand; tap a rung to take it.</p>' +
        '<div class="rows ladder" id="rungRows">' +
          LEVELS.map((l, i) => {
            /* THE CORE'S VERDICT, NOT A SECOND ONE (delveStanding): the
             * gate-house is where the player decides what to attempt, and it
             * must give the advice every other place gives. */
            const v = delveStanding(l, power);
            return '<button class="row' + (this.pick.level === l.id ? ' on' : '') +
              (v.id === 'deadly' ? ' far' : '') +
              '" data-level="' + l.id + '" type="button"><span>' +
              '<em>' + rungLabel(i) + (l.id === best ? ' ★' : '') + '</em>' +
              l.name +
              '<small>power ' + l.power + ' · ' + l.quota + ' slag</small>' +
              (l.lesson ? '<span class="teach">' + l.lesson + '</span>' : '') +
              '</span><small class="verdict" style="color:' + v.colour + '">' + v.text + '</small></button>';
          }).join('') +
        '</div>' +
        this.difficulty() +
        this.ground() +
        this.oneLife() +
        '<button class="go pinned" type="button" id="descendHere">Descend</button>' +
      '</div>' + this.tabs('delves');

    const list = this.root.querySelector('#rungRows');
    const on = list.querySelector('.on');
    if (on) list.scrollTop = on.offsetTop - list.offsetTop - list.clientHeight / 2 + on.offsetHeight / 2;
    this.root.querySelectorAll('[data-level]').forEach(b =>
      b.addEventListener('click', () => {
        const keep = list.scrollTop;
        this.pick.level = b.dataset.level;
        this.renderDelves();
        this.root.querySelector('#rungRows').scrollTop = keep;
      }));
    this.wirePicks();
    this.wireTabs();
  }

  // The controls both screens share: difficulty, bounty, ground, one life,
  // and Descend. Each redraws whichever of the two is showing.
  wirePicks() {
    const again = () => this.show(this.name || 'splash');
    this.root.querySelectorAll('[data-diff]').forEach(b =>
      b.addEventListener('click', () => { this.pick.diff = b.dataset.diff; again(); }));
    const bt = this.root.querySelector('#bountyRow');
    if (bt) bt.addEventListener('click', () => {
      const b = todaysBounty();
      if (bountyDone()) return;
      stash.bountyArmed = !stash.bountyArmed;
      // Taking it also takes you to its rung: a daily you have to go and find
      // on the ladder is a daily half the people who took it never ran.
      if (stash.bountyArmed) this.pick.level = b.level_id;
      saveStash();
      again();
    });
    const hc = this.root.querySelector('#hcToggle');
    if (hc) hc.addEventListener('click', () => {
      // Nothing is destroyed by switching: the two stashes are separate keys.
      // The confirmation is for turning Hardcore ON, where the next death is
      // final, and not for coming back.
      if (!hardcore && !this.hcArmed) { this.hcArmed = true; again(); return; }
      this.hcArmed = false;
      setHardcore(!hardcore);
      this.pick.hero = stash.hero || this.pick.hero;
      again();
    });
    this.root.querySelectorAll('[data-region]').forEach(b =>
      b.addEventListener('click', () => {
        const id = b.dataset.region;
        stash.region = id === 'any' ? null : id;
        saveStash();
        again();
      }));
    for (const id of ['#descend', '#descendHere']) {
      const d = this.root.querySelector(id);
      if (d) d.addEventListener('click', () => {
        this.root.classList.remove('up'); document.body.classList.remove('menus');
        snd('descend'); this.onDescend(this.pick.hero, this.pick.level, this.pick.diff);
      });
    }
  }

  /* The bar along the bottom, where a thumb already is. An icon and a word
   * each; the station you are in is lit. Settings is the small one at the end. */
  tabs(on) {
    // Unspent talent points wear a badge on their tab, or they are forgotten.
    const free = typeof talentPoints === 'function' ? talentPoints(this.pick.hero || 'isaac').free : 0;
    const t = (id, icon, label) =>
      '<button type="button" data-tab="' + id + '" class="' + (on === id ? 'on' : '') +
      (label ? '' : ' cog') + '"><i>' + icon + '</i>' + (label ? '<span>' + label + '</span>' : '') +
      (id === 'talents' && free > 0 ? '<b class="badge">' + free + '</b>' : '') +
      '</button>';
    return '<nav class="tabs">' +
      t('splash', '⌂︎', 'Home') + t('delves', '⇣︎', 'Delves') +
      t('gear', '⚒︎', 'Forge') + t('talents', '✧︎', 'Talents') + t('vendor', '⚖︎', 'Vendor') +
      t('hall', '♜︎', 'Hall') + t('settings', '⚙︎', '') + '</nav>';
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
    snd(ok === false ? 'deny' : 'buy');
    this.slotFor = null;
    this.note = ok === false
      ? 'The vendor turns you away.'
      : 'Done — ' + (before - (stash.coins || 0)) + ' coin.';
    saveStash();
    this.renderVendor();
  }

  /* The hall. Four stations, three tiers each, and every tier says what it
   * changes rather than what it costs alone. */
  /* TALENTS. Three trees a hero, four tiers each, ranks shown the way the
   * screenshot they were asked for from shows them (2/5), and a straight
   * arrow down from a talent to the one built on it. Tap a talent to read it;
   * the panel under the tree says what a rank gives and learns it. All the
   * rules are the core's (talentBlock, learnTalent, resetTalents). */
  renderTalents() {
    this.settlePick();
    const hero = this.pick.hero;
    const trees = TALENTS[hero];
    this.talTree = Math.min(this.talTree || 0, trees.length - 1);
    const tr = trees[this.talTree];
    const R = talentRanks(hero), pts = talentPoints(hero);
    const spent = talentTreeSpent(hero, tr);
    if (!this.talSel || !tr.talents.some(t => t.id === this.talSel)) this.talSel = tr.talents[0].id;
    const sel = tr.talents.find(t => t.id === this.talSel);
    const ROW = 92;
    const at = (tier, col) => 'left:calc(' + ((col + 0.5) * 100 / 3).toFixed(3) + '% - 32px);top:' + (tier * ROW + 14) + 'px';
    const nodes = tr.talents.map(t => {
      const r = R[t.id] || 0;
      const why = talentBlock(hero, t.id);
      const gated = spent < TALENT_TIER * t.tier || (t.req && (R[t.req] || 0) < findTalent(hero, t.req).t.max);
      const cls = r >= t.max ? 'max' : r > 0 ? 'has' : gated ? 'locked' : !why ? 'open' : 'idle';
      return '<button type="button" class="node ' + cls + (t.id === this.talSel ? ' sel' : '') +
        '" data-tal="' + t.id + '" style="' + at(t.tier, t.col) + '" aria-label="' + t.name + '">' +
        '<i>' + t.glyph + '</i><b class="rk">' + r + '/' + t.max + '</b></button>';
    }).join('');
    const arrows = tr.talents.filter(t => t.req).map(t => {
      const q = findTalent(hero, t.req).t;
      const lit = (R[q.id] || 0) >= q.max;
      const top = q.tier * ROW + 14 + 64, h = (t.tier - q.tier) * ROW - 64;
      return '<span class="arrow' + (lit ? ' lit' : '') + '" style="left:calc(' +
        ((t.col + 0.5) * 100 / 3).toFixed(3) + '% - 3px);top:' + top + 'px;height:' + h + 'px"></span>';
    }).join('');
    const gates = [1, 2, 3].map(tier => spent < TALENT_TIER * tier
      ? '<span class="gate" style="top:' + (tier * ROW + 4) + 'px">' + TALENT_TIER * tier + ' in ' + tr.name + '</span>' : '').join('');
    const r = R[sel.id] || 0, why = talentBlock(hero, sel.id);
    const cost = talentResetCost(hero);
    this.root.innerHTML =
      '<div class="card talents">' +
        '<h1>Talents</h1>' +
        '<div class="rows heroes">' + Object.values(HEROES).map(h =>
          '<button class="row' + (hero === h.id ? ' on' : '') + '" data-thero="' + h.id + '" type="button"><span>' +
          h.name + '<small>' + talentPoints(h.id).free + ' to spend</small></span></button>').join('') + '</div>' +
        '<div class="purse"><span>Points</span><b>' + pts.free + '</b><span>of ' + pts.total + '</span></div>' +
        '<div class="seg" id="treeSeg">' + trees.map((x, i) =>
          '<button type="button" data-tree="' + i + '" class="' + (i === this.talTree ? 'on' : '') + '">' +
          x.name + ' <small>' + talentTreeSpent(hero, x) + '</small></button>').join('') + '</div>' +
        '<div class="tgrid" style="--hue:' + tr.hue + ';height:' + (4 * ROW + 8) + 'px">' + gates + arrows + nodes + '</div>' +
        '<div class="tdetail" style="--hue:' + tr.hue + '">' +
          '<b>' + sel.glyph + ' ' + sel.name + '</b><em>Rank ' + r + ' of ' + sel.max + '</em>' +
          '<p>Each rank: ' + sel.text + '.</p>' +
          (why && why !== 'mastered' ? '<p class="why">' + why.charAt(0).toUpperCase() + why.slice(1) + '.</p>' : '') +
          '<button class="go" type="button" id="learnTal"' + (why ? ' disabled' : '') + '>' +
            (why === 'mastered' ? 'Mastered' : 'Learn — 1 point') + '</button>' +
        '</div>' +
        (this.note ? '<p class="sub">' + this.note + '</p>' : '') +
        (pts.spent ? '<button class="alt" type="button" id="resetTal">' +
          (this.resetArmed ? 'Tap again — ' + cost + ' coin to take all back' : 'Take back every talent — ' + cost + ' coin') +
          '</button>' : '') +
      '</div>' + this.tabs('talents');

    this.wireTabs();
    const again = () => { this.renderTalents(); };
    this.root.querySelectorAll('[data-thero]').forEach(b => b.addEventListener('click', () => {
      this.pick.hero = b.dataset.thero; this.talSel = null; this.note = null; this.resetArmed = false; again(); }));
    this.root.querySelectorAll('[data-tree]').forEach(b => b.addEventListener('click', () => {
      this.talTree = +b.dataset.tree; this.talSel = null; this.note = null; again(); }));
    this.root.querySelectorAll('[data-tal]').forEach(b => b.addEventListener('click', () => {
      this.talSel = b.dataset.tal; this.note = null; again(); }));
    const learn = this.root.querySelector('#learnTal');
    if (learn) learn.addEventListener('click', () => {
      const w = learnTalent(hero, sel.id);
      snd(w ? 'deny' : 'build');
      this.note = null; again();
    });
    const rs = this.root.querySelector('#resetTal');
    if (rs) rs.addEventListener('click', () => {
      if (!this.resetArmed) { this.resetArmed = true; again(); return; }
      this.resetArmed = false;
      const w = resetTalents(hero);
      snd(w ? 'deny' : 'build');
      this.note = w ? 'Not yet — ' + w + '.' : 'Every point is back to spend.';
      again();
    });
  }

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
        this.silenced() +
        '<div class="rows">' + rows + '</div>' +
        this.loreBook() +
      '</div>';

    this.wireTabs();
    this.root.querySelectorAll('[data-hall]').forEach(b =>
      b.addEventListener('click', () => {
        const h = HALL.find(x => x.id === b.dataset.hall);
        const why = hallBuy(h);
        snd(why ? 'deny' : 'build');
        this.note = why ? 'The mason shakes his head — ' + why + '.' : 'Built.';
        this.renderHall();
      }));
  }
  /* THE LORE: every page found in the delves, in the order the world tells
   * it, and how many are still down there. Kept in the honours, so it is the
   * same book in either kit. */
  loreBook() {
    if (typeof LORE === 'undefined' || typeof loreFound !== 'function') return '';
    const have = new Set(loreFound());
    const pages = LORE.map((pg, i) => have.has(i)
      ? '<div class="row lore"><span><b>' + pg[0] + '</b><small>' + pg[1] + '</small></span></div>' : '').join('');
    return '<p class="sub">The lore of the Rivenmark \u2014 ' + have.size + ' of ' + LORE.length +
      ' pages found' + (have.size ? '.' : '. Glowing pages lie in the delves.') + '</p>' +
      (have.size ? '<div class="rows lorebook">' + pages + '</div>' : '');
  }

  /* The ending, kept: once the whole Choir has been silenced and carried out
   * of, the Hall says so, and how many times. */
  silenced() {
    const n = typeof honours === 'function' ? (honours().silence || 0) : 0;
    return n ? '<p class="sub honour">\u25c8 The Silent Choir, Whole, was silenced' +
               (n > 1 ? ' ' + n + ' times' : '') + '. The ladder stays open.</p>' : '';
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
  /* The icon for a piece: its own base if the strip has one, else its slot's. */
  static ico(key, none) {
    const i = ICON[key] !== undefined ? ICON[key] : 0;
    return '<i class="ico' + (none ? ' none' : '') + '" style="--i:' + i + '" aria-hidden="true"></i>';
  }

  itemCard(it, act, extra) {
    const r = RARITY.find(x => x.id === it.rarity) || RARITY[0];
    const aff = it.affixes.map(a => affixText(a, stash.hero)).filter(Boolean).join(' · ');
    const key = ICON[it.base] !== undefined ? it.base : it.slot;
    return '<span class="item">' + Screens.ico(key) + '<span><b style="color:' + r.colour + '">' + it.name +
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
    // What each vault piece would change is read against the stash's kit, so
    // the core's gear context is pointed there. The canvas build showed this
    // when a piece was selected; here every row carries it, as the bag does.
    gearCtx = stashCtx();
    // In the order and under the filter chosen -- the core's own, bagSort and
    // bagFilter, which the canvas bag used. Sorting reorders the vault itself,
    // so every index below is a real position in it.
    sortBag(gearCtx);
    const shown = bagShown(gearCtx);
    this.root.innerHTML =
      '<div class="card">' +
        '<h1>The Forge</h1>' +
        this.tabs('gear') +
        '<div class="purse"><span>Power</span><b>' + stashPower() + '</b></div>' +
        (this.note ? '<p class="sub">' + this.note + '</p>' : '') +
        // Three places in one station: a bar at the top of the scroll that
        // goes to each, so the vault is not a long scroll past the kit.
        '<div class="seg" id="forgeSeg">' +
          '<button type="button" data-jump="worn" class="on">Worn</button>' +
          '<button type="button" data-jump="presets">Presets</button>' +
          '<button type="button" data-jump="vault">Vault</button></div>' +
        '<p class="sub sec" id="sec-worn">Worn</p>' +
        '<div class="rows">' +
          SLOTS.map(sl => {
            const it = stash.gear[sl.id];
            return '<button class="row" type="button" data-off="' + sl.id + '"' +
              (it ? '' : ' disabled') + '>' +
              (it ? this.itemCard(it, 'take off')
                  : '<span class="item">' + Screens.ico(sl.id, true) + '<span>' + sl.name +
                    '<span class="aff empty">nothing worn</span></span></span>') +
              '</button>';
          }).join('') +
        '</div>' +
        this.presets() +
        '<p class="sub sec" id="sec-vault">The vault &mdash; ' + stash.vault.length + ' of ' + cap + '</p>' +
        this.vaultBar() +
        '<div class="rows" id="vaultRows">' +
          (shown.length
            ? shown.map(({ it, i }) =>
                '<div class="pair"><button class="row' + (isUpgrade(it, stash.gear) ? ' up' : '') +
                '" type="button" data-on="' + i + '" data-uid="' + it.uid + '">' +
                this.itemCard(it, isUpgrade(it, stash.gear)
                  ? 'wear<span class="upmark">\u25b2</span>' : 'wear',
                  this.compareHtml(it)) + '</button>' +
                '<button class="drop' + (this.dropArmed === i ? ' armed' : '') +
                '" type="button" data-drop="' + i + '" aria-label="discard">' +
                (this.dropArmed === i ? 'discard?' : '\u2715') + '</button></div>').join('')
            : '<div class="row"><span class="empty">' + (stash.vault.length
                ? 'Nothing in the vault matches that.'
                : 'Nothing here yet. Champions and the avatar carry the Regalia.') +
              '</span></div>') +
        '</div>' +
      '</div>';

    // Any tap other than the second one on the same piece stands the discard
    // down again, so an armed button never lingers to be hit by accident.
    const done = () => { this.dropArmed = null; this.renderForge(); };
    this.wireTabs();
    this.root.querySelectorAll('[data-on]').forEach(b =>
      b.addEventListener('click', () => { this.note = null; this.equip(+b.dataset.on); snd('equip'); done(); }));
    this.root.querySelectorAll('[data-off]').forEach(b =>
      b.addEventListener('click', () => { this.note = null; this.unequip(b.dataset.off); snd('unequip'); done(); }));
    this.root.querySelectorAll('[data-drop]').forEach(b =>
      b.addEventListener('click', () => {
        const i = +b.dataset.drop;
        if (this.dropArmed !== i) { this.dropArmed = i; this.renderForge(); return; }
        const it = discardFromVault(i);
        if (it) snd('discard');
        this.note = it ? it.name + ' is gone.' : null;
        done();
      }));
    this.root.querySelectorAll('[data-load]').forEach(b =>
      b.addEventListener('click', () => {
        const L = stash.loadouts[+b.dataset.load];
        const r = applyLoadout(L);
        snd('equip');
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
    this.root.querySelectorAll('[data-sort]').forEach(b =>
      b.addEventListener('click', () => {
        const at = BAG_SORTS.findIndex(x => x.id === bagSort);
        bagSort = BAG_SORTS[(at + 1) % BAG_SORTS.length].id;
        done();
      }));
    this.root.querySelectorAll('[data-filter]').forEach(b =>
      b.addEventListener('click', () => {
        const f = b.dataset.filter;
        bagFilter = bagFilter === f && f !== 'all' ? 'all' : f;
        done();
      }));
    const seg = this.root.querySelectorAll('[data-jump]');
    seg.forEach(b => b.addEventListener('click', () => {
      seg.forEach(x => x.classList.toggle('on', x === b));
      const at = this.root.querySelector('#sec-' + b.dataset.jump);
      if (at) at.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
    const sv = this.root.querySelector('#saveKit');
    if (sv) sv.addEventListener('click', () => {
      const L = saveLoadout();
      this.note = L.name + ' saved \u2014 the kit you are wearing, as it is now.';
      done();
    });
  }

  /* THE VAULT'S ORDER AND FILTER. It holds sixty pieces, and up to a hundred
   * and twenty with the Hall's Vault built out; a list that long in the order
   * things were found is a list nobody can use. One chip cycles the order
   * (power, slot, rarity, newest), and the rest filter: everything, only what
   * beats what is worn, or one slot -- a slot chip tapped again clears it. The
   * two rings are one chip, as they are one kind of thing. */
  vaultBar() {
    const order = (BAG_SORTS.find(x => x.id === bagSort) || BAG_SORTS[0]).name;
    const chip = (f, label) => '<button class="chip' + (bagFilter === f ? ' on' : '') +
      '" type="button" data-filter="' + f + '">' + label + '</button>';
    const seen = new Set();
    const slots = SLOTS.filter(sl => {
      const k = sl.id === 'ring2' ? 'ring1' : sl.id;
      if (seen.has(k)) return false; seen.add(k); return true;
    });
    return '<div class="chips" id="vaultBar">' +
      '<button class="chip on" type="button" data-sort="1">Order: ' + order + '</button>' +
      chip('all', 'All') + chip('up', '\u25b2 Upgrades') +
      slots.map(sl => chip(sl.id, sl.mark + ' ' + (sl.id === 'ring1' ? 'Rings' : sl.name)))
        .join('') +
      '</div>';
  }

  /* KIT PRESETS. A preset is a list of item ids, so wearing one takes each
   * piece out of the vault if it is still there and says how many were not.
   * Saved only while there is room -- the Hall's Vault is what buys more --
   * and let go of with two taps, the same as a discard. */
  presets() {
    const cap = typeof loadoutCap === 'function' ? loadoutCap() : 0;
    const Ls = stash.loadouts || [];
    return '<p class="sub sec" id="sec-presets">Kit presets &mdash; ' + Ls.length + ' of ' + cap + '</p>' +
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
  /* What a piece would change against what is worn in its slot, per stat --
   * the core's compareLines, which reads gearCtx for "what is worn". */
  compareHtml(it) {
    const c = typeof compareLines === 'function' ? compareLines(it) : [];
    // The verdict first, in one word and a number: better or weaker than what
    // is worn in that slot (the weaker ring, for a ring), by how much power.
    const g = (gearCtx && gearCtx.gear) || stash.gear;
    const worn = it.slot === 'ring1' || it.slot === 'ring2'
      ? [g.ring1, g.ring2].sort((a, b) => itemPower(a) - itemPower(b))[0] : g[it.slot];
    const d = Math.round(itemPower(it) - itemPower(worn));
    const verdict = !worn ? '<span class="verdict up">\u25b2 fills an empty slot</span>'
      : d > 0 ? '<span class="verdict up">\u25b2 stronger, +' + d + ' power</span>'
      : d < 0 ? '<span class="verdict down">\u25bc weaker, ' + d + ' power</span>'
      : '<span class="verdict">= as strong as what you wear</span>';
    if (!c.length) return verdict + '<span class="cmp">no change to your stats</span>';
    return verdict + '<span class="cmp">' + c.map(x =>
      '<span class="' + (x.good ? 'up' : 'down') + '">' + (x.good ? '\u25b2 ' : '\u25bc ') + x.txt + ' ' + x.name +
      '</span>').join('<br>') + '</span>';
  }

  renderBag() {
    const C = gearCtx;
    const lines = it => this.compareHtml(it);
    this.root.innerHTML =
      '<div class="card">' +
        '<h1>The Bag</h1>' +
        '<p class="sub">Carried so far &mdash; ' + C.bag.length + ' of ' + C.cap +
          '. It banks only if you walk out with it; sort it at the gate-house.</p>' +
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
              : '<span class="item">' + Screens.ico(sl.id, true) + '<span>' + sl.name +
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
