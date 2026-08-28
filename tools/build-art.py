#!/usr/bin/env python3
"""Cuts the pixel-art sheets in assets/ into the two strips index.html carries,
grades them into the delve's palette, and patches index.html in place.

The game ships as one self-contained index.html with no external files, so the
art lives inside it as base64 data URIs rather than beside it. The sheets stay
in assets/ so this is reproducible; only the strips are embedded.

    python3 tools/build-art.py

Both source sheets are laid out the same way: a 48px horizontal period holding
the same item twice -- a 12px icon at +2 and a 17px one at +23 -- on rows of 32
starting at y=7. Measured off the transparent gutters rather than assumed; the
17px ones are what gets cut, since the icons are drawn at 20 and 28 and
upscaling pixel art beats downscaling it.
"""
import base64, io, os, re, sys, colorsys
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A = lambda n: os.path.join(ROOT, 'assets', n)

BIG, CELL = 17, 20          # glyph size, and the cell it is centred in
PERIOD, ROW, X0, Y0 = 48, 32, 23, 7


def grade(im, sat=0.62, floor=0.12, span=0.80, warm=0.06):
    """Pull the saturation down, lift the floor off pure black, bias warm. The
    sheets are bright high-fantasy; the delve is lit by firelight and has no
    pure blacks in it, so ungraded art sits on top of the game rather than in
    it."""
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            hh, ss, vv = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
            hh = (hh + warm * (0.5 - abs(hh - 0.08))) % 1.0
            r2, g2, b2 = colorsys.hsv_to_rgb(hh, min(1, ss * sat), min(1, floor + vv * span))
            px[x, y] = (int(r2 * 255), int(g2 * 255), int(b2 * 255), a)
    return im


# Neither sheet has a belt in it -- the nearest thing is a crate, and that is
# what it read as. Drawn here instead, in leather and gold ramps sampled off
# the sheets so it sits with the cut ones rather than beside them.
LEATHER_DK, LEATHER, LEATHER_LT = (61, 33, 30), (91, 58, 51), (120, 78, 63)
GOLD_DK, GOLD, GOLD_LT = (149, 83, 63), (208, 143, 66), (227, 175, 63)


def draw_girdle(size):
    im = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    k = size / 16.0
    S = lambda v: int(round(v * k))
    d.rectangle([S(1), S(6), S(14), S(10)], fill=LEATHER_DK)       # strap in shadow
    d.rectangle([S(1), S(6), S(14), S(8)], fill=LEATHER)           # lit along the top
    d.rectangle([S(2), S(6), S(13), S(6)], fill=LEATHER_LT)
    for x in (3, 6, 11):                                           # punched holes
        d.rectangle([S(x), S(8), S(x), S(8)], fill=(30, 18, 16))
    d.rectangle([S(6), S(4), S(11), S(12)], fill=GOLD_DK)          # the buckle
    d.rectangle([S(7), S(5), S(10), S(11)], fill=GOLD)
    d.rectangle([S(8), S(6), S(9), S(10)], fill=LEATHER_DK)        # its window
    d.rectangle([S(7), S(5), S(10), S(5)], fill=GOLD_LT)
    return im


def glyph(sheet, col, row):
    return sheet.crop((X0 + PERIOD * col, Y0 + ROW * row,
                       X0 + PERIOD * col + BIG, Y0 + ROW * row + BIG))


