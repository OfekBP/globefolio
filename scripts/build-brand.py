"""Builds the Tripglobe logo files with the wordmark converted to outlines (no font needed to display them).

    python scripts/build-brand.py <BricolageGrotesque variable .ttf>

Writes SVGs to public/brand/. Requires fontTools (pip install fonttools).
"""
import sys
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.recordingPen import DecomposingRecordingPen

LAGOON, INK, SUN, BLUSH, CREAM = "#0E7490", "#1F2A44", "#FFC93C", "#FF6F8E", "#FFF8EC"
CORAL = LAGOON  # tile colour (name kept from the first version of this script)
CHALK = CREAM

font = instancer.instantiateVariableFont(TTFont(sys.argv[1]), {"wght": 850})  # Nunito
gs = font.getGlyphSet()
cmap = font.getBestCmap()
upm = font["head"].unitsPerEm
cap = font["OS/2"].sCapHeight

# manual kerning in em (the variable font's GPOS pairs are not applied by this script)
KERN = {("T", "r"): -0.03, ("r", "i"): 0.0, ("T", "r"): -0.03, ("r", "a"): -0.004, ("a", "c"): 0.0}
TRACK = -0.006


def dot_of_i():
    """Centre and radius (font units) of the tittle in 'i', so it can be redrawn as a coral dot."""
    pen = DecomposingRecordingPen(gs)
    gs[cmap[ord("i")]].draw(pen)
    contours, cur = [], []
    for op, pts in pen.value:
        cur += [p for p in pts if p]
        if op in ("closePath", "endPath"):
            contours.append(cur)
            cur = []
    best = max(contours, key=lambda c: min(p[1] for p in c))
    xs, ys = [p[0] for p in best], [p[1] for p in best]
    return (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, (max(xs) - min(xs)) / 2


def wordmark(size, x0, baseline, color, dot_color):
    """Returns (svg path markup, width) for 'Tripglobe' set at `size` px."""
    s = size / upm
    x = x0
    out = []
    text = "Tripglobe"
    for i, ch in enumerate(text):
        name = cmap[ord("ı")] if ch == "i" and i == 2 else cmap[ord(ch)]
        pen = SVGPathPen(gs)
        gs[name].draw(TransformPen(pen, (s, 0, 0, -s, x, baseline)))
        d = pen.getCommands()
        if d:
            out.append(f'<path d="{d}" fill="{color}"/>')
        if ch == "i" and i == 2:
            cx, cy, r = dot_of_i()
            out.append(f'<circle cx="{x + cx * s:.2f}" cy="{baseline - cy * s:.2f}" r="{r * s * 1.06:.2f}" fill="{dot_color}"/>')
        adv = gs[name].width * s
        nxt = text[i + 1] if i + 1 < len(text) else ""
        x += adv + (KERN.get((ch, nxt), 0) + TRACK) * size
    return "".join(out), x - x0


def mark(x=0, y=0, size=64, tile=True, ink=None):
    """The mark: a pin riding an orbit. `tile=False` draws it on transparent with coral pin."""
    k = size / 64
    pin_fill = CHALK if tile else CORAL
    hole = CORAL if tile else "var(--hole,#fff)"
    orbit = CHALK if tile else CORAL
    gap = CORAL if tile else "var(--hole,#fff)"
    t = f'<rect width="64" height="64" rx="18" fill="{CORAL}"/>' if tile else ""
    return (
        f'<g transform="translate({x} {y}) scale({k})">{t}'
        f'<g transform="rotate(-12 32 44)">'
        f'<path d="M11 44A21 7.5 0 0 1 53 44" fill="none" stroke="{orbit}" stroke-width="3.2" stroke-linecap="round" opacity=".9"/></g>'
        f'<path d="M32 10C24.3 10 18.5 15.7 18.5 23c0 9.5 13.5 24 13.5 24s13.5-14.5 13.5-24C45.5 15.7 39.7 10 32 10z" fill="{pin_fill}"/>'
        f'<circle cx="32" cy="23" r="5.2" fill="{hole}"/>'
        f'<g transform="rotate(-12 32 44)" fill="none" stroke-linecap="round">'
        f'<path d="M11 44A21 7.5 0 0 0 53 44" stroke="{gap}" stroke-width="7"/>'
        f'<path d="M11 44A21 7.5 0 0 0 53 44" stroke="{orbit}" stroke-width="3.2"/>'
        f'<circle cx="53" cy="44" r="4.2" fill="{SUN}" stroke="{gap}" stroke-width="1.8"/></g></g>'
    )


def svg(w, h, body, title="Tripglobe"):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w:.0f}" height="{h:.0f}" viewBox="0 0 {w:.2f} {h:.2f}" role="img" aria-label="{title}">'
            f'<title>{title}</title>{body}</svg>\n')


out = Path("public/brand")
out.mkdir(parents=True, exist_ok=True)

# symbols
(out / "logo-mark.svg").write_text(svg(64, 64, mark()))
(out / "favicon.svg").write_text(svg(64, 64, mark()))
(out / "logo-glyph.svg").write_text(svg(64, 64, mark(tile=False), "Tripglobe mark"))

# horizontal lockups
SIZE = 42
cap_px = cap / upm * SIZE
baseline = 32 + cap_px / 2
for name, text_color, dot in (("logo-horizontal.svg", INK, BLUSH), ("logo-horizontal-dark.svg", CHALK, SUN)):
    wm, width = wordmark(SIZE, 80, baseline, text_color, dot)
    (out / name).write_text(svg(80 + width + 2, 64, mark() + wm))

# stacked lockup
SIZE_S = 40
wm, width = wordmark(SIZE_S, 0, 0, INK, BLUSH)
cap_s = cap / upm * SIZE_S
W = max(width, 96)
body = mark(x=(W - 96) / 2, y=0, size=96) + wordmark(SIZE_S, (W - width) / 2, 96 + 20 + cap_s, INK, BLUSH)[0]
(out / "logo-stacked.svg").write_text(svg(W, 96 + 20 + cap_s + 8, body))

# wordmark alone (for inline use at any size)
wm, width = wordmark(SIZE, 0, cap_px, INK, BLUSH)
(out / "wordmark.svg").write_text(svg(width, cap_px + 12, wm))
wm, width = wordmark(SIZE, 0, cap_px, CHALK, SUN)
(out / "wordmark-dark.svg").write_text(svg(width, cap_px + 12, wm))
print("brand files:", sorted(p.name for p in out.iterdir()))
