/* THE FORGE — every sprite in The Rivenmark, drawn in code.
 *
 * Bodies, heroes, weapons, coffers, loot, props, shadows, the ground and the
 * coursed stone of the walls: all of it is painted here with the 2D canvas
 * API, at SS (2x) supersample, lit from the one direction the whole game
 * uses. Nothing in the game draws with this at run time -- the Phaser build
 * draws from an atlas -- so this is an art tool, not game code:
 *
 *   tools/forge/forge.html   loads the rules (phaser/src/core/core.js), which
 *                            carry every palette, radius and table the paint
 *                            reads, then this file, then calls forgeAll()
 *   tools/export-art.js      opens that page and writes every sprite to art/
 *   phaser/tools/pack-atlas  packs art/ (and art-custom/ over it) for the game
 *
 * To change how something looks, change it here and run export-art. To add a
 * creature, give it an ENEMY_TYPES entry in the core and a paint in
 * forgeEnemy, and it is forged with the rest.
 *
 * This was the rendering section of the single-file canvas build, index.html,
 * sliced out by what forgeAll actually reaches when that build was retired;
 * export-art proved it writes art/ byte for byte as index.html did.
 */
   // frames per decision, about three quarters of a second

let SS = 2;

                     // sprite supersample factor
const SPR = {};

                 // forged entity sprites
const LIGHTS = new Map();

       // radial light blobs, keyed colour|span
let vignette = null;

const wallGrads = new Map();

/* --- forge helpers ------------------------------------------------------ */

function newCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

// Paint into a centred sprite `span` world-units across.
function forge(span, paint) {
  const px = Math.ceil(span * SS);
  const c = newCanvas(px, px);
  const g = c.getContext('2d');
  g.translate(px / 2, px / 2);
  g.scale(SS, SS);
  paint(g);
  // Span is derived back from the rounded pixel size so that span * dpr is
  // exactly the source width: an unresampled blit instead of a filtered one.
  c.span = px / SS;
  return c;
}

/* Light a finished sprite: a rim along its lit edge, and a sharper highlight
 * on the materials that would carry one.
 *
 * WHY BOTH IN ONE PASS. Each needs to know something per-pixel -- the rim
 * needs the solid silhouette, the sheen needs luminance and saturation -- and
 * the way to know that is getImageData, which is a GPU-to-CPU readback. Run as
 * two functions it was two readbacks and two full-image loops per sprite, and
 * it took forgeAll from 65ms to 451ms: seven times the load cost of every body
 * and hero in the game, to light them. One readback, one loop, two masks.
 *
 * THE RIM. Built by subtraction: the silhouette punched out of itself offset
 * down-light, leaving the crescent that faces the light. That works on eleven
 * hand-painted creatures that share no paths, and it adds nothing outside the
 * silhouette already there -- measured, all eleven bounding boxes came back
 * identical, so nothing moved, resized, or parted company with its own shadow.
 *
 * It follows the SOLID body: a sprite carries its own contact shadow painted
 * underneath at 0.4 alpha, and a bright crescent along the top of a shadow is
 * a light source beneath the floor. Alpha is remapped rather than thresholded
 * so the body keeps its edge softness instead of being cut to a stencil.
 *
 * THE SHEEN. Plate and rag read alike at fifty pixels because every material
 * here is a soft top-to-bottom ramp, and a soft ramp is matte. What says METAL
 * is a narrow specular; what says CLOTH is the absence of one. The forge cannot
 * be asked which path was armour, but it does not need to be: in this bestiary
 * the armour IS the light-valued material -- the breaker's helm ramps to 112
 * where its rags sit at 34 -- so the rule is stated as exactly that.
 *
 * Banded three ways. Below LO is cloth and stays matte. Above HI is something
 * already emitting, and a specular on a light source is a blown highlight.
 * And by SATURATION, which is what really separates reflecting from emitting
 * here: the void-brand every body carries is orange at luminance 135, sitting
 * squarely inside the value band, and it came out with a white highlight down
 * a glowing rune. Plate, bone and stone are near-grey; brands and embers are
 * not. Gold trim sits at 0.59 and stays, which is right -- it is metal.
 */
/* Scratch canvases, reused.
 *
 * lightPass wants working surfaces and there are a hundred and thirty-odd
 * sprites, so allocating them fresh is five hundred canvases at load for no
 * reason: they are written and read inside one call and never escape it.
 *
 * Handed back in a KNOWN STATE, which is the whole difficulty with pooling a
 * canvas. Clearing the pixels is not enough -- a context remembers its
 * composite operation and its alpha, and the caller here sets both. Without
 * the reset the second user of a surface inherited 'source-in' from the first
 * and composited into nothing: the rim silently stopped being drawn on every
 * sprite after the first, and the art came back byte-identical at the lit edge
 * to art with no lighting at all.
 */
const _scr = [];

function scratch(i, px) {
  let c = _scr[i];
  if (!c) c = _scr[i] = newCanvas(px, px);
  else if (c.width !== px || c.height !== px) { c.width = px; c.height = px; }
  else c.getContext('2d').clearRect(0, 0, px, px);
  const g = c.getContext('2d');
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;
  return c;
}

function lightPass(c) {
  const px = c.width;
  const g = c.getContext('2d');
  const src = g.getImageData(0, 0, px, px).data;

  const body = scratch(0, px), mat = scratch(1, px);
  const gb = body.getContext('2d'), gt = mat.getContext('2d');
  const ib = gb.createImageData(px, px), it = gt.createImageData(px, px);
  const CUT = 160;
  for (let i = 0; i < src.length; i += 4) {
    const a = src[i + 3];
    if (a <= CUT) continue;
    ib.data[i + 3] = ((a - CUT) / (255 - CUT)) * 255;
    if (a < 200) continue;
    const r = src[i], gg = src[i + 1], b = src[i + 2];
    const L = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
    if (L < SHEEN_LO || L > SHEEN_HI) continue;
    const mx = Math.max(r, gg, b);
    if (mx > 0 && (mx - Math.min(r, gg, b)) / mx > SHEEN_SAT) continue;
    it.data[i + 3] = 255;
  }
  gb.putImageData(ib, 0, 0);
  gt.putImageData(it, 0, 0);

  // The up-light edge of a mask: itself, minus itself shifted away from the
  // light. For the body that is its outline; for the material it is a line
  // along the top of every plate, which is where a highlight sits.
  /* At least one pixel wide, whatever the display.
   *
   * The widths are in world units and scale by SS, which is right -- a rim
   * should be the same apparent thickness on a phone as on a desktop. But at
   * SS 1 that comes to 0.53 x 0.66 pixels, and a sub-pixel subtraction leaves
   * a crescent so faint it is not there: measured at dpr 1, eight of eleven
   * bodies came back no brighter at the lit edge than unlit ones. The shipped
   * atlas is exported at 2x and never saw it; a low-dpr display would have.
   */
  const edge = (mask, colour, width) => {
    let ox = LIGHT.x * width * SS, oy = LIGHT.y * width * SS;
    const len = Math.hypot(ox, oy);
    if (len < 1.25) { ox *= 1.25 / len; oy *= 1.25 / len; }
    const k = scratch(2, px), gk = k.getContext('2d');
    gk.drawImage(mask, 0, 0);
    gk.globalCompositeOperation = 'destination-out';
    gk.drawImage(mask, ox, oy);
    gk.globalCompositeOperation = 'source-in';
    gk.fillStyle = colour;
    gk.fillRect(0, 0, px, px);
    return k;
  };

  g.save();
  // forge() left a translate+scale on this context; the crescents are already
  // in device pixels, so they go down under the identity.
  g.setTransform(1, 0, 0, 1, 0, 0);
  // Drawn one at a time: both edges share a scratch surface, so the specular
  // has to be down before the rim is built over the top of it. The specular
  // goes first either way -- the rim owns the outermost edge.
  g.globalAlpha = SHEEN_A;
  g.drawImage(edge(mat, SHEEN_HUE, SHEEN_W), 0, 0);
  g.globalAlpha = RIM_A;
  g.drawImage(edge(body, RIM_HUE, RIM_W), 0, 0);
  g.restore();
  return c;
}

      // above this fraction of top speed, he is running

// One pose. `sw` scales the stride, so the same shape serves both cycles.
function gaitPose(i, sw) {
  const ph = (i / GAIT_N) * TAU;
  const sn = Math.sin(ph), cs = Math.cos(ph);
  return {
    swing: sn * sw,                            // near leg forward, far leg back
    lift: Math.max(0, -cs) * sw * 0.8,         // the near foot comes up passing
    liftB: Math.max(0, cs) * sw * 0.8,
    arm: -sn * sw * 0.9,                       // arms counter the legs
    bob: -Math.abs(sn) * sw * 0.34,            // rises at each push-off
    roll: sn * sw * 0.06,                      // and rocks around the spine
    lean: sw * 0.22                            // leaning into the travel
  };
}

const GAIT_REST = { swing: 0, lift: 0, liftB: 0, arm: 0, bob: 0, roll: 0, lean: 0 };

