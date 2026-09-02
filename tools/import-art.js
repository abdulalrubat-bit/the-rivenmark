#!/usr/bin/env node
/* Turn a reference image into a game frame.
 *
 * Art arrives the way art arrives: a 4000x1600 sheet with an 1185x982 figure
 * floating somewhere in the middle of it, 92% transparent margin. The game
 * wants a tight frame at a size that matches the body it belongs to. This
 * trims, resamples, and writes it into art-custom/ under the right name.
 *
 *   node tools/import-art.js <folder/frame-name> <source.png> [--scale N]
 *   node tools/import-art.js bestiary/cantor-idle a.png b.png c.png
 *
 * Give it more than one source and it treats them as ONE CYCLE: they are
 * trimmed to a COMMON bounding box and written as -0, -1, -2. That is not a
 * convenience. Trimmed independently, two frames of the same animation came
 * out 176x146 and 176x145, and a body that changes size by a pixel between
 * frames jitters on the spot for ever with nothing to point at.
 *
 * The output is the FORGED frame's canvas at `--scale` times its resolution,
 * with the imported figure resampled to the forged FIGURE's height and stood
 * on the forged figure's foot line. All three of those matter and none of them
 * is obvious:
 *
 *   - the CANVAS, so the frame is a drop-in with the same registration. The
 *     game centres a sprite on the body's position; a tight-trimmed frame
 *     centres its own bounding box there instead, and the body floats.
 *   - the FIGURE's height, not the canvas's. A forged body fills 47-83% of its
 *     square canvas, so fitting the import to the canvas made it far bigger
 *     than the thing it stands next to -- measured, the husk came out 27%
 *     taller than the husk that walks, and it is the SAME husk: it grew every
 *     time it stopped moving.
 *   - the FOOT LINE, because a top-down crowd reads as standing on a floor
 *     only while everything's feet are on the same one. Matching centres
 *     instead moved the husk's feet 3.5 units down the moment it stood still.
 *
 * `--scale` multiplies the resolution: the default of 2 is chosen because a
 * body is 38-96 world units and a modern phone renders at dpr ~2.8, so twice
 * the forged resolution is about pixel-parity on the device and anything more
 * is texture you cannot see.
 *
 * Pure JS, no dependencies beyond pngjs, so it runs under Termux like the rest.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/* pngjs, from wherever it actually is.
 *
 * This tool lives at the repo root, which has no node_modules; the dependency
 * is installed under phaser/ because that is the build that needs it. NODE_PATH
 * does not apply to ESM imports, so a plain `import from 'pngjs'` fails here
 * however the environment is set up. Try the normal resolution first, so a root
 * install works too, and fall back to the one place it is known to be.
 */
let PNG;
try {
  ({ PNG } = await import('pngjs'));
} catch {
  const local = path.join(here, '..', 'phaser', 'node_modules', 'pngjs', 'lib', 'png.js');
  if (!fs.existsSync(local)) {
    console.error('pngjs not found. Run `npm ci` in phaser/, or `npm i pngjs` here.');
    process.exit(1);
  }
  ({ PNG } = await import(pathToFileURL(local).href));
}
const ROOT = path.join(here, '..');
const ART = path.join(ROOT, 'art');
const CUSTOM = path.join(ROOT, 'art-custom');

