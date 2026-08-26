#!/usr/bin/env python3
"""Cuts the item icons out of the supplied pixel-art sheet, grades them into
the delve's palette, and prints the base64 data URI that index.html embeds.

The game ships as one self-contained index.html with no external files, so the
icons live inside it as a data URI rather than beside it. Re-run this only if
the source sheet changes:

    python3 tools/build-icons.py <path-to-icon-sheet.png>

The sheet is a 6x19 grid of 16px cells. Only the eleven cells named below are
taken; the rest of it is bright fantasy UI art that does not belong in this
game. There is no belt in the sheet, so the girdle is drawn here in the same
leather-and-gold ramps sampled off the boot at (2,8) and the coin at (1,9).
"""
import sys, base64, io, colorsys
from PIL import Image, ImageDraw

C = 16
CELLS = [('blade', 0, 8), ('offhand', 1, 8), ('mail', 5, 6), ('girdle', None, None),
         ('boots', 2, 8), ('amulet', 0, 9), ('ring', 5, 8),
         ('coin', 1, 9), ('skull', 0, 0), ('gem', 5, 10)]

# sampled from the sheet's own leather and gold, so the drawn piece sits with
# the cut ones rather than beside them
LEATHER_DK, LEATHER, LEATHER_LT = (61, 33, 30), (91, 58, 51), (120, 78, 63)
GOLD_DK, GOLD, GOLD_LT = (149, 83, 63), (208, 143, 66), (227, 175, 63)


def draw_girdle():
    im = Image.new('RGBA', (C, C), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rectangle([1, 6, 14, 10], fill=LEATHER_DK)          # the strap, in shadow
    d.rectangle([1, 6, 14, 8], fill=LEATHER)              # lit along the top
    d.rectangle([2, 6, 13, 6], fill=LEATHER_LT)
    for x in (3, 6, 11):                                  # punched holes
        d.point((x, 8), fill=(30, 18, 16))
    d.rectangle([6, 4, 11, 12], fill=GOLD_DK)             # the buckle
    d.rectangle([7, 5, 10, 11], fill=GOLD)
    d.rectangle([8, 6, 9, 10], fill=LEATHER_DK)           # its window
    d.rectangle([7, 5, 10, 5], fill=GOLD_LT)
    d.rectangle([10, 7, 13, 8], fill=LEATHER_LT)          # the tongue
    return im


def grade(im):
    """Less candy, a lifted shadow floor, and a warm bias -- the colour of
    lamplight on metal. The value structure is left alone so the shapes still
    read at sixteen pixels against near-black."""
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            h, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            s *= 0.62
            v = 0.12 + v * 0.80
            r2, g2, b2 = colorsys.hsv_to_rgb(h, s, v)
            px[x, y] = (int(min(1, r2 * 1.06 + 0.02) * 255),
                        int(min(1, g2 * 1.00 + 0.012) * 255),
                        int(b2 * 0.92 * 255), a)
    return im


def main():
    src = Image.open(sys.argv[1]).convert('RGBA')
    strip = Image.new('RGBA', (C * len(CELLS), C), (0, 0, 0, 0))
    for i, (name, gx, gy) in enumerate(CELLS):
        cell = draw_girdle() if gx is None else src.crop((gx * C, gy * C, gx * C + C, gy * C + C))
        strip.paste(cell, (i * C, 0))
    grade(strip)
    buf = io.BytesIO()
    strip.save(buf, format='PNG', optimize=True)
    raw = buf.getvalue()
    print('/* %d icons, %dx%d, %d bytes */' % (len(CELLS), strip.width, strip.height, len(raw)),
          file=sys.stderr)
    print('order: ' + ','.join(n for n, _, _ in CELLS), file=sys.stderr)
    print('data:image/png;base64,' + base64.b64encode(raw).decode())


main()