// One body in one pose. `P` is a gait pose (GAIT_REST for the standing frame);
// the hit flash is no longer baked in, it is an additive pass at draw time.
// `bare` forges the body without the light pass. Only the look suite passes it,
// and it is there so that suite can prove the pass is what lights a body
// rather than asserting a number and hoping.
function forgeEnemy(kind, r, color, P, bare) {
  /* A kind with a `look` is painted as the kind it borrows from. Resolved
   * HERE and not at the call site: it was done in forgeAll's loop first, and
   * look.js caught that immediately -- the suite forges its own unlit twin to
   * prove the light pass moves nothing, and its twin came back as the fallback
   * body while SPR held a gorger, so the two had different silhouettes and the
   * check failed on the fixture rather than on the sprite. One caller knowing
   * about `look` is one caller too few.
   */
  kind = (ENEMY_TYPES[kind] && ENEMY_TYPES[kind].look) || kind;
  const u = r * 1.16;
  const outline = (w) => { g0.strokeStyle = 'rgba(0,0,0,.82)'; g0.lineWidth = w; g0.stroke(); };
  let g0 = null;

  // Where this pose puts the limbs. A is the near side, B the far one.
  const swA = u * P.swing, swB = -u * P.swing;
  const lfA = -u * P.lift, lfB = -u * P.liftB;
  const arA = u * P.arm,   arB = -u * P.arm;

  // Bounds sized to the figure (widest extent is the shadow at 1.28u), not a
  // round number: at 340 bodies in a delve the padding is pure fill cost.
  return (bare ? (x => x) : lightPass)(forge(u * 2.9, g => {
    g0 = g;
    g.lineJoin = 'round';
    g.lineCap = 'round';

    // Everything above the feet rides the gait: it rises at each push-off and
    // rocks around the spine. The shadow does not -- it is on the floor.
    g.save();
    g.translate(0, u * P.bob);
    // The lean is pivoted over the feet rather than the middle of the sprite,
    // so a running body tips its head forward instead of sliding sideways.
    // It is baked rather than applied at blit time because it is constant for
    // the pose, and a rotation per body per frame is not free on a phone.
    g.translate(0, u * 0.95);
    g.rotate(P.roll + P.lean);
    g.translate(0, -u * 0.95);

    if (kind === 'thrall') {
      // A corpse that has been made to run: stooped over its own opened ribs,
      // one shoulder wrenched higher than the other, arms longer than they
      // should be and hands it can no longer close.
      g.strokeStyle = 'rgb(46,50,36)'; g.lineWidth = u * 0.24;         // legs
      g.beginPath();
      g.moveTo(-u * 0.18, u * 0.4); g.lineTo(-u * 0.3 + swB, u * 1.05 + lfB);
      g.moveTo(u * 0.2, u * 0.4);   g.lineTo(u * 0.32 + swA, u * 1.02 + lfA);
      g.stroke();
      g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = u * 0.09;       // shins
      g.beginPath();
      g.moveTo(-u * 0.3 + swB, u * 1.05 + lfB); g.lineTo(-u * 0.42 + swB, u * 1.12 + lfB);
      g.moveTo(u * 0.32 + swA, u * 1.02 + lfA); g.lineTo(u * 0.44 + swA, u * 1.09 + lfA);
      g.stroke();

      const bg = g.createLinearGradient(0, -u * 0.62, 0, u * 0.6);     // hunched back
      bg.addColorStop(0, 'rgb(112,124,84)');
      bg.addColorStop(1, 'rgb(40,44,30)');
      g.fillStyle = bg;
      g.beginPath();
      g.moveTo(-u * 0.52, u * 0.42);
      g.quadraticCurveTo(-u * 0.76, -u * 0.30, -u * 0.16, -u * 0.46);
      g.quadraticCurveTo(u * 0.64, -u * 0.56, u * 0.54, u * 0.42);     // right shoulder higher
      g.closePath(); g.fill(); outline(u * 0.13);

      // The chest is open. A dark cavity with three courses of rib across it:
      // at this size that reads as ribs where anything more detailed reads as
      // dirt on the sprite.
      g.fillStyle = 'rgba(9,11,7,.9)';
      g.beginPath(); g.ellipse(u * 0.02, -u * 0.06, u * 0.3, u * 0.26, 0.06, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(202,200,172,.72)'; g.lineWidth = u * 0.055;
      for (let i = 0; i < 3; i++) {
        g.beginPath();
        g.ellipse(u * 0.02, -u * 0.21 + i * u * 0.15, u * 0.25 - i * u * 0.03,
                  u * 0.08, 0, 0.3, Math.PI - 0.3);
        g.stroke();
      }

      g.fillStyle = 'rgba(34,32,23,.88)';                              // rags below it
      g.beginPath();
      g.moveTo(-u * 0.5, u * 0.2); g.lineTo(u * 0.52, u * 0.12);
      g.lineTo(u * 0.42, u * 0.52); g.lineTo(u * 0.14, u * 0.4);
      g.lineTo(-u * 0.1, u * 0.56); g.lineTo(-u * 0.44, u * 0.44);
      g.closePath(); g.fill();

      g.strokeStyle = 'rgb(100,110,74)'; g.lineWidth = u * 0.16;       // long arms
      g.beginPath();
      g.moveTo(-u * 0.44, -u * 0.16);
      g.quadraticCurveTo(-u * 0.9 + arB * 0.5, u * 0.32, -u * 0.66 + arB, u * 0.9);
      g.moveTo(u * 0.48, -u * 0.28);
      g.quadraticCurveTo(u * 0.94 + arA * 0.5, u * 0.24, u * 0.72 + arA, u * 0.88);
      g.stroke();
      g.strokeStyle = 'rgba(212,208,182,.8)'; g.lineWidth = u * 0.045; // and the claws
      g.beginPath();
      [[-u * 0.66 + arB, u * 0.9], [u * 0.72 + arA, u * 0.88]].forEach(h => {
        for (let k = -1; k <= 1; k++) {
          g.moveTo(h[0], h[1]);
          g.lineTo(h[0] + k * u * 0.08, h[1] + u * 0.21 - Math.abs(k) * u * 0.05);
        }
      });
      g.stroke();

      // The head hangs off the neck at an angle nothing living holds.
      g.save();
      g.translate(u * 0.08, -u * 0.62);
      g.rotate(0.34);
      const hg = g.createLinearGradient(0, -u * 0.32, 0, u * 0.3);
      hg.addColorStop(0, 'rgb(154,164,116)');
      hg.addColorStop(1, 'rgb(54,58,40)');
      g.fillStyle = hg;
      g.beginPath(); g.ellipse(0, 0, u * 0.3, u * 0.27, 0, 0, TAU); g.fill();
      outline(u * 0.09);
      g.fillStyle = 'rgba(6,8,5,.96)';                                  // sockets
      g.beginPath(); g.ellipse(-u * 0.12, -u * 0.05, u * 0.11, u * 0.1, 0, 0, TAU); g.fill();
      g.beginPath(); g.ellipse(u * 0.13, -u * 0.06, u * 0.11, u * 0.1, 0, 0, TAU); g.fill();
      g.fillStyle = color;                                              // the light left in them
      g.shadowColor = color; g.shadowBlur = u * 0.32;
      g.beginPath(); g.ellipse(-u * 0.11, -u * 0.04, u * 0.04, u * 0.04, 0, 0, TAU); g.fill();
      g.beginPath(); g.ellipse(u * 0.14, -u * 0.05, u * 0.04, u * 0.04, 0, 0, TAU); g.fill();
      g.shadowBlur = 0;
      g.fillStyle = 'rgba(9,11,7,.95)';                                 // the jaw hangs open
      g.beginPath();
      g.moveTo(-u * 0.15, u * 0.11); g.lineTo(u * 0.17, u * 0.09);
      g.lineTo(u * 0.13, u * 0.35); g.lineTo(-u * 0.11, u * 0.35);
      g.closePath(); g.fill(); outline(u * 0.05);
      g.strokeStyle = 'rgba(210,206,178,.82)'; g.lineWidth = u * 0.035;
      g.beginPath();
      for (let k = 0; k < 4; k++) {
        const tx = -u * 0.11 + k * u * 0.077;
        g.moveTo(tx, u * 0.12); g.lineTo(tx, u * 0.2);
      }
      g.stroke();
      g.restore();

    } else if (kind === 'eclipse') {
      // Nothing stands in the robe. It hangs and it travels, so the hem swings
      // where the legs would be and the frayed end never quite touches down.
      const rg = g.createLinearGradient(0, -u * 0.9, 0, u * 1.1);
      rg.addColorStop(0, 'rgb(76,64,108)');
      rg.addColorStop(0.6, 'rgb(32,26,50)');
      rg.addColorStop(1, 'rgba(14,11,22,0)');
      g.fillStyle = rg;
      g.beginPath();
      g.moveTo(-u * 0.44, -u * 0.44);
      g.quadraticCurveTo(-u * 0.74, u * 0.3, -u * 0.5 + swB, u * 1.06 + lfB);
      g.lineTo(-u * 0.22 + swB * 0.5, u * 0.76);
      g.lineTo(-u * 0.02, u * 1.12);
      g.lineTo(u * 0.22 + swA * 0.5, u * 0.74);
      g.quadraticCurveTo(u * 0.72, u * 0.28, u * 0.46 + swA, u * 1.04 + lfA);
      g.quadraticCurveTo(u * 0.7, u * 0.28, u * 0.44, -u * 0.44);
      g.closePath(); g.fill();
      g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = u * 0.1; g.stroke();

      g.strokeStyle = 'rgba(176,124,255,.26)'; g.lineWidth = u * 0.09;   // trailing wisps
      g.beginPath();
      g.moveTo(-u * 0.42, u * 0.2);
      g.quadraticCurveTo(-u * 0.96, u * 0.5 + arB, -u * 1.1, u * 0.16 + arB);
      g.moveTo(u * 0.42, u * 0.24);
      g.quadraticCurveTo(u * 0.96, u * 0.54 + arA, u * 1.1, u * 0.2 + arA);
      g.stroke();

      // What comes out of the sleeves is bone.
      g.strokeStyle = 'rgba(186,180,198,.9)'; g.lineWidth = u * 0.055;
      g.beginPath();
      [[-u * 0.34 + arB * 0.7, u * 0.24], [u * 0.36 + arA * 0.7, u * 0.28]].forEach(h => {
        for (let k = -1; k <= 1; k++) {
          g.moveTo(h[0], h[1]);
          g.lineTo(h[0] + k * u * 0.07, h[1] + u * 0.17 - Math.abs(k) * u * 0.04);
        }
      });
      g.stroke();

      const hoodG = g.createLinearGradient(0, -u * 1.05, 0, -u * 0.3);   // hood
      hoodG.addColorStop(0, 'rgb(92,78,130)');
      hoodG.addColorStop(1, 'rgb(26,21,42)');
      g.fillStyle = hoodG;
      g.beginPath();
      g.moveTo(-u * 0.44, -u * 0.34);
      g.quadraticCurveTo(-u * 0.5, -u * 1.04, 0, -u * 1.08);
      g.quadraticCurveTo(u * 0.5, -u * 1.04, u * 0.44, -u * 0.34);
      g.closePath(); g.fill(); outline(u * 0.11);
      g.strokeStyle = 'rgba(168,146,214,.5)'; g.lineWidth = u * 0.05;    // lit edge
      g.beginPath();
      g.moveTo(-u * 0.42, -u * 0.4);
      g.quadraticCurveTo(-u * 0.47, -u * 0.99, u * 0.02, -u * 1.03);
      g.stroke();

      g.fillStyle = 'rgba(4,3,7,.98)';                                   // the hollow
      g.beginPath(); g.ellipse(0, -u * 0.6, u * 0.28, u * 0.3, 0, 0, TAU); g.fill();
      // A face pressing out from the inside of the cloth: the brow ridge and
      // the cheekbones catch the hood's own light, and nothing else does.
      g.strokeStyle = 'rgba(150,132,186,.5)'; g.lineWidth = u * 0.05;
      g.beginPath();
      g.moveTo(-u * 0.2, -u * 0.74); g.quadraticCurveTo(0, -u * 0.82, u * 0.2, -u * 0.74);
      g.moveTo(-u * 0.15, -u * 0.46); g.quadraticCurveTo(0, -u * 0.38, u * 0.15, -u * 0.46);
      g.stroke();
      // Two burning slits, and they have to carry the whole face: at eleven
      // units of radius nothing subtler survives the trip to the screen.
      g.fillStyle = color;
      g.shadowColor = color; g.shadowBlur = u * 0.5;
      [-1, 1].forEach(sx => {
        g.beginPath();
        g.moveTo(sx * u * 0.03, -u * 0.68);
        g.lineTo(sx * u * 0.24, -u * 0.63);
        g.lineTo(sx * u * 0.22, -u * 0.51);
        g.lineTo(sx * u * 0.04, -u * 0.57);
        g.closePath(); g.fill();
      });
      g.fillStyle = 'rgba(255,246,255,.9)';
      [-1, 1].forEach(sx => {
        g.beginPath();
        g.ellipse(sx * u * 0.14, -u * 0.6, u * 0.055, u * 0.04, sx * 0.3, 0, TAU);
        g.fill();
      });
      g.shadowBlur = 0;

    } else if (kind === 'husk') {
      // A body that has kept growing after it stopped being one. Everything
      // about it is the sack: the legs are too short for it, the arms are
      // vestigial, the head has sunk into the shoulders, and the light in it
      // is on the wrong side of the skin.
      g.strokeStyle = 'rgb(58,60,34)'; g.lineWidth = u * 0.2;          // stub legs
      g.beginPath();
      g.moveTo(-u * 0.2, u * 0.5); g.lineTo(-u * 0.26 + swB, u * 0.98 + lfB);
      g.moveTo(u * 0.2, u * 0.5);  g.lineTo(u * 0.28 + swA, u * 0.96 + lfA);
      g.stroke();

      const sg = g.createRadialGradient(-u * 0.1, -u * 0.12, u * 0.05,
                                        0, 0, u * 0.82);              // the sack
      sg.addColorStop(0, 'rgb(150,164,66)');
      sg.addColorStop(0.55, 'rgb(96,106,42)');
      sg.addColorStop(1, 'rgb(44,48,24)');
      g.fillStyle = sg;
      g.beginPath();
      g.ellipse(0, u * 0.02, u * 0.72, u * 0.64, 0, 0, TAU);
      g.fill(); outline(u * 0.13);

      // What is inside it, showing through where the skin has gone thin.
      g.fillStyle = color;
      g.shadowColor = color; g.shadowBlur = u * 0.5;
      g.beginPath(); g.ellipse(-u * 0.06, u * 0.06, u * 0.26, u * 0.22, 0.2, 0, TAU); g.fill();
      g.shadowBlur = 0;
      g.fillStyle = 'rgba(248,255,196,.7)';
      g.beginPath(); g.ellipse(-u * 0.1, u * 0.0, u * 0.11, u * 0.09, 0.2, 0, TAU); g.fill();

      // Seams under strain, running round the belly.
      g.strokeStyle = 'rgba(206,222,96,.5)'; g.lineWidth = u * 0.045;
      for (let i = 0; i < 3; i++) {
        g.beginPath();
        g.ellipse(0, u * 0.02, u * 0.66 - i * u * 0.02, u * 0.58 - i * u * 0.16,
                  0, 0.5 + i * 0.15, Math.PI - 0.5 - i * 0.15);
        g.stroke();
      }
      g.strokeStyle = 'rgba(12,14,6,.5)'; g.lineWidth = u * 0.05;
      g.beginPath();
      g.moveTo(-u * 0.5, -u * 0.3); g.lineTo(-u * 0.3, -u * 0.12);
      g.moveTo(u * 0.44, -u * 0.34); g.lineTo(u * 0.26, -u * 0.16);
      g.stroke();

      g.strokeStyle = 'rgb(104,114,52)'; g.lineWidth = u * 0.12;        // little arms
      g.beginPath();
      g.moveTo(-u * 0.6, -u * 0.24);
      g.quadraticCurveTo(-u * 0.86 + arB, -u * 0.02, -u * 0.74 + arB, u * 0.26);
      g.moveTo(u * 0.6, -u * 0.26);
      g.quadraticCurveTo(u * 0.86 + arA, -u * 0.04, u * 0.74 + arA, u * 0.24);
      g.stroke();

      const hh = g.createLinearGradient(0, -u * 0.92, 0, -u * 0.5);     // sunken head
      hh.addColorStop(0, 'rgb(158,168,96)');
      hh.addColorStop(1, 'rgb(62,68,36)');
      g.fillStyle = hh;
      g.beginPath(); g.ellipse(0, -u * 0.66, u * 0.26, u * 0.22, 0, 0, TAU); g.fill();
      outline(u * 0.09);
      g.fillStyle = 'rgba(8,10,5,.95)';                                  // and its open mouth
      g.beginPath(); g.ellipse(0, -u * 0.58, u * 0.13, u * 0.1, 0, 0, TAU); g.fill();
      g.fillStyle = color;
      g.beginPath(); g.ellipse(-u * 0.1, -u * 0.74, u * 0.045, u * 0.04, 0, 0, TAU); g.fill();
      g.beginPath(); g.ellipse(u * 0.1, -u * 0.74, u * 0.045, u * 0.04, 0, 0, TAU); g.fill();

    } else if (kind === 'cantor') {
      // Thin, and it keeps its distance. The lit thing in its hand is the
      // whole tell: while that is up it is about to throw, and it is the part
      // of the silhouette that carries across a room.
      const rb = g.createLinearGradient(0, -u * 0.7, 0, u * 1.1);       // robe
      rb.addColorStop(0, 'rgb(38,74,76)');
      rb.addColorStop(0.6, 'rgb(20,42,46)');
      rb.addColorStop(1, 'rgb(10,22,26)');
      g.fillStyle = rb;
      g.beginPath();
      g.moveTo(-u * 0.34, -u * 0.5);
      g.quadraticCurveTo(-u * 0.56, u * 0.3, -u * 0.44 + swB, u * 1.04 + lfB);
      g.lineTo(u * 0.44 + swA, u * 1.02 + lfA);
      g.quadraticCurveTo(u * 0.56, u * 0.3, u * 0.34, -u * 0.5);
      g.closePath(); g.fill(); outline(u * 0.12);

      g.strokeStyle = 'rgba(72,208,192,.35)'; g.lineWidth = u * 0.05;   // cold trim
      g.beginPath();
      g.moveTo(-u * 0.3, -u * 0.34); g.lineTo(u * 0.3, -u * 0.34);
      g.moveTo(-u * 0.4, u * 0.86); g.lineTo(u * 0.4, u * 0.84);
      g.stroke();

      // The off hand hangs; the throwing hand is up with the focus in it.
      g.strokeStyle = 'rgb(46,88,90)'; g.lineWidth = u * 0.13;
      g.beginPath();
      g.moveTo(-u * 0.3, -u * 0.3);
      g.quadraticCurveTo(-u * 0.56 + arB, u * 0.1, -u * 0.46 + arB, u * 0.44);
      g.stroke();
      const fx = u * 0.68 + arA * 0.5, fy = -u * 0.72;
      g.beginPath();
      g.moveTo(u * 0.3, -u * 0.34);
      g.quadraticCurveTo(u * 0.58 + arA * 0.4, -u * 0.6, fx, fy + u * 0.14);
      g.stroke();
      g.strokeStyle = 'rgba(190,236,232,.8)'; g.lineWidth = u * 0.04;   // bone fingers
      g.beginPath();
      for (let k = -1; k <= 1; k++) {
        g.moveTo(-u * 0.46 + arB, u * 0.44);
        g.lineTo(-u * 0.46 + arB + k * u * 0.06, u * 0.6 - Math.abs(k) * u * 0.03);
      }
      g.stroke();

      // The focus.
      g.fillStyle = color;
      g.shadowColor = color; g.shadowBlur = u * 0.7;
      g.beginPath();
      g.moveTo(fx, fy - u * 0.2);
      g.lineTo(fx + u * 0.13, fy);
      g.lineTo(fx, fy + u * 0.2);
      g.lineTo(fx - u * 0.13, fy);
      g.closePath(); g.fill();
      g.fillStyle = 'rgba(238,255,252,.9)';
      g.beginPath(); g.ellipse(fx, fy, u * 0.05, u * 0.07, 0, 0, TAU); g.fill();
      g.shadowBlur = 0;

      const hd = g.createLinearGradient(0, -u * 1.0, 0, -u * 0.42);     // hood
      hd.addColorStop(0, 'rgb(46,88,92)');
      hd.addColorStop(1, 'rgb(16,34,38)');
      g.fillStyle = hd;
      g.beginPath();
      g.moveTo(-u * 0.32, -u * 0.44);
      g.quadraticCurveTo(-u * 0.36, -u * 0.98, 0, -u * 1.0);
      g.quadraticCurveTo(u * 0.36, -u * 0.98, u * 0.32, -u * 0.44);
      g.closePath(); g.fill(); outline(u * 0.1);
      g.fillStyle = 'rgba(200,214,206,.92)';                             // a blank mask
      g.beginPath(); g.ellipse(0, -u * 0.66, u * 0.2, u * 0.24, 0, 0, TAU); g.fill();
      outline(u * 0.07);
      g.fillStyle = color;
      g.shadowColor = color; g.shadowBlur = u * 0.35;
      g.fillRect(-u * 0.13, -u * 0.72, u * 0.26, u * 0.05);
      g.shadowBlur = 0;

    } else if (kind === 'gorger') {
      // The biggest thing that walks, and it has to say so from across a room
      // on a phone. Three reads, in order: a wide low body, a head that sits
      // clear of it, and an open molten mouth. The light lives in the mouth --
      // cracks scattered over the body turned into a graphic symbol at size
      // and stopped looking like a creature at all.
      g.strokeStyle = 'rgb(44,39,37)'; g.lineWidth = u * 0.32;           // stump legs
      g.beginPath();
      g.moveTo(-u * 0.26, u * 0.4); g.lineTo(-u * 0.32 + swB * 0.5, u * 0.86 + lfB);
      g.moveTo(u * 0.26, u * 0.4);  g.lineTo(u * 0.34 + swA * 0.5, u * 0.84 + lfA);
      g.stroke();
      g.fillStyle = 'rgb(66,59,56)';                                     // and its feet
      [[-u * 0.32 + swB * 0.5, u * 0.9 + lfB], [u * 0.34 + swA * 0.5, u * 0.88 + lfA]]
        .forEach(f => {
          g.beginPath(); g.ellipse(f[0], f[1], u * 0.26, u * 0.14, 0, 0, TAU);
          g.fill(); outline(u * 0.08);
          g.fillStyle = 'rgba(184,176,166,.5)';                          // toe claws
          for (let k = -1; k <= 1; k++) {
            g.beginPath();
            g.ellipse(f[0] + k * u * 0.13, f[1] + u * 0.08, u * 0.04, u * 0.05, 0, 0, TAU);
            g.fill();
          }
          g.fillStyle = 'rgb(66,59,56)';
        });

      // Arms first so the shoulder covers the joint at any swing. They are a
      // full tone lighter than the body -- matched to it they disappeared and
      // the fists read as a second pair of feet.
      [[-1, arB], [1, arA]].forEach(([sx, ar]) => {
        const ex = sx * u * 0.78 + ar * 0.6, ey = -u * 0.02;             // elbow
        const hx = sx * u * 0.72 + ar * 1.1, hy = u * 0.44;              // fist
        g.strokeStyle = 'rgb(84,76,72)'; g.lineWidth = u * 0.24;
        g.beginPath(); g.moveTo(sx * u * 0.48, -u * 0.3); g.lineTo(ex, ey); g.stroke();
        g.strokeStyle = 'rgb(70,63,60)'; g.lineWidth = u * 0.2;
        g.beginPath(); g.moveTo(ex, ey); g.lineTo(hx, hy); g.stroke();
        g.fillStyle = 'rgb(58,52,50)';
        g.beginPath(); g.arc(hx, hy, u * 0.18, 0, TAU); g.fill(); outline(u * 0.08);
        g.strokeStyle = 'rgba(186,178,168,.5)'; g.lineWidth = u * 0.045;
        g.beginPath();
        for (let k = -1; k <= 1; k++) {
          g.moveTo(hx + k * u * 0.08, hy + u * 0.09);
          g.lineTo(hx + k * u * 0.11, hy + u * 0.2 - Math.abs(k) * u * 0.03);
        }
        g.stroke();
      });

      // The body: wide at the shoulder, tucked at the waist, and it stops well
      // below the head so the two shapes never merge into one blob.
      const bg = g.createLinearGradient(0, -u * 0.6, 0, u * 0.46);
      bg.addColorStop(0, 'rgb(92,85,82)');
      bg.addColorStop(0.55, 'rgb(54,49,47)');
      bg.addColorStop(1, 'rgb(24,21,20)');
      g.fillStyle = bg;
      g.beginPath();
      g.moveTo(-u * 0.5, u * 0.46);
      g.bezierCurveTo(-u * 0.74, u * 0.1, -u * 0.78, -u * 0.3, -u * 0.56, -u * 0.5);
      g.bezierCurveTo(-u * 0.2, -u * 0.66, u * 0.2, -u * 0.66, u * 0.56, -u * 0.5);
      g.bezierCurveTo(u * 0.78, -u * 0.3, u * 0.74, u * 0.1, u * 0.5, u * 0.46);
      g.closePath(); g.fill(); outline(u * 0.15);

      // Iron bolted low across the chest, out of the head's way.
      [-1, 1].forEach(sx => {
        const pg = g.createLinearGradient(0, -u * 0.54, 0, -u * 0.02);
        pg.addColorStop(0, 'rgb(80,74,72)');
        pg.addColorStop(1, 'rgb(20,18,17)');
        g.fillStyle = pg;
        g.beginPath();
        g.moveTo(sx * u * 0.14, -u * 0.44);
        g.lineTo(sx * u * 0.66, -u * 0.4);
        g.lineTo(sx * u * 0.6, -u * 0.02);
        g.lineTo(sx * u * 0.16, -u * 0.08);
        g.closePath(); g.fill(); outline(u * 0.09);
        g.fillStyle = 'rgba(160,152,146,.5)';
        for (let k = 0; k < 3; k++) {
          g.beginPath();
          g.arc(sx * (u * 0.26 + k * u * 0.16), -u * 0.36 + k * u * 0.12, u * 0.035, 0, TAU);
          g.fill();
        }
      });

      // Two short cracks under the plates, low enough that the mouth stays the
      // brightest thing on it.
      const crack = () => {
        g.beginPath();
        g.moveTo(-u * 0.3, u * 0.06); g.lineTo(-u * 0.12, u * 0.3);
        g.moveTo(u * 0.26, u * 0.02); g.lineTo(u * 0.1, u * 0.26);
        g.stroke();
      };
      g.strokeStyle = 'rgba(6,4,3,.9)'; g.lineWidth = u * 0.11; crack();
      g.strokeStyle = color; g.lineWidth = u * 0.045;
      g.shadowColor = color; g.shadowBlur = u * 0.26; crack();
      g.shadowBlur = 0;

      // The head: big, low-browed, and set forward of the shoulders. Its mouth
      // is open and lit from inside -- that glow is the whole silhouette.
      const hg3 = g.createLinearGradient(0, -u * 1.02, 0, -u * 0.4);
      hg3.addColorStop(0, 'rgb(104,96,92)');
      hg3.addColorStop(1, 'rgb(40,36,34)');
      g.fillStyle = hg3;
      g.beginPath();
      g.moveTo(-u * 0.42, -u * 0.52);
      g.quadraticCurveTo(-u * 0.5, -u * 1.0, 0, -u * 1.04);
      g.quadraticCurveTo(u * 0.5, -u * 1.0, u * 0.42, -u * 0.52);
      g.quadraticCurveTo(0, -u * 0.34, -u * 0.42, -u * 0.52);
      g.closePath(); g.fill(); outline(u * 0.11);

      g.fillStyle = 'rgba(8,5,4,.95)';                                   // the open maw
      g.beginPath();
      g.moveTo(-u * 0.3, -u * 0.62);
      g.quadraticCurveTo(0, -u * 0.72, u * 0.3, -u * 0.62);
      g.quadraticCurveTo(u * 0.24, -u * 0.34, 0, -u * 0.32);
      g.quadraticCurveTo(-u * 0.24, -u * 0.34, -u * 0.3, -u * 0.62);
      g.closePath(); g.fill();
      g.save(); g.clip();
      const mg = g.createRadialGradient(0, -u * 0.44, 0, 0, -u * 0.44, u * 0.34);
      mg.addColorStop(0, color);
      mg.addColorStop(0.5, 'rgba(224,64,44,.55)');
      mg.addColorStop(1, 'rgba(120,20,10,0)');
      g.fillStyle = mg;
      g.fillRect(-u * 0.34, -u * 0.74, u * 0.68, u * 0.46);
      g.restore();
      g.fillStyle = 'rgba(222,214,198,.92)';                             // teeth in it
      for (let k = -2; k <= 2; k++) {
        const tx = k * u * 0.11;
        g.beginPath();
        g.moveTo(tx - u * 0.045, -u * 0.63);
        g.lineTo(tx + u * 0.045, -u * 0.63);
        g.lineTo(tx, -u * 0.47 + Math.abs(k) * u * 0.03);
        g.closePath(); g.fill();
        g.beginPath();
        g.moveTo(tx - u * 0.04, -u * 0.34 + Math.abs(k) * u * 0.02);
        g.lineTo(tx + u * 0.04, -u * 0.34 + Math.abs(k) * u * 0.02);
        g.lineTo(tx, -u * 0.48);
        g.closePath(); g.fill();
      }
      g.fillStyle = 'rgba(228,220,204,.95)';                             // outer tusks
      [-1, 1].forEach(sx => {
        g.beginPath();
        g.moveTo(sx * u * 0.34, -u * 0.6);
        g.quadraticCurveTo(sx * u * 0.42, -u * 0.42, sx * u * 0.26, -u * 0.26);
        g.quadraticCurveTo(sx * u * 0.3, -u * 0.46, sx * u * 0.24, -u * 0.58);
        g.closePath(); g.fill(); outline(u * 0.05);
      });

      g.fillStyle = 'rgba(6,4,3,.85)';                                   // a heavy brow
      g.beginPath();
      g.moveTo(-u * 0.4, -u * 0.86);
      g.quadraticCurveTo(0, -u * 0.96, u * 0.4, -u * 0.86);
      g.quadraticCurveTo(0, -u * 0.74, -u * 0.4, -u * 0.86);
      g.closePath(); g.fill();
      g.fillStyle = color;                                               // eyes under it
      g.shadowColor = color; g.shadowBlur = u * 0.4;
      [-1, 1].forEach(sx => {
        g.beginPath();
        g.moveTo(sx * u * 0.08, -u * 0.82);
        g.lineTo(sx * u * 0.3, -u * 0.78);
        g.lineTo(sx * u * 0.27, -u * 0.7);
        g.lineTo(sx * u * 0.09, -u * 0.73);
        g.closePath(); g.fill();
      });
      g.shadowBlur = 0;

    } else if (kind === 'flayer') {
      // Lean and angular, leaning into where it is going even when it is
      // standing still. The cleaver is strapped along the forearm, so the arm
      // and the blade are one shape.
      // Digitigrade: the thigh drops back, the shin swings forward off it, and
      // the weight is on the toes. Drawn as three joints rather than one line
      // because a single stroke at this swing reads as doing the splits.
      [[-1, swB * 0.62, lfB], [1, swA * 0.62, lfA]].forEach(([sx, sw2, lf]) => {
        const kx = sx * u * 0.26 - sw2 * 0.5, ky = u * 0.7 + lf * 0.4;   // knee
        const fx2 = sx * u * 0.18 + sw2, fy2 = u * 1.02 + lf;            // foot
        g.strokeStyle = 'rgb(74,52,86)'; g.lineWidth = u * 0.17;
        g.beginPath(); g.moveTo(sx * u * 0.17, u * 0.34); g.lineTo(kx, ky); g.stroke();
        g.strokeStyle = 'rgb(62,42,74)'; g.lineWidth = u * 0.12;
        g.beginPath(); g.moveTo(kx, ky); g.lineTo(fx2, fy2); g.stroke();
        g.fillStyle = 'rgb(40,28,48)';                                   // splayed toes
        g.beginPath();
        g.moveTo(fx2 - u * 0.13, fy2 - u * 0.04);
        g.lineTo(fx2 + u * 0.17, fy2 + u * 0.02);
        g.lineTo(fx2 + u * 0.1, fy2 + u * 0.1);
        g.lineTo(fx2 - u * 0.14, fy2 + u * 0.07);
        g.closePath(); g.fill(); outline(u * 0.05);
      });

      const tb = g.createLinearGradient(0, -u * 0.56, 0, u * 0.44);     // sinew
      tb.addColorStop(0, 'rgb(126,86,142)');
      tb.addColorStop(1, 'rgb(52,34,62)');
      g.fillStyle = tb;
      g.beginPath();
      g.moveTo(-u * 0.4, u * 0.38);
      g.quadraticCurveTo(-u * 0.52, -u * 0.2, -u * 0.2, -u * 0.5);
      g.quadraticCurveTo(u * 0.36, -u * 0.56, u * 0.42, u * 0.34);
      g.closePath(); g.fill(); outline(u * 0.12);
      g.strokeStyle = 'rgba(20,12,24,.55)'; g.lineWidth = u * 0.05;     // ribs showing
      for (let i = 0; i < 3; i++) {
        g.beginPath();
        g.ellipse(u * 0.02, -u * 0.24 + i * u * 0.16, u * 0.26 - i * u * 0.02,
                  u * 0.07, 0, 0.3, Math.PI - 0.3);
        g.stroke();
      }
      g.fillStyle = 'rgba(36,26,20,.9)';                                 // leather rags
      g.beginPath();
      g.moveTo(-u * 0.4, u * 0.24); g.lineTo(u * 0.42, u * 0.18);
      g.lineTo(u * 0.3, u * 0.6); g.lineTo(u * 0.04, u * 0.42);
      g.lineTo(-u * 0.28, u * 0.58);
      g.closePath(); g.fill();

      // Both arms break at the elbow and end in a hand. The swing is damped to
      // just over half: at full amplitude a straight tube swept out past the
      // horns and stopped reading as an arm at all.
      [[-1, arB * 0.55], [1, arA * 0.55]].forEach(([sx, ar]) => {
        const ex = sx * u * 0.52 + ar, ey = u * 0.02;                    // elbow
        const wx = sx * u * 0.5 + ar * 1.5, wy = u * 0.44;               // wrist
        g.strokeStyle = 'rgb(112,78,128)'; g.lineWidth = u * 0.14;
        g.beginPath(); g.moveTo(sx * u * 0.37, -u * 0.31); g.lineTo(ex, ey); g.stroke();
        g.strokeStyle = 'rgb(96,66,112)'; g.lineWidth = u * 0.11;
        g.beginPath(); g.moveTo(ex, ey); g.lineTo(wx, wy); g.stroke();
        g.fillStyle = 'rgb(84,58,98)';
        g.beginPath(); g.arc(wx, wy, u * 0.1, 0, TAU); g.fill();
        if (sx < 0) {                                                    // bare hand
          g.strokeStyle = 'rgba(196,186,196,.6)'; g.lineWidth = u * 0.035;
          g.beginPath();
          for (let k = -1; k <= 1; k++) {
            g.moveTo(wx, wy + u * 0.06);
            g.lineTo(wx + k * u * 0.08, wy + u * 0.24 - Math.abs(k) * u * 0.05);
          }
          g.stroke();
        } else {
          // The cleaver is strapped along the forearm, so the arm and the
          // blade are one shape: it runs back past the elbow and forward to a
          // point well clear of the fist.
          const ang = Math.atan2(wy - ey, wx - ex);
          g.save(); g.translate(wx, wy); g.rotate(ang);
          const bl = g.createLinearGradient(0, -u * 0.12, 0, u * 0.1);
          bl.addColorStop(0, 'rgb(186,182,172)');
          bl.addColorStop(1, 'rgb(96,92,86)');
          g.fillStyle = bl;
          g.beginPath();
          g.moveTo(-u * 0.34, -u * 0.06);
          g.lineTo(u * 0.24, -u * 0.14);
          g.lineTo(u * 0.62, u * 0.02);                                  // the point
          g.lineTo(u * 0.2, u * 0.12);
          g.lineTo(-u * 0.34, u * 0.08);
          g.closePath(); g.fill(); outline(u * 0.06);
          g.strokeStyle = 'rgba(168,32,34,.85)'; g.lineWidth = u * 0.045; // what is on it
          g.beginPath();
          g.moveTo(u * 0.5, u * 0.03); g.lineTo(u * 0.06, u * 0.09);
          g.stroke();
          g.restore();
        }
      });

      // The head: swept horns over the skull, and the eyes are the read.
      const fh = g.createLinearGradient(0, -u * 0.9, 0, -u * 0.42);
      fh.addColorStop(0, 'rgb(140,98,156)');
      fh.addColorStop(1, 'rgb(54,36,64)');
      g.fillStyle = fh;
      g.beginPath(); g.ellipse(0, -u * 0.62, u * 0.28, u * 0.26, 0, 0, TAU); g.fill();
      outline(u * 0.09);
      g.strokeStyle = 'rgb(206,196,176)'; g.lineWidth = u * 0.09;       // horns
      g.lineCap = 'round';
      [-1, 1].forEach(sx => {
        g.beginPath();
        g.moveTo(sx * u * 0.2, -u * 0.76);
        g.quadraticCurveTo(sx * u * 0.56, -u * 0.98, sx * u * 0.44, -u * 1.24);
        g.stroke();
      });
      g.fillStyle = 'rgba(8,6,10,.95)';                                  // jaw
      g.beginPath();
      g.moveTo(-u * 0.14, -u * 0.5); g.lineTo(u * 0.16, -u * 0.52);
      g.lineTo(u * 0.11, -u * 0.34); g.lineTo(-u * 0.1, -u * 0.34);
      g.closePath(); g.fill();
      g.strokeStyle = 'rgba(206,198,150,.85)'; g.lineWidth = u * 0.03;
      g.beginPath();
      for (let k = 0; k < 4; k++) {
        const tx = -u * 0.1 + k * u * 0.07;
        g.moveTo(tx, -u * 0.49); g.lineTo(tx, -u * 0.42);
      }
      g.stroke();
      g.fillStyle = color;                                               // amber eyes
      g.shadowColor = color; g.shadowBlur = u * 0.42;
      [-1, 1].forEach(sx => {
        g.beginPath();
        g.moveTo(sx * u * 0.04, -u * 0.7);
        g.lineTo(sx * u * 0.22, -u * 0.66);
        g.lineTo(sx * u * 0.2, -u * 0.58);
        g.lineTo(sx * u * 0.05, -u * 0.61);
        g.closePath(); g.fill();
      });
      g.shadowBlur = 0;

    } else if (kind === 'shaman') {
      // Hunched over the staff rather than holding it. The caged heart is the
      // whole silhouette -- it is what you pick out across a room and what
      // tells you which body to reach first.
      const rb2 = g.createLinearGradient(0, -u * 0.6, 0, u * 1.05);     // cowl and robe
      rb2.addColorStop(0, 'rgb(74,62,52)');
      rb2.addColorStop(0.6, 'rgb(40,32,26)');
      rb2.addColorStop(1, 'rgb(18,14,11)');
      g.fillStyle = rb2;
      g.beginPath();
      // The hem swings at just over half amplitude. At full swing the two
      // corners crossed over each other and the robe collapsed to a point.
      g.moveTo(-u * 0.36, -u * 0.44);
      g.quadraticCurveTo(-u * 0.62, u * 0.3, -u * 0.48 + swB * 0.55, u * 1.02 + lfB * 0.6);
      g.lineTo(u * 0.46 + swA * 0.55, u * 1.0 + lfA * 0.6);
      g.quadraticCurveTo(u * 0.6, u * 0.3, u * 0.34, -u * 0.44);
      g.closePath(); g.fill(); outline(u * 0.12);

      // Heat coming through the cracks in it.
      g.strokeStyle = 'rgba(255,122,44,.4)'; g.lineWidth = u * 0.04;
      g.beginPath();
      g.moveTo(-u * 0.24, u * 0.1); g.lineTo(-u * 0.1, u * 0.34);
      g.moveTo(u * 0.2, u * 0.06); g.lineTo(u * 0.08, u * 0.3);
      g.stroke();

      // Small skulls hung round the cowl.
      [[-0.3, 0.04], [0.34, 0.1]].forEach(o => {
        const sk = [u * o[0], u * o[1]];
        g.strokeStyle = 'rgba(30,24,18,.8)'; g.lineWidth = u * 0.03;     // the cord
        g.beginPath(); g.moveTo(sk[0], sk[1] - u * 0.3); g.lineTo(sk[0], sk[1]); g.stroke();
        g.fillStyle = 'rgba(212,204,184,.9)';
        g.beginPath(); g.ellipse(sk[0], sk[1], u * 0.11, u * 0.12, 0, 0, TAU); g.fill();
        outline(u * 0.045);
        g.fillStyle = 'rgba(10,8,6,.92)';
        g.beginPath(); g.ellipse(sk[0] - u * 0.045, sk[1] - u * 0.01, u * 0.032, u * 0.04, 0, 0, TAU); g.fill();
        g.beginPath(); g.ellipse(sk[0] + u * 0.045, sk[1] - u * 0.01, u * 0.032, u * 0.04, 0, 0, TAU); g.fill();
        g.fillRect(sk[0] - u * 0.03, sk[1] + u * 0.06, u * 0.06, u * 0.04);
      });

      // The staff, and the heart caged at the top of it. It is held rather
      // than carried alongside: the grip is a fixed point on the robe, the
      // shaft only leans with the gait, and a sleeve runs out to meet it. Left
      // to drift on the arm swing it detached from the body entirely.
      const gx = -u * 0.42, gy = u * 0.08, lean2 = arB * 0.16;
      g.strokeStyle = 'rgb(56,46,38)'; g.lineWidth = u * 0.15;           // the sleeve
      g.beginPath();
      g.moveTo(-u * 0.16, -u * 0.32);
      g.quadraticCurveTo(-u * 0.4, -u * 0.16, gx, gy);
      g.stroke();
      g.strokeStyle = '#4a3a28'; g.lineWidth = u * 0.09;                 // the shaft
      g.beginPath();
      g.moveTo(gx + lean2 * -0.6, u * 0.86);
      g.lineTo(gx + lean2, -u * 0.86);
      g.stroke();
      g.fillStyle = 'rgba(30,24,18,.9)';                                 // hand on the grip
      g.beginPath(); g.ellipse(gx, gy, u * 0.09, u * 0.08, 0, 0, TAU); g.fill();
      const hx = gx + lean2, hy = -u * 0.98;
      g.fillStyle = color;
      g.shadowColor = color; g.shadowBlur = u * 0.8;
      g.beginPath(); g.ellipse(hx, hy, u * 0.15, u * 0.17, 0, 0, TAU); g.fill();
      g.shadowBlur = 0;
      g.fillStyle = 'rgba(255,238,200,.85)';
      g.beginPath(); g.ellipse(hx, hy - u * 0.02, u * 0.06, u * 0.07, 0, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(58,48,38,.95)'; g.lineWidth = u * 0.035;    // its cage
      g.beginPath();
      for (let k = -1; k <= 1; k++) {
        g.moveTo(hx + k * u * 0.1, hy - u * 0.19);
        g.lineTo(hx + k * u * 0.13, hy + u * 0.18);
      }
      g.moveTo(hx - u * 0.16, hy); g.lineTo(hx + u * 0.16, hy);
      g.stroke();

      // A face inside the cowl, lit from below by what it is carrying.
      g.fillStyle = 'rgba(6,5,4,.96)';
      g.beginPath(); g.ellipse(u * 0.02, -u * 0.6, u * 0.24, u * 0.24, 0, 0, TAU); g.fill();
      const hd2 = g.createLinearGradient(0, -u * 1.0, 0, -u * 0.42);
      hd2.addColorStop(0, 'rgb(70,58,48)');
      hd2.addColorStop(1, 'rgb(24,19,15)');
      g.fillStyle = hd2;
      g.beginPath();
      g.moveTo(-u * 0.34, -u * 0.42);
      g.quadraticCurveTo(-u * 0.4, -u * 1.0, u * 0.02, -u * 1.02);
      g.quadraticCurveTo(u * 0.42, -u * 1.0, u * 0.34, -u * 0.42);
      g.quadraticCurveTo(u * 0.02, -u * 0.5, -u * 0.34, -u * 0.42);
      g.closePath(); g.fill(); outline(u * 0.1);
      g.fillStyle = color;
      g.shadowColor = color; g.shadowBlur = u * 0.3;
      g.beginPath(); g.ellipse(-u * 0.08, -u * 0.62, u * 0.05, u * 0.04, 0, 0, TAU); g.fill();
      g.beginPath(); g.ellipse(u * 0.11, -u * 0.62, u * 0.05, u * 0.04, 0, 0, TAU); g.fill();
      g.shadowBlur = 0;

    } else {
      // Planted, over-armoured, bound together by seams that are burning
      // through from the inside.
      g.fillStyle = 'rgb(46,42,36)';                                     // greaves
      [[-u * 0.44 + swB, lfB], [u * 0.08 + swA, lfA]].forEach(o => {
        g.beginPath();
        g.roundRect ? g.roundRect(o[0], u * 0.42 + o[1], u * 0.36, u * 0.66, u * 0.1)
                    : g.rect(o[0], u * 0.42 + o[1], u * 0.36, u * 0.66);
        g.fill(); outline(u * 0.08);
      });

      const cg = g.createLinearGradient(0, -u * 0.6, 0, u * 0.6);        // cuirass
      cg.addColorStop(0, 'rgb(104,96,86)');
      cg.addColorStop(0.5, 'rgb(56,50,44)');
      cg.addColorStop(1, 'rgb(24,21,18)');
      g.fillStyle = cg;
      g.beginPath();
      g.moveTo(-u * 0.58, -u * 0.4);
      g.quadraticCurveTo(-u * 0.7, u * 0.2, -u * 0.44, u * 0.5);
      g.lineTo(u * 0.44, u * 0.5);
      g.quadraticCurveTo(u * 0.7, u * 0.2, u * 0.58, -u * 0.4);
      g.closePath(); g.fill(); outline(u * 0.12);

      // The seams are a crack running through the plate, not a decoration on
      // it: black fracture first, fire in the bottom of it.
      g.strokeStyle = 'rgba(6,4,3,.9)'; g.lineWidth = u * 0.15;
      g.beginPath();
      g.moveTo(-u * 0.34, -u * 0.34); g.lineTo(u * 0.06, u * 0.02);
      g.lineTo(-u * 0.18, u * 0.18); g.lineTo(u * 0.22, u * 0.46);
      g.moveTo(u * 0.36, -u * 0.24); g.lineTo(u * 0.16, u * 0.08);
      g.stroke();
      g.strokeStyle = color; g.lineWidth = u * 0.07;
      g.shadowColor = color; g.shadowBlur = u * 0.26;
      g.beginPath();
      g.moveTo(-u * 0.3, -u * 0.3); g.lineTo(u * 0.06, u * 0.02);
      g.lineTo(-u * 0.16, u * 0.16); g.lineTo(u * 0.2, u * 0.44);
      g.moveTo(u * 0.34, -u * 0.22); g.lineTo(u * 0.18, u * 0.06);
      g.stroke();
      g.shadowBlur = 0;

      const pg = g.createLinearGradient(0, -u * 0.72, 0, -u * 0.1);      // pauldrons
      pg.addColorStop(0, 'rgb(128,118,104)');
      pg.addColorStop(1, 'rgb(40,36,31)');
      [[-1, arB], [1, arA]].forEach(o => {
        const sx = o[0];
        g.fillStyle = pg;
        g.beginPath();
        g.ellipse(sx * u * 0.62, -u * 0.3, u * 0.32, u * 0.27, sx * 0.34, 0, TAU);
        g.fill(); outline(u * 0.1);
        // spikes, and a chain hung off each shoulder that swings with the arm
        g.strokeStyle = 'rgba(28,24,20,.95)'; g.lineWidth = u * 0.07;
        g.beginPath();
        g.moveTo(sx * u * 0.72, -u * 0.44); g.lineTo(sx * u * 0.94, -u * 0.62);
        g.stroke();
        g.strokeStyle = 'rgba(74,66,56,.9)'; g.lineWidth = u * 0.055;
        g.beginPath();
        g.moveTo(sx * u * 0.66, -u * 0.16);
        g.quadraticCurveTo(sx * u * 0.82 + o[1] * 0.6, u * 0.18, sx * u * 0.6 + o[1], u * 0.5);
        g.stroke();
      });

      // A helm with horns, and a slit with a furnace behind it.
      const hg2 = g.createLinearGradient(0, -u * 0.98, 0, -u * 0.4);
      hg2.addColorStop(0, 'rgb(112,104,92)');
      hg2.addColorStop(1, 'rgb(30,27,23)');
      g.fillStyle = hg2;
      g.beginPath();
      g.moveTo(-u * 0.3, -u * 0.44);
      g.lineTo(-u * 0.28, -u * 0.9); g.lineTo(0, -u * 0.98); g.lineTo(u * 0.28, -u * 0.9);
      g.lineTo(u * 0.3, -u * 0.44);
      g.closePath(); g.fill(); outline(u * 0.1);
      g.strokeStyle = 'rgb(38,34,29)'; g.lineWidth = u * 0.1;
      g.lineCap = 'round';
      [-1, 1].forEach(sx => {
        g.beginPath();
        g.moveTo(sx * u * 0.26, -u * 0.86);
        g.quadraticCurveTo(sx * u * 0.6, -u * 1.0, sx * u * 0.5, -u * 1.3);
        g.stroke();
      });
      g.fillStyle = 'rgba(4,3,2,.97)';
      g.fillRect(-u * 0.23, -u * 0.76, u * 0.46, u * 0.15);
      g.fillStyle = color;
      g.shadowColor = color; g.shadowBlur = u * 0.5;
      g.fillRect(-u * 0.18, -u * 0.735, u * 0.13, u * 0.1);
      g.fillRect(u * 0.05, -u * 0.735, u * 0.13, u * 0.1);
      g.shadowBlur = 0;

      // A Lieutenant wears his master's gold over the same plate, so the two
      // read as one household without needing a second silhouette.
      if (kind === 'lieutenant') {
        g.strokeStyle = 'rgba(232,192,96,.92)';
        g.lineWidth = u * 0.07;
        g.beginPath();                                    // circlet
        g.moveTo(-u * 0.28, -u * 0.84); g.lineTo(u * 0.28, -u * 0.84);
        g.stroke();
        g.lineWidth = u * 0.045;                          // pauldron trim
        [-1, 1].forEach(sx => {
          g.beginPath();
          g.ellipse(sx * u * 0.62, -u * 0.3, u * 0.3, u * 0.25, sx * 0.34, 0, TAU);
          g.stroke();
        });
      }
    }

    // The void-brand: asymmetrical by doctrine, and the tell that these were
    // people who gave up their will rather than monsters. It rides the body,
    // so it sits where the body is not moving much -- the shoulder on the
    // thrall, whose head now hangs, and the helm on the armoured ones.
    const BRAND = { eclipse: [-0.09, -0.9], thrall: [-0.3, -0.3],
                    husk: [-0.38, -0.3], cantor: [-0.2, -0.88],
                    gorger: [-0.5, -0.36], flayer: [-0.3, -0.06],
                    shaman: [0.24, -0.3] };
    const bm = BRAND[kind] || [0.1, -0.86];
    const bx = u * bm[0], by = u * bm[1];
    g.shadowColor = PAL.brand; g.shadowBlur = u * 0.3;
    g.strokeStyle = PAL.brand; g.lineWidth = u * 0.05;
    g.beginPath();
    g.moveTo(bx - u * 0.08, by - u * 0.04);
    g.lineTo(bx + u * 0.02, by + u * 0.03);
    g.lineTo(bx - u * 0.02, by + u * 0.07);
    g.lineTo(bx + u * 0.09, by + u * 0.01);
    g.stroke();
    g.shadowBlur = 0;

    g.restore();

    g.globalCompositeOperation = 'destination-over';
    g.fillStyle = 'rgba(0,0,0,.4)';
    g.beginPath(); g.ellipse(0, u * 1.06, u * 0.66, u * 0.22, 0, 0, TAU); g.fill();
    g.globalCompositeOperation = 'source-over';
  }));
}

// Mal-Ghorath's avatar on earth. The compendium gives him two properties that
// are already mechanics: he offers false salvation, and he is identifiable by
// his shattered void-gem right eye. So he manifests on the ley-gate and holds
// it shut, he splits into mirages, and the gem is the tell that separates him
// from them. Isaac, immune to illusion, simply sees through them.
const DECEIVER_DRAW = 32;

// He blinks rather than walks -- there is no gait to give him -- so he keeps
// the one pose the others used to have.
function forgeDeceiver(kind) {
  const u = DECEIVER_DRAW;      // drawn larger than he collides, so he
                                // still looms without wedging in corridors
  const mirage = kind === 'mirage';
  const lit = (a, b, c) => 'rgb(' + a + ',' + b + ',' + c + ')';
  return lightPass(forge(u * 3.0, g => {
    g.lineJoin = 'round'; g.lineCap = 'round';

    // Robe, hanging to nothing
    const rg = g.createLinearGradient(0, -u * 0.9, 0, u * 1.1);
    rg.addColorStop(0, lit(118, 92, 40));
    rg.addColorStop(0.55, lit(58, 44, 20));
    rg.addColorStop(1, 'rgba(20,15,7,0)');
    g.fillStyle = rg;
    g.beginPath();
    g.moveTo(-u * 0.52, -u * 0.4);
    g.quadraticCurveTo(-u * 0.86, u * 0.3, -u * 0.62, u * 1.06);
    g.lineTo(-u * 0.2, u * 0.8); g.lineTo(0, u * 1.12);
    g.lineTo(u * 0.2, u * 0.8);  g.lineTo(u * 0.62, u * 1.06);
    g.quadraticCurveTo(u * 0.86, u * 0.3, u * 0.52, -u * 0.4);
    g.closePath(); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.7)'; g.lineWidth = u * 0.07; g.stroke();

    // Gilding: the false promise, worn on the outside
    g.strokeStyle = lit(214, 170, 74); g.lineWidth = u * 0.05;
    g.beginPath();
    g.moveTo(-u * 0.4, -u * 0.2); g.lineTo(-u * 0.3, u * 0.7);
    g.moveTo(u * 0.4, -u * 0.2);  g.lineTo(u * 0.3, u * 0.7);
    g.moveTo(-u * 0.36, u * 0.12); g.lineTo(u * 0.36, u * 0.12);
    g.stroke();

    // Open arms: offering
    g.strokeStyle = lit(96, 74, 32); g.lineWidth = u * 0.13;
    g.beginPath();
    g.moveTo(-u * 0.46, -u * 0.24); g.quadraticCurveTo(-u * 0.92, u * 0.06, -u * 0.86, u * 0.42);
    g.moveTo(u * 0.46, -u * 0.24);  g.quadraticCurveTo(u * 0.92, u * 0.06, u * 0.86, u * 0.42);
    g.stroke();

    // Crowned head
    const hg = g.createLinearGradient(0, -u * 0.98, 0, -u * 0.34);
    hg.addColorStop(0, lit(150, 120, 56));
    hg.addColorStop(1, lit(44, 34, 16));
    g.fillStyle = hg;
    g.beginPath(); g.ellipse(0, -u * 0.62, u * 0.3, u * 0.34, 0, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.8)'; g.lineWidth = u * 0.06; g.stroke();
    g.strokeStyle = lit(226, 186, 88); g.lineWidth = u * 0.05;
    for (let i = -2; i <= 2; i++) {
      g.beginPath();
      g.moveTo(i * u * 0.12, -u * 0.86);
      g.lineTo(i * u * 0.12, -u * 1.02 - Math.abs(i) * u * 0.03);
      g.stroke();
    }
    // Left eye: gilded, whole
    g.fillStyle = 'rgba(255,232,168,.95)';
    g.beginPath(); g.ellipse(-u * 0.11, -u * 0.64, u * 0.06, u * 0.05, 0, 0, TAU); g.fill();

    // Right eye: the shattered void-gem. The tell -- and mirages lack it.
    if (!mirage) {
      g.shadowColor = PAL.brand; g.shadowBlur = u * 0.5;
      g.fillStyle = '#1a0f2c';
      g.beginPath(); g.ellipse(u * 0.12, -u * 0.64, u * 0.09, u * 0.08, 0, 0, TAU); g.fill();
      g.strokeStyle = PAL.brand; g.lineWidth = u * 0.035;
      g.beginPath();
      g.moveTo(u * 0.05, -u * 0.7); g.lineTo(u * 0.15, -u * 0.62);
      g.moveTo(u * 0.19, -u * 0.7); g.lineTo(u * 0.08, -u * 0.58);
      g.stroke();
      g.shadowBlur = 0;
    } else {
      g.fillStyle = 'rgba(255,232,168,.95)';
      g.beginPath(); g.ellipse(u * 0.12, -u * 0.64, u * 0.06, u * 0.05, 0, 0, TAU); g.fill();
    }

    g.globalCompositeOperation = 'destination-over';
    g.fillStyle = 'rgba(0,0,0,.4)';
    g.beginPath(); g.ellipse(0, u * 1.0, u * 0.6, u * 0.2, 0, 0, TAU); g.fill();
    g.globalCompositeOperation = 'source-over';
  }));
}

// The Guided Vanguard. Both fight unhelmeted -- the compendium is explicit
// that they look the darkness in the eye -- so the face carries the identity
// and the weapon carries the order: Isaac's sun-gold blade and sun shield,
// Zayd's two-handed Sapphire Glaive. Drawn front-on and mirrored by heading,
// like the rest of the cast.
/* Sampled off the reference knight sheets and pulled down about a sixth for
   the delve. Their plate is a cool lavender-steel -- #a3a7c2 over #5e718e over
   #485262 -- where this hero's was a warm neutral grey, and that hue is most
   of what made the reference read as one order of armoured men rather than
   generic fantasy. The leather is theirs too: a dark warm brown-red that is
   the only warm note on the whole figure, which is why the belt carries it. */
const PLATE = {
  hi:      [196, 210, 220],
  up:      [150, 155, 182],
  mid:     [ 98, 108, 136],
  dk:      [ 54,  61,  79],
  deep:    [ 30,  34,  47],
  leather: [ 96,  53,  45]
};

// A coffer, seen from above and a little in front: the lid is the face you
// read, and an open one shows the empty box so a cleared room stays cleared
// at a glance rather than tempting you back to it.
function forgeChest(kind, open) {
  const K = CHEST_KINDS[kind];
  const u = 15;
  const warded = kind === 'warded';
  return forge(u * 3.4, g => {
    g.lineJoin = 'round'; g.lineCap = 'round';
    const outline = w => { g.strokeStyle = 'rgba(0,0,0,.82)'; g.lineWidth = w; g.stroke(); };

    // the box
    const bg = g.createLinearGradient(0, -u * 0.1, 0, u * 0.9);
    bg.addColorStop(0, warded ? 'rgb(64,72,96)' : 'rgb(84,60,36)');
    bg.addColorStop(1, warded ? 'rgb(24,28,42)' : 'rgb(34,24,14)');
    g.fillStyle = bg;
    g.beginPath();
    g.roundRect ? g.roundRect(-u * 0.86, -u * 0.1, u * 1.72, u * 0.92, u * 0.08)
                : g.rect(-u * 0.86, -u * 0.1, u * 1.72, u * 0.92);
    g.fill(); outline(u * 0.11);

    // staves down the front
    g.strokeStyle = warded ? 'rgba(150,170,214,.3)' : 'rgba(150,116,72,.3)';
    g.lineWidth = u * 0.05;
    g.beginPath();
    for (let i = -1; i <= 1; i++) { g.moveTo(i * u * 0.42, -u * 0.06); g.lineTo(i * u * 0.42, u * 0.78); }
    g.stroke();

    if (open) {
      // Lid thrown back and standing behind it, so the silhouette still says
      // "coffer" rather than "dark rectangle on the floor" -- an emptied one
      // has to be recognisable at a glance or a cleared room keeps drawing
      // you back to it.
      const lg = g.createLinearGradient(0, -u * 1.02, 0, -u * 0.24);
      lg.addColorStop(0, warded ? 'rgb(78,90,124)' : 'rgb(98,72,44)');
      lg.addColorStop(1, warded ? 'rgb(34,40,60)' : 'rgb(48,34,20)');
      g.fillStyle = lg;
      g.beginPath();
      g.moveTo(-u * 0.9, -u * 0.22);
      g.quadraticCurveTo(-u * 0.86, -u * 0.98, 0, -u * 1.0);
      g.quadraticCurveTo(u * 0.86, -u * 0.98, u * 0.9, -u * 0.22);
      g.closePath(); g.fill(); outline(u * 0.11);
      g.strokeStyle = warded ? 'rgba(52,62,90,.9)' : 'rgba(46,32,18,.9)';
      g.lineWidth = u * 0.1;
      g.beginPath();
      g.moveTo(-u * 0.42, -u * 0.92); g.lineTo(-u * 0.42, -u * 0.24);
      g.moveTo(u * 0.42, -u * 0.92);  g.lineTo(u * 0.42, -u * 0.24);
      g.stroke();
      // the empty inside, with a lip catching the light so it reads as depth
      g.fillStyle = 'rgba(10,8,6,.95)';
      g.beginPath();
      g.roundRect ? g.roundRect(-u * 0.74, -u * 0.18, u * 1.48, u * 0.44, u * 0.06)
                  : g.rect(-u * 0.74, -u * 0.18, u * 1.48, u * 0.44);
      g.fill();
      g.strokeStyle = warded ? 'rgba(140,164,214,.4)' : 'rgba(168,132,84,.4)';
      g.lineWidth = u * 0.05;
      g.beginPath();
      g.moveTo(-u * 0.74, -u * 0.16); g.lineTo(u * 0.74, -u * 0.16);
      g.stroke();
    } else {
      // the lid, banded, with a lock
      const lg = g.createLinearGradient(0, -u * 0.62, 0, -u * 0.02);
      lg.addColorStop(0, warded ? 'rgb(96,112,152)' : 'rgb(122,88,52)');
      lg.addColorStop(1, warded ? 'rgb(40,48,70)' : 'rgb(56,40,24)');
      g.fillStyle = lg;
      g.beginPath();
      g.moveTo(-u * 0.9, -u * 0.08);
      g.quadraticCurveTo(-u * 0.86, -u * 0.62, 0, -u * 0.64);
      g.quadraticCurveTo(u * 0.86, -u * 0.62, u * 0.9, -u * 0.08);
      g.closePath(); g.fill(); outline(u * 0.11);
      g.strokeStyle = warded ? 'rgba(60,70,98,.9)' : 'rgba(52,38,22,.9)';
      g.lineWidth = u * 0.11;
      g.beginPath();
      g.moveTo(-u * 0.42, -u * 0.56); g.lineTo(-u * 0.42, -u * 0.06);
      g.moveTo(u * 0.42, -u * 0.56);  g.lineTo(u * 0.42, -u * 0.06);
      g.stroke();
      // lock plate, lit in the colour the thing is worth
      g.fillStyle = K.colour;
      g.shadowColor = K.colour; g.shadowBlur = u * 0.45;
      g.beginPath();
      g.roundRect ? g.roundRect(-u * 0.16, -u * 0.24, u * 0.32, u * 0.36, u * 0.05)
                  : g.rect(-u * 0.16, -u * 0.24, u * 0.32, u * 0.36);
      g.fill();
      g.shadowBlur = 0;
      g.fillStyle = 'rgba(8,6,4,.85)';
      g.beginPath(); g.arc(0, -u * 0.08, u * 0.06, 0, TAU); g.fill();
      if (warded) {
        // a ward cut into the lid: the tell that this one is worth the walk
        g.strokeStyle = 'rgba(180,206,255,.75)'; g.lineWidth = u * 0.05;
        g.beginPath();
        g.moveTo(-u * 0.62, -u * 0.34); g.lineTo(-u * 0.5, -u * 0.2);
        g.lineTo(-u * 0.6, -u * 0.12); g.lineTo(-u * 0.46, -u * 0.3);
        g.moveTo(u * 0.62, -u * 0.34); g.lineTo(u * 0.5, -u * 0.2);
        g.lineTo(u * 0.6, -u * 0.12); g.lineTo(u * 0.46, -u * 0.3);
        g.stroke();
      }
    }

    g.globalCompositeOperation = 'destination-over';
    g.fillStyle = 'rgba(0,0,0,.42)';
    g.beginPath(); g.ellipse(0, u * 0.86, u * 0.9, u * 0.24, 0, 0, TAU); g.fill();
    g.globalCompositeOperation = 'source-over';
  });
}

/* --- the weapon -----------------------------------------------------------
   Forged on its own, grip at the centre of the sprite, blade running along
   +x. Rotating it about its own centre therefore rotates it about the hand,
   which is what lets the hero swing rather than hold a still blade with a
   streak painted over it. One sprite per hero, one extra blit per frame, and
   the arc is continuous instead of stepped through baked poses.
   ------------------------------------------------------------------------ */
function forgeWeapon(id) {
  const H = HEROES[id];
  const u = BASE_PLAYER.r * 1.28;
  const magic = H.magic;
  // How far the edge is from the hand. The streak is struck at this radius --
  // guessed at from the body's radius instead, it floats off the blade and
  // reads as a ring hanging in the air beside him.
  const reach = (id === 'isaac' ? 1.52 : 1.66) * u;
  const c = forge(u * 3.6, g => {
    g.lineJoin = 'round'; g.lineCap = 'round';
    if (id === 'isaac') {
      // A hand-and-a-half sword: grip, cross, and a blade lit along its edge.
      g.strokeStyle = '#6a5432'; g.lineWidth = u * 0.15;             // grip
      g.beginPath(); g.moveTo(-u * 0.34, 0); g.lineTo(-u * 0.02, 0); g.stroke();
      g.fillStyle = '#8a6a3a';                                        // pommel
      g.beginPath(); g.arc(-u * 0.4, 0, u * 0.09, 0, TAU); g.fill();
      g.strokeStyle = 'rgb(96,88,74)'; g.lineWidth = u * 0.11;        // cross-guard
      g.beginPath(); g.moveTo(0, -u * 0.26); g.lineTo(0, u * 0.26); g.stroke();
      g.shadowColor = magic; g.shadowBlur = u * 0.55;                 // the blade
      g.fillStyle = magic;
      g.beginPath();
      g.moveTo(u * 0.06, -u * 0.11);
      g.lineTo(u * 1.42, -u * 0.035);
      g.lineTo(u * 1.6, 0);
      g.lineTo(u * 1.42, u * 0.035);
      g.lineTo(u * 0.06, u * 0.11);
      g.closePath(); g.fill();
      g.shadowBlur = 0;
      g.strokeStyle = 'rgba(255,250,232,.95)'; g.lineWidth = u * 0.045;
      g.beginPath(); g.moveTo(u * 0.12, 0); g.lineTo(u * 1.5, 0); g.stroke();
    } else {
      // A glaive: a long haft with the edge out at the end of it.
      g.strokeStyle = '#4a3c28'; g.lineWidth = u * 0.12;              // haft
      g.beginPath(); g.moveTo(-u * 0.62, 0); g.lineTo(u * 0.86, 0); g.stroke();
      g.strokeStyle = 'rgb(90,84,72)'; g.lineWidth = u * 0.15;        // ferrule
      g.beginPath(); g.moveTo(u * 0.78, 0); g.lineTo(u * 0.94, 0); g.stroke();
      g.strokeStyle = 'rgb(74,68,58)'; g.lineWidth = u * 0.13;        // butt-cap
      g.beginPath(); g.moveTo(-u * 0.72, 0); g.lineTo(u * -0.6, 0); g.stroke();
      g.shadowColor = magic; g.shadowBlur = u * 0.6;                  // the edge
      g.fillStyle = magic;
      g.beginPath();
      g.moveTo(u * 0.92, -u * 0.09);
      g.quadraticCurveTo(u * 1.42, -u * 0.34, u * 1.72, -u * 0.1);
      g.quadraticCurveTo(u * 1.36, u * 0.02, u * 0.94, u * 0.1);
      g.closePath(); g.fill();
      g.shadowBlur = 0;
      g.strokeStyle = 'rgba(232,248,255,.95)'; g.lineWidth = u * 0.045;
      g.beginPath();
      g.moveTo(u * 0.96, -u * 0.06);
      g.quadraticCurveTo(u * 1.4, -u * 0.26, u * 1.68, -u * 0.09);
      g.stroke();
    }
  });
  c.reach = reach;
  return c;
}

     // and how long it takes to come back to it

// The hero in one pose. `P` is a gait pose -- GAIT_REST for standing still.
function forgeHero(id, P) {
  const H = HEROES[id];
  const u = BASE_PLAYER.r * 1.28;
  const lit = (a, b, c) => 'rgb(' + a + ',' + b + ',' + c + ')';
  const magic = H.magic, trim = H.trim;
  const swA = u * P.swing, swB = -u * P.swing;
  const lfA = -u * P.lift, lfB = -u * P.liftB;
  const arA = u * P.arm;

  return lightPass(forge(u * 4.0, g => {
    g.lineJoin = 'round'; g.lineCap = 'round';
    g.save();
    g.translate(0, u * P.bob);
    g.translate(0, u * 1.2);
    g.rotate(P.roll + P.lean);
    g.translate(0, -u * 1.2);

    // Cloak
    const capeG = g.createLinearGradient(0, -u * 0.6, 0, u * 1.3);
    capeG.addColorStop(0, lit(H.cape[0], H.cape[1], H.cape[2]));
    capeG.addColorStop(1, lit(16, 13, 12));
    g.fillStyle = capeG;
    g.beginPath();
    g.moveTo(-u * 0.6, -u * 0.28);
    g.quadraticCurveTo(-u * 1.1 - arA * 0.5, u * 0.44, -u * 0.8 - arA, u * 1.02 - Math.abs(arA) * 0.3);
    g.lineTo(u * 0.8 - arA, u * 1.02 - Math.abs(arA) * 0.3);
    g.quadraticCurveTo(u * 1.1 - arA * 0.5, u * 0.5, u * 0.6, -u * 0.28);
    g.closePath(); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.82)'; g.lineWidth = 2; g.stroke();

    // Legs
    // Greave and boot in two tones with a lit edge. In one flat dark they
    // vanished into the cloak behind them and the stride went with them.
    [[u * -0.36 + swB, lfB], [u * 0.08 + swA, lfA]].forEach(o => {
      g.fillStyle = lit(PLATE.mid[0], PLATE.mid[1], PLATE.mid[2]);
      g.beginPath();
      g.roundRect ? g.roundRect(o[0], u * 0.64 + o[1], u * 0.28, u * 0.46, u * 0.08)
                  : g.rect(o[0], u * 0.64 + o[1], u * 0.28, u * 0.46);
      g.fill();
      g.strokeStyle = 'rgba(0,0,0,.82)'; g.lineWidth = 1.6; g.stroke();
      g.fillStyle = lit(PLATE.leather[0], PLATE.leather[1], PLATE.leather[2]);
      g.beginPath();
      g.roundRect ? g.roundRect(o[0] - u * 0.03, u * 1.02 + o[1], u * 0.34, u * 0.22, u * 0.07)
                  : g.rect(o[0] - u * 0.03, u * 1.02 + o[1], u * 0.34, u * 0.22);
      g.fill();
      g.strokeStyle = 'rgba(0,0,0,.82)'; g.lineWidth = 1.6; g.stroke();
      g.strokeStyle = lit(PLATE.hi[0], PLATE.hi[1], PLATE.hi[2]);
      g.lineWidth = 1.1;
      g.beginPath();
      g.moveTo(o[0] + u * 0.03, u * 0.68 + o[1]); g.lineTo(o[0] + u * 0.03, u * 1.0 + o[1]);
      g.stroke();
    });

    // Cuirass
    const tg = g.createLinearGradient(0, -u * 0.34, 0, u * 0.8);
    tg.addColorStop(0, lit(PLATE.up[0], PLATE.up[1], PLATE.up[2]));
    tg.addColorStop(0.5, lit(PLATE.mid[0], PLATE.mid[1], PLATE.mid[2]));
    tg.addColorStop(1, lit(PLATE.deep[0], PLATE.deep[1], PLATE.deep[2]));
    g.fillStyle = tg;
    g.beginPath();
    g.moveTo(-u * 0.5, -u * 0.24);
    g.quadraticCurveTo(-u * 0.62, u * 0.32, -u * 0.4, u * 0.7);
    g.lineTo(u * 0.4, u * 0.7);
    g.quadraticCurveTo(u * 0.62, u * 0.32, u * 0.5, -u * 0.24);
    g.closePath(); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.82)'; g.lineWidth = 2; g.stroke();
    // order's colour worn on the chest
    g.fillStyle = trim;
    g.beginPath();
    g.moveTo(-u * 0.15, -u * 0.22); g.lineTo(u * 0.15, -u * 0.22);
    g.lineTo(u * 0.11, u * 0.7); g.lineTo(-u * 0.11, u * 0.7);
    g.closePath(); g.fill();
    g.fillStyle = lit(PLATE.leather[0], PLATE.leather[1], PLATE.leather[2]);
    g.fillRect(-u * 0.44, u * 0.44, u * 0.88, u * 0.15);
    g.fillStyle = 'rgba(18,12,10,.55)';
    g.fillRect(-u * 0.44, u * 0.555, u * 0.88, u * 0.04);
    g.fillStyle = trim;                                   // the buckle
    g.fillRect(-u * 0.07, u * 0.43, u * 0.14, u * 0.17);

    if (id === 'isaac') {
      // Sun-emblazoned shield
      g.fillStyle = lit(52, 46, 38);
      g.beginPath(); g.ellipse(-u * 0.8, u * 0.3, u * 0.34, u * 0.46, -0.1, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(0,0,0,.82)'; g.lineWidth = 2; g.stroke();
      g.strokeStyle = magic; g.lineWidth = 1.4;
      g.beginPath(); g.ellipse(-u * 0.8, u * 0.3, u * 0.26, u * 0.37, -0.1, 0, TAU); g.stroke();
      g.fillStyle = magic;
      g.beginPath(); g.arc(-u * 0.8, u * 0.3, u * 0.1, 0, TAU); g.fill();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        g.strokeStyle = magic; g.lineWidth = 1.2;
        g.beginPath();
        g.moveTo(-u * 0.8 + Math.cos(a) * u * 0.14, u * 0.3 + Math.sin(a) * u * 0.19);
        g.lineTo(-u * 0.8 + Math.cos(a) * u * 0.21, u * 0.3 + Math.sin(a) * u * 0.29);
        g.stroke();
      }
      // The weapon is not in here. It is forged on its own and drawn over the
      // body so it can actually swing -- see forgeWeapon and drawWeapon. A
      // blade baked into the sprite can only ever be a streak painted over a
      // still arm.
    }
    // Pauldrons
    [-1, 1].forEach(sx => {
      const pg = g.createLinearGradient(0, -u * 0.5, 0, u * 0.06);
      pg.addColorStop(0, lit(PLATE.hi[0], PLATE.hi[1], PLATE.hi[2]));
      pg.addColorStop(1, lit(PLATE.dk[0], PLATE.dk[1], PLATE.dk[2]));
      g.fillStyle = pg;
      g.beginPath();
      g.ellipse(sx * u * 0.56, -u * 0.12, u * 0.27, u * 0.23, sx * 0.3, 0, TAU);
      g.fill();
      g.strokeStyle = 'rgba(0,0,0,.82)'; g.lineWidth = 1.8; g.stroke();
      g.strokeStyle = trim; g.lineWidth = 1;
      g.beginPath();
      g.ellipse(sx * u * 0.56, -u * 0.16, u * 0.19, u * 0.15, sx * 0.3, 0, TAU);
      g.stroke();
    });

    // A mail coif, not a great-helm. The reference knights fight with their
    // faces closed, and the silhouette that gives them is most of their
    // character -- but this order is the Clear-Sighted and the compendium
    // makes a point of the bare head, so the helm would be borrowing the look
    // at the cost of the fiction. The coif takes the shape and leaves the
    // face: a swept steel hood behind the head, its throat-guard at the neck.
    const cg = g.createLinearGradient(0, -u * 0.95, 0, -u * 0.2);
    cg.addColorStop(0, lit(PLATE.up[0], PLATE.up[1], PLATE.up[2]));
    cg.addColorStop(1, lit(PLATE.deep[0], PLATE.deep[1], PLATE.deep[2]));
    g.fillStyle = cg;
    g.beginPath();
    g.moveTo(-u * 0.40, -u * 0.22);
    g.quadraticCurveTo(-u * 0.46, -u * 0.94, 0, -u * 0.97);
    g.quadraticCurveTo(u * 0.46, -u * 0.94, u * 0.40, -u * 0.22);
    g.quadraticCurveTo(0, -u * 0.06, -u * 0.40, -u * 0.22);
    g.closePath(); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.82)'; g.lineWidth = 1.8; g.stroke();
    // the rings, suggested rather than drawn -- three courses is enough at
    // this size and any more turns to noise the moment it is scaled down
    g.strokeStyle = 'rgba(12,14,20,.5)'; g.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.ellipse(0, -u * 0.74 + i * u * 0.16, u * 0.40 - i * u * 0.03,
                u * 0.10, 0, 0.15, Math.PI - 0.15);
      g.stroke();
    }

    g.fillStyle = lit(126, 92, 64);                                  // neck
    g.fillRect(-u * 0.12, -u * 0.36, u * 0.24, u * 0.18);
    const fg = g.createLinearGradient(0, -u * 0.86, 0, -u * 0.26);
    fg.addColorStop(0, lit(176, 132, 94));
    fg.addColorStop(1, lit(108, 76, 52));
    g.fillStyle = fg;
    g.beginPath(); g.ellipse(0, -u * 0.56, u * 0.26, u * 0.31, 0, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.7)'; g.lineWidth = 1.4; g.stroke();
    g.fillStyle = lit(28, 20, 15);                                    // hair
    g.beginPath();
    g.ellipse(0, -u * 0.74, u * 0.27, u * 0.18, 0, Math.PI, TAU);
    g.fill();
    g.fillStyle = 'rgba(26,18,13,.9)';                                // beard
    g.beginPath();
    g.ellipse(0, -u * 0.4, u * 0.21, u * 0.14, 0, 0, Math.PI);
    g.fill();
    g.fillStyle = 'rgba(18,14,10,.95)';                               // eyes
    g.fillRect(-u * 0.14, -u * 0.6, u * 0.09, u * 0.05);
    g.fillRect(u * 0.05, -u * 0.6, u * 0.09, u * 0.05);

    g.restore();
    g.globalCompositeOperation = 'destination-over';
    g.fillStyle = 'rgba(0,0,0,.42)';
    g.beginPath(); g.ellipse(0, u * 1.3, u * 0.84, u * 0.28, 0, 0, TAU); g.fill();
    g.globalCompositeOperation = 'source-over';
  }));
}