const args = process.argv.slice(2);
const flag = n => { const i = args.indexOf('--' + n); return i < 0 ? null : args[i + 1]; };
const positional = args.filter((a, i) =>
  !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const [target, ...sources] = positional;
const scale = Number(flag('scale') || 2);

if (!target || !sources.length) {
  console.error('usage: node tools/import-art.js <folder/frame-name> <source.png> [more.png ...] [--scale N]');
  process.exit(1);
}

/* Trim to what is actually drawn.
 *
 * Alpha over 8 rather than over 0: exported art routinely carries a haze of
 * 1-2 alpha across the whole canvas from a soft brush or a resample, and
 * trimming on "any non-zero pixel" then trims nothing at all. */
function bounds(png, label) {
  let x0 = png.width, y0 = png.height, x1 = -1, y1 = -1;
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      if (png.data[((png.width * y) + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) throw new Error(label + ' is entirely transparent');
  return { x0, y0, x1, y1 };
}

/* Cut a frame out at a box that may be larger than its own content, so every
 * frame of a cycle keeps the same size AND the same registration -- the figure
 * stays where it is between frames instead of being re-centred each time. */
function cut(png, b) {
  const w = b.x1 - b.x0 + 1, h = b.y1 - b.y0 + 1;
  const out = new PNG({ width: w, height: h });
  out.data.fill(0);
  const sx = Math.max(0, b.x0), sy = Math.max(0, b.y0);
  const ex = Math.min(png.width - 1, b.x1), ey = Math.min(png.height - 1, b.y1);
  if (ex >= sx && ey >= sy) {
    PNG.bitblt(png, out, sx, sy, ex - sx + 1, ey - sy + 1, sx - b.x0, sy - b.y0);
  }
  return out;
}

/* Box-filter resample.
 *
 * Averaged in PREMULTIPLIED space. Averaging straight RGBA bleeds the colour
 * of fully transparent pixels into the edge -- which for art exported on a
 * white background means a white halo around every silhouette, on a game whose
 * floor is nearly black. Nothing looks more pasted-in than that.
 */
function resample(png, W, H) {
  const out = new PNG({ width: W, height: H });
  const sx = png.width / W, sy = png.height / H;
  for (let y = 0; y < H; y++) {
    const y0 = Math.floor(y * sy), y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
    for (let x = 0; x < W; x++) {
      const x0 = Math.floor(x * sx), x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let j = y0; j < y1 && j < png.height; j++) {
        for (let i = x0; i < x1 && i < png.width; i++) {
          const s = ((png.width * j) + i) * 4;
          const al = png.data[s + 3] / 255;
          r += png.data[s] * al; g += png.data[s + 1] * al; b += png.data[s + 2] * al;
          a += png.data[s + 3]; n++;
        }
      }
      const d = ((W * y) + x) * 4;
      const A = a / n;
      const un = A > 0 ? 255 / A : 0;      // back out of premultiplied
      out.data[d] = Math.min(255, Math.round(r / n * un));
      out.data[d + 1] = Math.min(255, Math.round(g / n * un));
      out.data[d + 2] = Math.min(255, Math.round(b / n * un));
      out.data[d + 3] = Math.round(A);
    }
  }
  return out;
}

const [folder, name] = [target.split('/')[0], target.split('/').slice(1).join('/')];
if (!folder || !name) {
  console.error('target must look like bestiary/thrall-idle-0');
  process.exit(1);
}

/* The forged frame this is measured against: its canvas AND where the figure
 * sits inside it.
 *
 * The exact frame when one exists, otherwise the kind's `-rest` -- which is the
 * case that matters, because a pose the forged bestiary does not have at all
 * (an idle, say) is exactly the pose you want to import. Guessing instead is
 * how an imported body ends up a head taller than the horde it walks with.
 */
function reference() {
  const dir = path.join(ART, folder);
  const exact = path.join(dir, name + '.png');
  const kind = name.split('-')[0];
  const rest = path.join(dir, kind + '-rest.png');
  const from = fs.existsSync(exact) ? exact : fs.existsSync(rest) ? rest : null;
  if (!from) {
    console.error('no forged frame to size against: looked for\n  ' + exact + '\n  ' + rest +
                  '\nPass a frame name whose kind already exists, or add the forged art first.');
    process.exit(1);
  }
  const png = PNG.sync.read(fs.readFileSync(from));
  return { w: png.width, h: png.height, box: bounds(png, from), from: path.basename(from) };
}

const pngs = sources.map(f => ({ file: f, png: PNG.sync.read(fs.readFileSync(f)) }));
const cycle = pngs.length > 1;

// One box over every frame. For a single import that is just its own bounds.
const box = pngs.map(p => bounds(p.png, p.file)).reduce((a, b) => ({
  x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0),
  x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1)
}));
const bw = box.x1 - box.x0 + 1, bh = box.y1 - box.y0 + 1;

const t = reference();
const CW = t.w * scale, CH = t.h * scale;          // the canvas we must land on
const fw = t.box.x1 - t.box.x0 + 1;                // and the figure inside it
const fh = t.box.y1 - t.box.y0 + 1;