# Which cell is which. 'g' is the gear sheet, 'i' the items one. The first ten
# are the slot fallbacks and the three loose glyphs, in the order the old
# ICON map used, so nothing that only knows a slot has to change. Everything
# after is a base, so a Falchion and a Glaive stop looking identical.
ICONS = [
    ('blade',   'g', 6, 6), ('offhand', 'g', 0, 10), ('mail',   'g', 10, 2),
    ('girdle',  None, 0, 0), ('boots',  'g', 2, 0),  ('amulet', 'i', 1, 5),
    ('ring',    'i', 2, 5), ('coin',    'i', 4, 2),  ('skull',  'g', 3, 4),
    ('gem',     'i', 5, 5),

    ('Longsword', 'g', 6, 6),  ('Falchion', 'g', 11, 5), ('Warblade', 'g', 8, 6),
    ('Glaive',    'g', 11, 8), ('Cleaver',  'g', 2, 9),

    # not r10c6 for the tower: it is a plain wooden rectangle and it read as
    # a door sitting in the bag
    ('Kite Shield', 'g', 0, 10), ('Buckler', 'g', 11, 10),
    ('Warding Focus', 'g', 4, 10), ('Tower Shield', 'g', 8, 10),

    ('Ringmail', 'g', 10, 2), ('Scale Hauberk', 'g', 10, 1),
    ('Plated Coat', 'g', 4, 3), ('Padded Jack', 'g', 7, 0),

    ('Leather Girdle', None, 0, 0), ('Plated Belt', 'i', 9, 3),
    ('Sash of Cord', 'i', 5, 2),

    ('Marching Boots', 'g', 2, 0), ('Greaves', 'g', 11, 3),
    ('Soft Treads', 'g', 5, 0),

    ('Bone Amulet', 'i', 0, 5), ('Ley-Charm', 'i', 1, 5), ('Sun Pendant', 'i', 7, 4),

    ('Iron Band', 'i', 2, 5), ('Signet', 'i', 8, 4), ('Twisted Ring', 'i', 9, 4),
]

# Scenery, cut from the dungeon sheets. Each entry is a generous source rect;
# it is trimmed to its own content and centred in the cell, so the rects only
# have to contain the object rather than fit it. Four variants a kind, picked
# by the prop's existing random q -- variety without rotating a bitmap that has
# an up.
PROP_CELL = 48
# Every rect below came out of a connected-component scan of the sheet, not
# off a grid: the objects sit on a 16px grid but most of them are two or three
# cells across and none is centred in its cell, so rects guessed off the grid
# caught half of one object and a corner of the next.
PROPS = {
    # bone-and-skull piles, all 32x16
    'bones': ('relics', 1.0, [(105, 167, 32, 16), (64, 176, 32, 16),
                              (41, 211, 32, 16), (0, 212, 32, 16)]),
    # spoil heaps. Graded gently: at the scenery grade they came out sand-
    # coloured, and a heap of coin that is not gold is a heap of gravel.
    # Picked by hue, not by region: selecting on the gold band by position
    # caught the open chests sitting in it and only one heap of the four.
    'coins': ('relics', 0.78, [(117, 54, 22, 17), (5, 98, 22, 17),
                               (87, 103, 19, 17), (144, 55, 16, 12)]),
    # single skulls, small -- drawn larger than they are cut
    'hornskull': ('relics', 1.0, [(58, 322, 13, 12), (139, 321, 11, 14),
                                  (33, 330, 13, 12), (115, 328, 11, 14)]),
    # sarcophagi: an ornate upright, one with the occupant showing, a lidded
    # slab and a big open altar
    'tomb': ('tombs', 1.0, [(7, 6, 25, 55), (103, 9, 25, 52),
                            (81, 79, 46, 33), (15, 77, 49, 35)]),
}
PROP_ORDER = ['bones', 'coins', 'hornskull', 'tomb']


def strip_props():
    src = {'relics': Image.open(A('sheet-relics.png')).convert('RGBA'),
           'tombs':  Image.open(A('sheet-tombs.png')).convert('RGBA')}
    out = Image.new('RGBA', (PROP_CELL * 4, PROP_CELL * len(PROP_ORDER)), (0, 0, 0, 0))
    for r, kind in enumerate(PROP_ORDER):
        which, satmul, rects = PROPS[kind]
        for c, (x, y, w, h) in enumerate(rects):
            cut = src[which].crop((x, y, x + w, y + h))
            bb = cut.getbbox()
            if bb:
                cut = cut.crop(bb)
            if cut.size[0] > PROP_CELL or cut.size[1] > PROP_CELL:
                k = min(PROP_CELL / cut.size[0], PROP_CELL / cut.size[1])
                cut = cut.resize((max(1, int(cut.size[0] * k)),
                                  max(1, int(cut.size[1] * k))), Image.NEAREST)
            # centred across, sitting on the floor of the cell
            out.paste(grade(cut.copy(), sat=0.46 / satmul, floor=0.10, span=0.70),
                      (c * PROP_CELL + (PROP_CELL - cut.size[0]) // 2,
                       r * PROP_CELL + PROP_CELL - cut.size[1]))
    return out