// Essence: a mote of light bound in a shard.
function forgeLoot(big) {
  const s = big ? 10 : 7;
  return forge(s * 3.4, g => {
    g.shadowColor = PAL.gold; g.shadowBlur = 12;
    g.fillStyle = 'rgba(255,194,77,.92)';
    g.beginPath();
    g.moveTo(0, -s); g.lineTo(s * 0.62, -s * 0.2);
    g.lineTo(s * 0.38, s * 0.85); g.lineTo(-s * 0.38, s * 0.85);
    g.lineTo(-s * 0.62, -s * 0.2);
    g.closePath(); g.fill();
    g.shadowBlur = 0;
    g.fillStyle = 'rgba(255,244,214,.95)';
    g.beginPath();
    g.moveTo(0, -s); g.lineTo(s * 0.62, -s * 0.2); g.lineTo(0, s * 0.1);
    g.closePath(); g.fill();
    g.fillStyle = 'rgba(150,86,10,.5)';
    g.beginPath();
    g.moveTo(0, s * 0.85); g.lineTo(-s * 0.62, -s * 0.2); g.lineTo(0, s * 0.1);
    g.closePath(); g.fill();
    g.strokeStyle = 'rgba(255,228,160,.85)'; g.lineWidth = 0.8;
    g.beginPath();
    g.moveTo(0, -s); g.lineTo(s * 0.62, -s * 0.2);
    g.lineTo(s * 0.38, s * 0.85); g.lineTo(-s * 0.38, s * 0.85);
    g.lineTo(-s * 0.62, -s * 0.2);
    g.closePath(); g.stroke();
  });
}