/* Match the forged FIGURE's height, preserving aspect.
 *
 * Height rather than the larger of the two axes, because a standing figure is
 * read by how tall it is: a pose with an arm out is legitimately wider than the
 * rest pose and should not be shrunk for it. Squashing to fit both would change
 * the shape outright, which is worse than either.
 */
const H = Math.max(1, Math.round(fh * scale));
const W = Math.max(1, Math.round(H * (bw / bh)));

// Where it stands: feet on the forged figure's foot line, centred left-to-right
// on the forged figure rather than on the canvas, since the forged figure is
// not always centred in its own frame either.
const footY = (t.box.y1 + 1) * scale;
const midX = ((t.box.x0 + t.box.x1 + 1) / 2) * scale;

/* Registered on the FIRST frame, not on the common box.
 *
 * The box spans every frame of the cycle, so aligning its bottom to the foot
 * line aligns the LOWEST frame -- and in a cycle that deliberately moves, that
 * is not the frame that has to line up. A death topple sinks 25px as it falls,
 * so registering by the box put the body 3 world units in the air at the
 * instant it died and settled it on the ground only once it was flat: the body
 * hopped up to fall over.
 *
 * Frame 0 is the frame that stands in for the pose the body was already in, so
 * frame 0 is what goes on the foot line. Everything after it keeps its own
 * offset inside the box, which is the whole reason the box is shared.
 */
const first = bounds(pngs[0].png, pngs[0].file);
const oy = Math.round(footY - (first.y1 - box.y0 + 1) * (H / bh));

/* A broad pose gets a broader canvas rather than a haircut.
 *
 * The forged frames are square and sized for the forged bodies, which are
 * narrow: the shaman's figure is 57x101 inside a 108x108 frame. A reference
 * creature with a wingspan does not fit that, and squeezing it to fit costs
 * the one thing the whole sizing rule exists to protect -- its height. Worse,
 * it costs a DIFFERENT amount per pose, so the body changed height when it
 * started casting.
 *
 * So the canvas widens instead. Symmetrically about the OLD canvas centre,
 * because that centre is the body's position on the floor: move it and every
 * frame shifts sideways. Only the width moves; the height stays exactly
 * forged-height x scale, which is what the packer reads the draw scale from.
 */
const half = Math.max(CW / 2 - midX, midX - CW / 2) + W / 2;
const CWo = Math.max(CW, 2 * Math.ceil(half));
const ox = Math.round(CWo / 2 + (midX - CW / 2) - W / 2);
if (CWo > CW) {
  console.log('  canvas widened to ' + CWo + 'px (from ' + CW +
              ') to hold a figure ' + W + 'px across at full height');
}

const dst = path.join(CUSTOM, folder);
fs.mkdirSync(dst, { recursive: true });

console.log((cycle ? pngs.length + ' frames' : path.basename(sources[0])) +
            '  ->  common box ' + bw + 'x' + bh + '  ->  figure ' + W + 'x' + H +
            ' on a ' + CWo + 'x' + CH + ' canvas');
console.log('  matched to ' + t.from + ': figure ' + fw + 'x' + fh +
            ' in a ' + t.w + 'x' + t.h + ' frame, at ' + scale + 'x');

pngs.forEach((p, i) => {
  const fig = resample(cut(p.png, box), W, H);
  const out = new PNG({ width: CWo, height: CH });
  out.data.fill(0);
  // Clipped rather than trusted: a rounding of ox/oy that lands one pixel off
  // the canvas is a thrown exception in bitblt and a lost afternoon.
  const sx = Math.max(0, -ox), sy = Math.max(0, -oy);
  const w = Math.min(W - sx, CWo - Math.max(0, ox));
  const h = Math.min(H - sy, CH - Math.max(0, oy));
  if (w > 0 && h > 0) {
    PNG.bitblt(fig, out, sx, sy, w, h, Math.max(0, ox), Math.max(0, oy));
  }
  const fname = cycle ? name + '-' + i : name;
  fs.writeFileSync(path.join(dst, fname + '.png'), PNG.sync.write(out));
  console.log('  art-custom/' + folder + '/' + fname + '.png   <- ' + path.basename(p.file));
});
