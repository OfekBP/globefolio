"""Builds the GlobeFolio logo files with the wordmark converted to outlines (no font needed to display them).

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
KERN = {("G", "l"): 0.0, ("F", "o"): -0.02, ("o", "l"): 0.0}
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
    """Returns (svg path markup, width) for 'GlobeFolio' set at `size` px."""
    s = size / upm
    x = x0
    out = []
    text = "GlobeFolio"
    for i, ch in enumerate(text):
        name = cmap[ord("ı")] if ch == "i" and i == 8 else cmap[ord(ch)]
        pen = SVGPathPen(gs)
        gs[name].draw(TransformPen(pen, (s, 0, 0, -s, x, baseline)))
        d = pen.getCommands()
        if d:
            out.append(f'<path d="{d}" fill="{color}"/>')
        if ch == "i" and i == 8:
            cx, cy, r = dot_of_i()
            out.append(f'<circle cx="{x + cx * s:.2f}" cy="{baseline - cy * s:.2f}" r="{r * s * 1.06:.2f}" fill="{dot_color}"/>')
        adv = gs[name].width * s
        nxt = text[i + 1] if i + 1 < len(text) else ""
        x += adv + (KERN.get((ch, nxt), 0) + TRACK) * size
    return "".join(out), x - x0


def mark(x=0, y=0, size=64, tile=True, ink=None):
    """The mark: a little globe with a pin dropped on it. `tile=False` draws it on transparent."""
    k = size / 64
    ring = CHALK if tile else LAGOON
    edge = CHALK if tile else "var(--hole,#fff)"
    t = f'<rect width="64" height="64" rx="18" fill="{CORAL}"/>' if tile else ""
    cid = f"g{int(x)}{int(y)}{size}{int(tile)}"
    return (
        f'<g transform="translate({x} {y}) scale({k})">{t}'
        f'<g transform="translate(32 32) scale(.86) translate(-30.5 -32.7)"><defs><clipPath id="{cid}"><circle cx="30" cy="36" r="22.5"/></clipPath></defs>'
        f'<circle cx="30" cy="36" r="22.5" fill="#A9DCF0"/>'
        f'<g clip-path="url(#{cid})"><g transform="translate(30 36) scale(1.13) translate(-30 -35)">'
        f'<path d="M12 27c4-4 10-5 13-2s0 6-2 8-1 6-4 9-8 0-9-6-1-6 2-9z" fill="#7ED6B0"/>'
        f'<path d="M34 24c4-3 9-2 12 1s0 7-3 9-1 8-5 10-7-3-6-8 0-8 2-12z" fill="#7ED6B0"/>'
        f'<circle cx="37" cy="49" r="3.4" fill="{SUN}"/>'
        f'<ellipse cx="30" cy="35" rx="9" ry="20" fill="none" stroke="#fff" stroke-width="1" opacity=".55"/>'
        f'<path d="M10 35h40" stroke="#fff" stroke-width="1" opacity=".55"/></g></g>'
        f'<circle cx="30" cy="36" r="22.5" fill="none" stroke="{ring}" stroke-width="2.8"/>'
        f'<path d="M45 7c-4.6 0-8.4 3.5-8.4 7.9C36.6 21.5 45 30 45 30s8.4-8.5 8.4-15.1C53.4 10.5 49.6 7 45 7z" fill="{BLUSH}" stroke="{edge}" stroke-width="2.2" stroke-linejoin="round"/>'
        f'<circle cx="45" cy="14.6" r="3" fill="{CHALK}"/></g></g>'
    )


def svg(w, h, body, title="GlobeFolio"):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w:.0f}" height="{h:.0f}" viewBox="0 0 {w:.2f} {h:.2f}" role="img" aria-label="{title}">'
            f'<title>{title}</title>{body}</svg>\n')


out = Path("public/brand")
out.mkdir(parents=True, exist_ok=True)

# symbols
(out / "logo-mark.svg").write_text(svg(64, 64, mark()))
(out / "favicon.svg").write_text(svg(64, 64, mark()))
(out / "logo-glyph.svg").write_text(svg(64, 64, mark(tile=False), "GlobeFolio mark"))

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