/* --- environment surfaces ---------------------------------------------- */

function forgeVignette() {
  const w = Math.max(1, view.w), h = Math.max(1, view.h);
  const c = newCanvas(w, h);
  const g = c.getContext('2d');
  // Pulled in tighter and taken darker at the rim: the Vanguard carries the
  // only light, so the edge of the screen should read as the edge of what that
  // light reaches rather than as the edge of a picture.
  const grd = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.16,
                                     w / 2, h / 2, Math.max(w, h) * 0.70);
  grd.addColorStop(0, 'rgba(0,0,0,0)');
  grd.addColorStop(0.42, 'rgba(8,5,3,.34)');
  grd.addColorStop(0.74, 'rgba(6,4,2,.72)');
  grd.addColorStop(1, 'rgba(2,1,1,.985)');
  g.fillStyle = grd;
  g.fillRect(0, 0, w, h);
  // Faint warmth up top, cold blue down low: torch above, something else below.
  const tg = g.createLinearGradient(0, 0, 0, h);
  tg.addColorStop(0, 'rgba(255,150,60,.045)');
  tg.addColorStop(0.5, 'rgba(0,0,0,0)');
  tg.addColorStop(1, 'rgba(60,110,180,.05)');
  g.fillStyle = tg;
  g.fillRect(0, 0, w, h);
  return c;
}