# The two coffers, and the four frames each takes to come open.
CHESTS = [('coffer', 5), ('warded', 7)]
CHEST_C, CHEST_FRAMES = 32, 4


def strip_icons():
    g = Image.open(A('sheet-gear.png')).convert('RGBA')
    i = Image.open(A('sheet-items.png')).convert('RGBA')
    out = Image.new('RGBA', (CELL * len(ICONS), CELL), (0, 0, 0, 0))
    keys = []
    for n, (key, which, col, row) in enumerate(ICONS):
        cut = draw_girdle(BIG) if which is None else glyph(g if which == 'g' else i, col, row)
        out.paste(grade(cut.copy()), (n * CELL + (CELL - BIG) // 2, (CELL - BIG) // 2))
        keys.append(key)
    return out, keys


def strip_chests():
    s = Image.open(A('sheet-chests.png')).convert('RGBA')
    out = Image.new('RGBA', (CHEST_C * CHEST_FRAMES, CHEST_C * len(CHESTS)), (0, 0, 0, 0))
    for r, (_, col) in enumerate(CHESTS):
        for f in range(CHEST_FRAMES):
            cut = s.crop((col * CHEST_C, f * CHEST_C, (col + 1) * CHEST_C, (f + 1) * CHEST_C))
            # Harder than the icons: these sit in the world beside painted
            # stone rather than on a flat dark panel, and at the icon grade
            # they read as stickers laid on the floor.
            out.paste(grade(cut.copy(), sat=0.46, floor=0.10, span=0.70),
                      (f * CHEST_C, r * CHEST_C))
    return out


def uri(im):
    buf = io.BytesIO()
    im.save(buf, 'PNG', optimize=True)
    return 'data:image/png;base64,' + base64.b64encode(buf.getvalue()).decode()


def patch(src, pattern, value, label):
    new, n = re.subn(pattern, lambda m: m.group(1) + value + m.group(3), src, count=1)
    if n != 1:
        sys.exit('could not patch ' + label + ' (matched ' + str(n) + ' times)')
    print('  %-16s %d bytes' % (label, len(value)))
    return new


def main():
    icons, keys = strip_icons()
    chests = strip_chests()
    scenery = strip_props()
    iu, cu, pu = uri(icons), uri(chests), uri(scenery)
    print('icon strip   %dx%d, %d cells' % (icons.size[0], icons.size[1], len(keys)))
    print('chest strip  %dx%d' % chests.size)
    print('prop strip   %dx%d, %s' % (scenery.size[0], scenery.size[1],
                                      ', '.join(PROP_ORDER)))

    p = os.path.join(ROOT, 'index.html')
    src = open(p, encoding='utf-8').read()
    src = patch(src, r'(--icons:url\()(data:image/png;base64,[A-Za-z0-9+/=]+)(\))',
                iu, 'icons')
    src = patch(src, r"(const CHEST_SHEET = ')([^']*)(')", cu, 'chests')
    # the strip width has to match the cell count or every icon is the wrong one
    src = patch(src, r"(const PROP_SHEET = ')([^']*)(')", pu, 'props')
    src = patch(src, r'(calc\(var\(--sz,32px\) \* )(\d+)(\))', str(len(keys)), 'cell count')
    open(p, 'w', encoding='utf-8').write(src)
    print('index.html patched')


if __name__ == '__main__':
    main()