function forgeAll() {
  SS = Math.min(3, Math.max(2, view.dpr));
  LIGHTS.clear();
  wallGrads.clear();
  // Sprites are forged one per pose now, and facing is a flip at blit time
  // rather than a second copy of every frame. That is what pays for the
  // cycles: the atlas would otherwise be four sprites per pose.
  //
  // The hero carries both cycles because the stick is analogue. Enemies carry
  // the run only -- a dormant body does not move at all and a woken one comes
  // at you flat out.
  for (const hid in HEROES) {
    SPR['w_' + hid] = forgeWeapon(hid);
    SPR['h_' + hid] = forgeHero(hid, GAIT_REST);
    for (let i = 0; i < GAIT_N; i++) {
      SPR['h_' + hid + 'w' + i] = forgeHero(hid, gaitPose(i, 0.30));
      SPR['h_' + hid + 'r' + i] = forgeHero(hid, gaitPose(i, 0.58));
    }
  }
  for (const k in ENEMY_TYPES) {
    const d = ENEMY_TYPES[k];
    if (k === 'deceiver' || k === 'mirage') { SPR[k] = forgeDeceiver(k); continue; }
    // `look` borrows another kind's paint. The Crucible-Mass is a gorger
    // drawn at forty-five units instead of twenty-six and lit a hotter
    // orange -- three times the footprint, no new art, and it still reads as
    // something out of the same forge as the thing it is three of.
    SPR[k] = forgeEnemy(k, d.r, d.color, GAIT_REST);
    // Nothing anchored gets a run cycle. It has no gait to spend one on --
    // bodyFrame hands back the rest pose for anything standing still, and the
    // Crucible-Mass is standing still by definition -- and at forty-five units
    // a frame it is the most expensive sprite in the game to forge. Eight
    // poses of it put the forged atlas 1.7MB over the budget gait.js holds it
    // to, for eight frames that could never be drawn.
    if (d.anchored) continue;
    for (let i = 0; i < GAIT_N; i++) {
      SPR[k + 'r' + i] = forgeEnemy(k, d.r, d.color, gaitPose(i, 0.52));
    }
  }

  if (!chestImg && CHEST_SHEET) { chestImg = new Image(); chestImg.src = CHEST_SHEET; }
  if (!propImg && PROP_SHEET) { propImg = new Image(); propImg.src = PROP_SHEET; }
  for (const ck in CHEST_KINDS) {
    SPR['ch_' + ck] = forgeChest(ck, false);
    SPR['ch_' + ck + '_open'] = forgeChest(ck, true);
  }
  SPR.loot = forgeLoot(false);
  SPR.lootBig = forgeLoot(true);
  forgeProps();
  forgeShadow();
  forgeGround();
  forgeWallCourses();
  vignette = forgeVignette();
}

/* --- world ------------------------------------------------------------- */

/* --- ground and stonework ------------------------------------------------
   No lines, no lattice, no glowing rims. The ground is a set of textured
   tiles baked once at boot -- packed earth, loose grit, worn flagstone -- and
   blitted across the view. Walls are dark rock with courses of cut masonry
   laid along every face. All of it is texture, not geometry, so none of it
   costs anything per frame beyond the blits.
   ---------------------------------------------------------------------- */

// Non-square sprite. Same 1:1 rule as forge(): the drawn size lands exactly
// on whole source pixels.
function forgeRect(w, h, paint) {
  const pw = Math.ceil(w * SS), ph = Math.ceil(h * SS);
  const c = newCanvas(pw, ph);
  const g = c.getContext('2d');
  g.translate(pw / 2, ph / 2);
  g.scale(SS, SS);
  paint(g);
  c.spanW = pw / SS;
  c.spanH = ph / SS;
  return c;
}

function rotateSprite(src, q) {
  if (!q) return src;
  const sw = src.width, sh = src.height;
  const swap = (q % 2) === 1;
  const w = swap ? sh : sw, h = swap ? sw : sh;
  const c = newCanvas(w, h);
  const g = c.getContext('2d');
  g.translate(w / 2, h / 2);
  g.rotate(q * Math.PI / 2);
  g.drawImage(src, -sw / 2, -sh / 2);
  if (src.span !== undefined) c.span = src.span;
  if (src.spanW !== undefined) {
    c.spanW = swap ? src.spanH : src.spanW;
    c.spanH = swap ? src.spanW : src.spanH;
  }
  return c;
}

const GROUND_T = 200;

              // world units per ground tile
const GROUND_VARIANTS = 8;

let groundTiles = [];

function forgeGround() {
  groundTiles = [];
  for (let v = 0; v < GROUND_VARIANTS; v++) {
    const px = Math.ceil(GROUND_T * SS);
    const c = newCanvas(px, px);
    const g = c.getContext('2d');
    g.scale(SS, SS);
    const T = GROUND_T;

    // Packed earth base
    g.fillStyle = 'rgb(' + REGION.earth.join(',') + ')';
    g.fillRect(0, 0, T, T);

    // Mottling: broad damp and dry patches
    for (let i = 0; i < 340; i++) {
      const x = Math.random() * T, y = Math.random() * T;
      const r = 3 + Math.random() * 13;
      const shade = Math.random();
      const mc = REGION.mottle[shade < 0.42 ? 0 : shade < 0.78 ? 1 : 2];
      g.fillStyle = 'rgba(' + mc.join(',') + ',' + (shade < 0.42 ? .16 : shade < .78 ? .13 : .10) + ')';
      g.beginPath();
      g.ellipse(x, y, r, r * (0.55 + Math.random() * 0.5), Math.random() * TAU, 0, TAU);
      g.fill();
    }

    // No paving. The floor is bare packed earth throughout -- flagstone courses
    // fought the wall blocks for the eye and broke rooms into panels. Two of the
    // four variants carry a little extra character so a large room does not read
    // as one flat wash: a trodden lane worn pale by traffic, and dried cracking.
    if (v % 4 === 2) {
      // a lane beaten smooth down the middle of the tile
      const cy2 = T * 0.5;
      for (let i = 0; i < 90; i++) {
        const x = Math.random() * T;
        const y = cy2 + rand(-T * 0.17, T * 0.17);
        const r = 4 + Math.random() * 11;
        g.fillStyle = 'rgba(' + REGION.mottle[2].join(',') + ',.13)';
        g.beginPath();
        g.ellipse(x, y, r, r * 0.42, rand(-0.25, 0.25), 0, TAU);
        g.fill();
      }
    } else if (v % 4 === 3) {
      // sun-dried earth, cracked in a loose web
      g.strokeStyle = 'rgba(10,7,5,.26)';
      for (let i = 0; i < 22; i++) {
        let x = Math.random() * T, y = Math.random() * T;
        let a = Math.random() * TAU;
        g.lineWidth = 0.7 + Math.random() * 0.6;
        g.beginPath();
        g.moveTo(x, y);
        for (let s = 0; s < 4; s++) {
          a += rand(-0.9, 0.9);
          x += Math.cos(a) * (5 + Math.random() * 9);
          y += Math.sin(a) * (5 + Math.random() * 9);
          g.lineTo(x, y);
        }
        g.stroke();
      }
    }

    // Grit and pebbles over everything
    for (let i = 0; i < 260; i++) {
      const x = Math.random() * T, y = Math.random() * T;
      const r = 0.5 + Math.random() * 1.9;
      g.fillStyle = Math.random() < 0.5 ? 'rgba(12,9,6,.5)' : 'rgba(122,106,80,.28)';
      g.beginPath(); g.ellipse(x, y, r, r * 0.8, 0, 0, TAU); g.fill();
    }
    // A few larger stones half-buried
    for (let i = 0; i < 10; i++) {
      const x = Math.random() * T, y = Math.random() * T, r = 2.5 + Math.random() * 3.2;
      g.fillStyle = 'rgba(74,64,48,.5)';
      g.beginPath(); g.ellipse(x, y, r, r * 0.72, Math.random() * TAU, 0, TAU); g.fill();
      g.fillStyle = 'rgba(8,6,4,.4)';
      g.beginPath(); g.ellipse(x, y + r * 0.5, r * 0.9, r * 0.4, 0, 0, TAU); g.fill();
    }
    c.tile = true;
    groundTiles.push(c);
  }
}

// Courses of cut stone laid along a wall face. Authored running along +x with
// the dressed, lit face toward -y, which is rotated to the wall's normal.
let wallCourses = [];

let wallRubble = [];

/* --- wall tops -----------------------------------------------------------
   A wall used to be a near-black void with dressed stone only along its rim.
   On a one-cell wall the two rims meet in the middle -- 7 units of inset plus
   a 15-unit band, from both sides, across a 40-unit cell -- so no core was
   left and the wall flattened into paving lying on the floor.

   Walls now carry a real top surface: neat ashlar laid in regular courses,
   aged rather than broken, tiled per cell so no two are identical. With a cast
   shadow underneath, the mass reads as standing above the ground instead of
   painted onto it.
   ---------------------------------------------------------------------- */
const WALL_TOPS = 6;

let wallTops = [];

function forgeWallTops() {
  wallTops = [];
  const T = CELL_W;
  for (let v = 0; v < WALL_TOPS; v++) {
    const px = Math.ceil(T * SS);
    const c = newCanvas(px, px);
    const g = c.getContext('2d');
    g.scale(SS, SS);

    // Mortar bed, dark, so every joint reads without drawing one.
    g.fillStyle = PAL.stoneLow;
    g.fillRect(0, 0, T, T);

    // Two courses of ashlar per cell, offset like real coursed stone.
    const rows = 2, ch = T / rows;
    for (let r = 0; r < rows; r++) {
      const off = ((v + r) % 2) * (T * 0.28);
      let x = -T * 0.3 + off;
      while (x < T) {
        const w = T * (0.42 + Math.random() * 0.3);
        const bx = x + 1, by = r * ch + 1, bw = w - 2, bh = ch - 2;
        // Neat block, lit from the top-left, sitting proud of the mortar.
        // Weathered sandstone rather than cold granite: warm in the light,
        // and the shadowed foot stays warm too, so a wall belongs to the same
        // ground it stands on instead of reading as imported grey rock.
        const grd = g.createLinearGradient(bx, by, bx, by + bh);
        const tone = 86 + Math.random() * 18;
        grd.addColorStop(0, 'rgb(' + Math.round(tone * 1.46) + ',' +
                                     Math.round(tone * 1.34) + ',' +
                                     Math.round(tone * 1.10) + ')');
        grd.addColorStop(1, 'rgb(' + Math.round(tone * 0.88) + ',' +
                                     Math.round(tone * 0.79) + ',' +
                                     Math.round(tone * 0.63) + ')');
        g.fillStyle = grd;
        g.fillRect(bx, by, bw, bh);
        // dressed highlight along the top arris
        g.fillStyle = 'rgba(242,228,192,.30)';
        g.fillRect(bx, by, bw, 1);
        // and the shadowed foot of the block
        g.fillStyle = 'rgba(8,7,5,.35)';
        g.fillRect(bx, by + bh - 1.2, bw, 1.2);

        // --- age, on top of neat work -------------------------------------
        // chipped corners
        if (Math.random() < 0.5) {
          g.fillStyle = 'rgba(10,9,7,.5)';
          const cw = 2 + Math.random() * 3;
          const cx2 = Math.random() < 0.5 ? bx : bx + bw - cw;
          g.beginPath();
          g.moveTo(cx2, by); g.lineTo(cx2 + cw, by); g.lineTo(cx2, by + cw);
          g.closePath(); g.fill();
        }
        // pitting and weather stain
        for (let i = 0; i < 3; i++) {
          g.fillStyle = 'rgba(12,10,7,.16)';
          g.beginPath();
          g.ellipse(bx + Math.random() * bw, by + Math.random() * bh,
                    0.8 + Math.random() * 1.6, 0.6 + Math.random(), 0, 0, TAU);
          g.fill();
        }
        if (Math.random() < 0.35) {
          g.fillStyle = 'rgba(20,16,10,.14)';
          g.fillRect(bx + Math.random() * bw * 0.6, by, 2 + Math.random() * 4, bh);
        }
        x += w;
      }
    }

    // Damp and moss gathering in the joints, region-tinted. Four faint
    // patches read as a clean surface with a mark on it; this is a top that
    // has had things growing on it.
    const wet = REGION.moss || [90, 110, 60];
    for (let i = 0; i < 11; i++) {
      if (Math.random() > 0.72) continue;
      const mx = Math.random() * T, my = Math.random() * T;
      const mr = 3 + Math.random() * 8;
      const mg = g.createRadialGradient(mx, my, 0, mx, my, mr);
      mg.addColorStop(0, 'rgba(' + wet.join(',') + ',' + (0.22 + Math.random() * 0.20).toFixed(2) + ')');
      mg.addColorStop(0.6, 'rgba(' + wet.join(',') + ',' + (0.10 + Math.random() * 0.10).toFixed(2) + ')');
      mg.addColorStop(1, 'rgba(' + wet.join(',') + ',0)');
      g.fillStyle = mg;
      g.beginPath();
      g.ellipse(mx, my, mr, mr * (0.5 + Math.random() * 0.4),
                Math.random() * TAU, 0, TAU);
      g.fill();
    }
    // and a few dark spots of standing wet in the low corners
    for (let i = 0; i < 3; i++) {
      if (Math.random() > 0.5) continue;
      g.fillStyle = 'rgba(10,14,12,.26)';
      g.beginPath();
      g.ellipse(Math.random() * T, Math.random() * T,
                2 + Math.random() * 4, 1.4 + Math.random() * 2.4,
                Math.random() * TAU, 0, TAU);
      g.fill();
    }
    wallTops.push(c);
  }
}

function forgeWallCourses() {
  wallCourses = [];
  for (let v = 0; v < 3; v++) {
    const base = forgeRect(100, 30, g => {
      g.translate(-50, -15);
      // shadow the course throws onto the ground
      g.fillStyle = 'rgba(6,4,3,.5)';
      g.fillRect(0, -3, 100, 5);
      let x = 0;
      while (x < 100) {
        const w = 20 + Math.random() * 16;
        const h = 15 + Math.random() * 6;
        const tone = 70 + Math.random() * 26;
        const grd = g.createLinearGradient(0, 0, 0, h);
        grd.addColorStop(0, 'rgb(' + Math.round(tone * 1.70) + ',' +
                                     Math.round(tone * 1.56) + ',' +
                                     Math.round(tone * 1.28) + ')');
        grd.addColorStop(1, 'rgb(' + Math.round(tone * 0.60) + ',' +
                                     Math.round(tone * 0.54) + ',' +
                                     Math.round(tone * 0.43) + ')');
        g.fillStyle = grd;
        g.fillRect(x + 1, 1, w - 2, h - 1);
        // dressed top edge and mortar joint
        g.strokeStyle = 'rgba(176,162,134,.3)';
        g.lineWidth = 1.2;
        g.beginPath(); g.moveTo(x + 2, 1.6); g.lineTo(x + w - 3, 1.6); g.stroke();
        g.strokeStyle = 'rgba(8,6,4,.75)';
        g.lineWidth = 1.6;
        g.beginPath(); g.moveTo(x + w - 1, 0); g.lineTo(x + w - 1, h); g.stroke();
        // pitting
        for (let i = 0; i < 7; i++) {
          g.fillStyle = 'rgba(10,8,5,.24)';
          g.beginPath();
          g.ellipse(x + 4 + Math.random() * (w - 8), 3 + Math.random() * (h - 6),
                    1 + Math.random() * 1.9, 1 + Math.random() * 1.2, 0, 0, TAU);
          g.fill();
        }
        // Water has been running down this face for a very long time: dark
        // streaks from the top edge, tapering as they go.
        for (let i = 0; i < 2; i++) {
          if (Math.random() > 0.62) continue;
          const sx = x + 3 + Math.random() * (w - 6);
          const sw = 1.4 + Math.random() * 2.6;
          const st = g.createLinearGradient(0, 1, 0, h);
          st.addColorStop(0, 'rgba(12,11,8,.42)');
          st.addColorStop(0.7, 'rgba(12,11,8,.20)');
          st.addColorStop(1, 'rgba(12,11,8,0)');
          g.fillStyle = st;
          g.beginPath();
          g.moveTo(sx, 1);
          g.lineTo(sx + sw, 1);
          g.lineTo(sx + sw * 0.4, h);
          g.lineTo(sx - sw * 0.2, h);
          g.closePath(); g.fill();
        }
        x += w;
      }
      // Moss banked along the foot of the course, where the damp sits. The
      // stone was clean to the ground before this, which is what made it read
      // as new-cut masonry rather than something that has been standing in a
      // wet hole for an age.
      // The region's own moss, not its darkest damp tone -- mottle[0] is
      // near-black, so growing things out of it just dirtied the stone.
      const mo = REGION.moss || [90, 110, 60];
      for (let i = 0; i < 16; i++) {
        const mx = Math.random() * 100;
        const mr = 3 + Math.random() * 9;
        const mg = g.createRadialGradient(mx, 15, 0, mx, 15, mr);
        mg.addColorStop(0, 'rgba(' + mo.join(',') + ',' + (0.30 + Math.random() * 0.22).toFixed(2) + ')');
        mg.addColorStop(1, 'rgba(' + mo.join(',') + ',0)');
        g.fillStyle = mg;
        g.beginPath();
        g.ellipse(mx, 14 - Math.random() * 3, mr, mr * 0.62, 0, 0, TAU);
        g.fill();
      }
      g.fillStyle = 'rgba(4,5,6,.7)';
      g.fillRect(0, 15.5, 100, 14.5);
    });
    wallCourses.push([0, 1, 2, 3].map(q => rotateSprite(base, q)));
  }
  forgeWallRubble();
  forgeWallTops();
}

/* Rubble spilling off the foot of a wall. Merged wall rects are all
   axis-aligned, so without this the silhouette is an unbroken straight line
   wherever rock meets floor and the whole map reads as a tileset. Authored in
   the same local frame as a course and blitted with the same quarter rotation,
   biased toward the floor side so the stones spill outward. */
function forgeWallRubble() {
  wallRubble = [];
  for (let v = 0; v < 4; v++) {
    const base = forgeRect(100, 34, g => {
      g.translate(-50, -17);
      const n = 7 + ((Math.random() * 6) | 0);
      for (let i = 0; i < n; i++) {
        // local y below centre is the floor side once rotated into place
        const x = 6 + Math.random() * 88;
        const y = 15 + Math.random() * 15;
        const w = 4 + Math.random() * 11, h = 3 + Math.random() * 7;
        const tone = 52 + Math.random() * 34;
        g.fillStyle = 'rgba(5,4,3,.45)';                       // contact shadow
        g.beginPath();
        g.ellipse(x + 1.5, y + h * 0.55, w * 0.62, h * 0.42, 0, 0, TAU);
        g.fill();
        const grd = g.createLinearGradient(0, y - h / 2, 0, y + h / 2);
        grd.addColorStop(0, 'rgb(' + Math.round(tone * 1.45) + ',' +
                                     Math.round(tone * 1.38) + ',' +
                                     Math.round(tone * 1.22) + ')');
        grd.addColorStop(1, 'rgb(' + Math.round(tone * 0.6) + ',' +
                                     Math.round(tone * 0.57) + ',' +
                                     Math.round(tone * 0.5) + ')');
        g.fillStyle = grd;
        g.beginPath();
        // chipped, not round: a few flat facets reads as broken stone
        g.moveTo(x - w / 2, y);
        g.lineTo(x - w / 4, y - h / 2);
        g.lineTo(x + w / 3, y - h / 2.4);
        g.lineTo(x + w / 2, y + h / 6);
        g.lineTo(x, y + h / 2);
        g.closePath(); g.fill();
      }
    });
    wallRubble.push([0, 1, 2, 3].map(q => rotateSprite(base, q)));
  }
}

function forgeShadow() {
  SPR.shadow = forge(64, g => {
    const grd = g.createRadialGradient(0, 0, 0, 0, 0, 30);
    grd.addColorStop(0,   'rgba(0,0,0,.62)');
    grd.addColorStop(0.55,'rgba(0,0,0,.34)');
    grd.addColorStop(1,   'rgba(0,0,0,0)');
    g.fillStyle = grd;
    g.beginPath(); g.ellipse(0, 0, 30, 30, 0, 0, TAU); g.fill();
  });
}

function forgeProps() {
  const P = (kind, span, paint) => { SPR['p_' + kind] = forge(span, paint); };

  // A standing column. Authored with its base at the sprite's centre and the
  // shaft running up, so y-sorting against bodies works on the base.
  P('pillar', 96, g => {
    g.translate(0, 6);
    g.fillStyle = 'rgba(4,3,2,.5)';
    g.beginPath(); g.ellipse(3, 2, 15, 6, 0, 0, TAU); g.fill();
    for (let i = 0; i < 5; i++) {
      const y = -i * 11, w = 22 - i * 0.7;
      const grd = g.createLinearGradient(-w / 2, 0, w / 2, 0);
      const t = 92 + i * 3;
      grd.addColorStop(0,   'rgb(' + Math.round(t * 0.72) + ',' + Math.round(t * 0.65) + ',' + Math.round(t * 0.52) + ')');
      grd.addColorStop(0.42,'rgb(' + Math.round(t * 1.42) + ',' + Math.round(t * 1.30) + ',' + Math.round(t * 1.06) + ')');
      grd.addColorStop(1,   'rgb(' + Math.round(t * 0.80) + ',' + Math.round(t * 0.72) + ',' + Math.round(t * 0.58) + ')');
      g.fillStyle = grd;
      g.fillRect(-w / 2, y - 11, w, 11);
      g.fillStyle = 'rgba(10,8,5,.55)';
      g.fillRect(-w / 2, y - 11, w, 1.4);
      if (Math.random() < 0.5) {
        g.fillStyle = 'rgba(12,10,7,.22)';
        g.fillRect(-w / 2 + Math.random() * w * 0.6, y - 9, 2 + Math.random() * 3, 8);
      }
    }
    // capital, catching the light
    g.fillStyle = 'rgba(226,208,166,.9)';
    g.fillRect(-14, -60, 28, 5);
    g.fillStyle = 'rgba(150,130,94,.9)';
    g.fillRect(-14, -55, 28, 3);
  });

  /* --- wall fittings: authored pointing +x, out of the stone ------------ */
  P('torch', 34, g => {
    g.strokeStyle = '#4a3a26'; g.lineWidth = 2.6; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-8, 0); g.lineTo(2, 0); g.stroke();       // bracket
    g.fillStyle = '#2b2118';
    g.beginPath(); g.ellipse(3, 0, 3.2, 4.4, 0, 0, TAU); g.fill();     // basket
    g.strokeStyle = '#6a5334'; g.lineWidth = 1; g.stroke();
    g.shadowColor = PAL.ember; g.shadowBlur = 13;                      // flame
    g.fillStyle = 'rgba(255,154,60,.95)';
    g.beginPath();
    g.moveTo(9.5, 0); g.quadraticCurveTo(4, 4.6, 2.5, 0);
    g.quadraticCurveTo(4, -4.6, 9.5, 0);
    g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,240,200,.95)';
    g.beginPath(); g.ellipse(5, 0, 2.1, 1.5, 0, 0, TAU); g.fill();
    g.shadowBlur = 0; g.lineCap = 'butt';
  });
  P('banner', 34, g => {
    g.fillStyle = '#4a1f22';
    g.beginPath();
    g.moveTo(-2, -6.5); g.lineTo(7, -6.5); g.lineTo(7, 6.5); g.lineTo(-2, 6.5);
    g.lineTo(2.5, 0); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(190,150,90,.45)'; g.lineWidth = 1; g.stroke();
    g.strokeStyle = '#7a6440'; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(-3, -7.5); g.lineTo(-3, 7.5); g.stroke();
    g.fillStyle = 'rgba(214,180,120,.6)';
    g.beginPath(); g.arc(4, 0, 1.9, 0, TAU); g.fill();
  });
  P('chain', 30, g => {
    g.strokeStyle = 'rgba(150,140,124,.5)'; g.lineWidth = 1.5;
    for (let i = -1; i <= 1; i++) {
      const y = i * 4.5;
      for (let k = -7; k < 7; k += 3.4) {
        g.beginPath(); g.ellipse(k, y, 1.7, 1.15, 0, 0, TAU); g.stroke();
      }
    }
  });
  P('sconce', 26, g => {
    g.fillStyle = '#241d16';
    g.beginPath(); g.ellipse(1, 0, 4.6, 5.4, 0, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(180,160,130,.45)'; g.lineWidth = 1.1; g.stroke();
    g.fillStyle = PAL.bone;                                            // a skull
    g.beginPath(); g.ellipse(2, 0, 3, 3.4, 0, 0, TAU); g.fill();
    g.fillStyle = 'rgba(20,16,12,.9)';
    g.beginPath(); g.arc(3.4, -1.2, 0.95, 0, TAU); g.fill();
    g.beginPath(); g.arc(3.4, 1.2, 0.95, 0, TAU); g.fill();
  });

  /* --- floor scenery ---------------------------------------------------- */
  P('bones', 34, g => {
    g.strokeStyle = 'rgba(203,189,154,.55)'; g.lineWidth = 1.7; g.lineCap = 'round';
    g.beginPath();
    g.moveTo(-8, -3); g.lineTo(1, -5);
    g.moveTo(-7, 1); g.lineTo(3, 0);
    g.moveTo(-5, 4.5); g.lineTo(2, 4);
    g.stroke();
    g.fillStyle = 'rgba(203,189,154,.62)';
    g.beginPath(); g.ellipse(7, 1.5, 4, 3.4, 0.2, 0, TAU); g.fill();
    g.fillStyle = 'rgba(18,14,11,.9)';
    g.beginPath(); g.arc(8.4, 0.4, 1.1, 0, TAU); g.fill();
    g.beginPath(); g.arc(6.2, 2.6, 1.1, 0, TAU); g.fill();
    g.lineCap = 'butt';
  });
  P('barrel', 32, g => {
    const grd = g.createRadialGradient(-2, -2, 1, 0, 0, 10);
    grd.addColorStop(0, '#5a4429'); grd.addColorStop(1, '#2a1f13');
    g.fillStyle = grd;
    g.beginPath(); g.arc(0, 0, 9.5, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(20,15,10,.8)'; g.lineWidth = 1.4; g.stroke();
    g.strokeStyle = 'rgba(120,100,70,.5)'; g.lineWidth = 1;
    g.beginPath(); g.arc(0, 0, 6.4, 0, TAU); g.stroke();
    g.beginPath(); g.arc(0, 0, 3, 0, TAU); g.stroke();
  });
  P('crate', 32, g => {
    g.fillStyle = '#3d2e1c';
    g.fillRect(-8.5, -8.5, 17, 17);
    g.strokeStyle = 'rgba(18,13,9,.85)'; g.lineWidth = 1.4;
    g.strokeRect(-8.5, -8.5, 17, 17);
    g.strokeStyle = 'rgba(126,102,66,.55)'; g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(-8.5, -8.5); g.lineTo(8.5, 8.5);
    g.moveTo(8.5, -8.5); g.lineTo(-8.5, 8.5);
    g.stroke();
  });
  P('rubble', 30, g => {
    g.fillStyle = 'rgba(48,42,34,.95)'; g.strokeStyle = 'rgba(140,124,98,.35)';
    g.lineWidth = 0.9;
    const chunk = (cx, cy, s) => {
      g.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU, rr = s * (0.62 + Math.random() * 0.5);
        (i === 0 ? g.moveTo : g.lineTo).call(g, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      }
      g.closePath(); g.fill(); g.stroke();
    };
    chunk(-4, -2, 4.8); chunk(3.6, 2.6, 3.6); chunk(1, -5, 2.8);
  });
  P('moss', 40, g => {
    const grd = g.createRadialGradient(0, 0, 0, 0, 0, 15);
    grd.addColorStop(0, 'rgba(74,96,44,.42)');
    grd.addColorStop(1, 'rgba(74,96,44,0)');
    g.fillStyle = grd;
    g.beginPath(); g.ellipse(0, 0, 15, 11, 0.4, 0, TAU); g.fill();
  });
  P('crack', 42, g => {
    g.strokeStyle = 'rgba(10,8,6,.7)'; g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(-15, 2); g.lineTo(-6, -1); g.lineTo(1, 3); g.lineTo(9, -2); g.lineTo(15, 1);
    g.moveTo(-6, -1); g.lineTo(-4, -6);
    g.moveTo(9, -2); g.lineTo(11, 4);
    g.stroke();
  });
  P('coins', 30, g => {
    const disc = (cx, cy, r2) => {
      g.fillStyle = 'rgba(224,179,86,.9)';
      g.beginPath(); g.ellipse(cx, cy, r2, r2 * 0.78, 0, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(120,84,26,.8)'; g.lineWidth = 0.7; g.stroke();
      g.fillStyle = 'rgba(255,232,170,.7)';
      g.beginPath(); g.ellipse(cx - r2 * 0.22, cy - r2 * 0.22, r2 * 0.34, r2 * 0.26, 0, 0, TAU); g.fill();
    };
    disc(-4, 1, 3.2); disc(1.5, -2.5, 2.9); disc(3.5, 3, 3.4);
    disc(-1, 4, 2.4); disc(6, -1, 2.2);
  });
  P('sword', 40, g => {
    g.strokeStyle = 'rgba(176,188,196,.75)'; g.lineWidth = 2.4; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-12, 3); g.lineTo(11, -3); g.stroke();
    g.strokeStyle = 'rgba(232,240,246,.5)'; g.lineWidth = 0.9;
    g.beginPath(); g.moveTo(-11, 2.7); g.lineTo(10, -2.8); g.stroke();
    g.strokeStyle = '#5a4530'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(-15, 4.4); g.lineTo(-12.5, 3.6); g.stroke();
    g.strokeStyle = '#7a6440'; g.lineWidth = 2.2;
    g.beginPath(); g.moveTo(-12, 0.4); g.lineTo(-10.5, 6.4); g.stroke();
    g.lineCap = 'butt';
  });
  P('shield', 36, g => {
    const grd = g.createRadialGradient(-3, -3, 1, 0, 0, 11);
    grd.addColorStop(0, '#4a5a5e'); grd.addColorStop(1, '#1d2628');
    g.fillStyle = grd;
    g.beginPath(); g.ellipse(0, 0, 10.5, 9.5, 0, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(186,170,138,.45)'; g.lineWidth = 1.6; g.stroke();
    g.fillStyle = 'rgba(190,206,212,.7)';
    g.beginPath(); g.arc(0, 0, 3, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(30,40,42,.8)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(-9, 0); g.lineTo(9, 0); g.stroke();
  });
  P('urn', 32, g => {
    const grd = g.createRadialGradient(-2, -3, 1, 0, 0, 10);
    grd.addColorStop(0, '#7a5336'); grd.addColorStop(1, '#33210f');
    g.fillStyle = grd;
    g.beginPath(); g.ellipse(0, 0, 8.4, 8, 0, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(20,12,6,.8)'; g.lineWidth = 1.3; g.stroke();
    g.strokeStyle = 'rgba(190,150,100,.45)'; g.lineWidth = 1.1;
    g.beginPath(); g.arc(0, 0, 4.6, 0, TAU); g.stroke();
    g.fillStyle = 'rgba(10,7,4,.85)';
    g.beginPath(); g.arc(0, 0, 2.6, 0, TAU); g.fill();
  });
  P('scroll', 34, g => {
    g.fillStyle = 'rgba(214,196,152,.85)';
    g.beginPath(); g.roundRect ? g.roundRect(-9, -4, 18, 8, 2) : g.rect(-9, -4, 18, 8);
    g.fill();
    g.strokeStyle = 'rgba(120,98,62,.8)'; g.lineWidth = 1; g.stroke();
    g.strokeStyle = 'rgba(150,126,84,.7)'; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(-9, -4); g.lineTo(-9, 4); g.moveTo(9, -4); g.lineTo(9, 4); g.stroke();
    g.strokeStyle = 'rgba(160,60,50,.8)'; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(1, -4.6); g.lineTo(1, 4.6); g.stroke();
  });
  P('hornskull', 38, g => {
    g.fillStyle = 'rgba(216,205,176,.75)';
    g.beginPath(); g.ellipse(0, 1, 5.4, 6.4, 0, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(120,108,84,.7)'; g.lineWidth = 0.9; g.stroke();
    g.strokeStyle = 'rgba(216,205,176,.72)'; g.lineWidth = 2.4; g.lineCap = 'round';
    g.beginPath();
    g.moveTo(-4, -3); g.quadraticCurveTo(-11, -6, -12, -12);
    g.moveTo(4, -3);  g.quadraticCurveTo(11, -6, 12, -12);
    g.stroke();
    g.fillStyle = 'rgba(16,12,8,.9)';
    g.beginPath(); g.ellipse(-2.1, 0.4, 1.5, 1.9, 0, 0, TAU); g.fill();
    g.beginPath(); g.ellipse(2.1, 0.4, 1.5, 1.9, 0, 0, TAU); g.fill();
    g.lineCap = 'butt';
  });
  P('boss', 54, g => {                     // horned skull boss for the frame
    g.strokeStyle = 'rgba(212,200,170,.9)'; g.lineWidth = 3.4; g.lineCap = 'round';
    g.beginPath();
    g.moveTo(-6, -5); g.quadraticCurveTo(-15, -9, -18, -18);
    g.moveTo(6, -5);  g.quadraticCurveTo(15, -9, 18, -18);
    g.stroke();
    const grd = g.createRadialGradient(-3, -4, 1, 0, 0, 12);
    grd.addColorStop(0, '#efe6cc'); grd.addColorStop(1, '#8e8367');
    g.fillStyle = grd;
    g.beginPath(); g.ellipse(0, -1, 9.5, 10.5, 0, 0, TAU); g.fill();
    g.beginPath(); g.moveTo(-5.5, 6); g.lineTo(5.5, 6); g.lineTo(3.5, 12); g.lineTo(-3.5, 12);
    g.closePath(); g.fill();
    g.strokeStyle = 'rgba(60,52,38,.8)'; g.lineWidth = 1; g.stroke();
    g.fillStyle = 'rgba(8,10,10,.92)';
    g.beginPath(); g.ellipse(-3.6, -1.5, 2.7, 3.3, 0.15, 0, TAU); g.fill();
    g.beginPath(); g.ellipse(3.6, -1.5, 2.7, 3.3, -0.15, 0, TAU); g.fill();
    g.beginPath(); g.moveTo(0, 2); g.lineTo(-1.8, 5.4); g.lineTo(1.8, 5.4); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(40,34,24,.7)'; g.lineWidth = 0.9;
    g.beginPath(); g.moveTo(-4, 8.6); g.lineTo(4, 8.6); g.stroke();
    g.lineCap = 'butt';
  });
  // A stone tomb. The sheet supplies the real ones; this is what shows if it
  // ever fails to decode, on the same rule the coffers follow -- nothing in
  // the world may render as nothing.
  P('tomb', 56, g => {
    g.fillStyle = '#3a352c';                                    // the chest
    g.beginPath();
    g.roundRect ? g.roundRect(-13, -20, 26, 40, 3) : g.rect(-13, -20, 26, 40);
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,.7)'; g.lineWidth = 2; g.stroke();
    const lg = g.createLinearGradient(0, -20, 0, 14);            // the lid
    lg.addColorStop(0, '#6a6355');
    lg.addColorStop(1, '#403a31');
    g.fillStyle = lg;
    g.beginPath();
    g.roundRect ? g.roundRect(-12, -22, 24, 34, 3) : g.rect(-12, -22, 24, 34);
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,.7)'; g.lineWidth = 1.6; g.stroke();
    g.strokeStyle = 'rgba(150,138,112,.35)'; g.lineWidth = 1;    // a carved figure
    g.beginPath();
    g.ellipse(0, -14, 4, 5, 0, 0, TAU);
    g.moveTo(-5, -6); g.lineTo(5, -6);
    g.moveTo(0, -6); g.lineTo(0, 7);
    g.stroke();
    g.fillStyle = 'rgba(12,10,7,.5)';                            // the seam
    g.fillRect(-12, 11, 24, 2);
  });

  P('grate', 34, g => {
    g.fillStyle = 'rgba(8,6,5,.85)';
    g.fillRect(-11, -11, 22, 22);
    g.strokeStyle = 'rgba(122,110,90,.5)'; g.lineWidth = 1.2;
    g.strokeRect(-11, -11, 22, 22);
    g.strokeStyle = 'rgba(122,110,90,.4)'; g.lineWidth = 1.4;
    for (let i = -7; i <= 7; i += 4.6) {
      g.beginPath(); g.moveTo(i, -11); g.lineTo(i, 11); g.stroke();
    }
  });

  for (const k in SPR) {
    if (k.indexOf('p_') !== 0 || k.length > 2 && k.charAt(k.length - 2) === '_') continue;
    for (let q = 0; q < 4; q++) SPR[k + '_' + q] = rotateSprite(SPR[k], q);
  }
}

// Scenery that stands up rather than lying flat. These are drawn with the
// bodies, sorted by depth, so a thrall can pass behind a pillar and be hidden
// by it -- which is the cheapest verticality a flat view can buy.
// Scenery drawn from the sheet rather than forged. Four variants a kind,
// picked by the prop's own random q -- which is what used to choose a quarter
// turn, and a quarter turn is wrong for a bitmap that has an up. `d` is how
// wide it is drawn in world units. Built by tools/build-art.py.
const PROP_SHEET = 'data:image/png;base64,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';

let propImg = null;

