"""One-off asset prep. Reads brand/ and writes src/assets/. Run: python -I scripts/prep-assets.py"""
import numpy as np
from PIL import Image
B = "brand/"
OPAQUE = B + "LOGO HOLDORA PNG.png"            # IHDR colourtype 2, no alpha
ALPHA = B + "LOGO HOLDORA PNG...png"           # IHDR colourtype 6, pure-black transparent regions
OUT = "src/assets/"

# 1. transparent mark: premultiplied resize (transparent pixels are rgb 0,0,0 -> would fringe dark)
a = Image.open(ALPHA).convert("RGBA")
bbox = a.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
pad = 40
crop = a.crop((bbox[0]-pad, bbox[1]-pad, bbox[2]+pad, bbox[3]+pad))
w, h = crop.size
for width, name in ((720, "mark-720.png"), (192, "mark-192.png")):
    r = crop.convert("RGBa").resize((width, round(h*width/w)), Image.LANCZOS).convert("RGBA")
    r.save(OUT + name, optimize=True)

# 2. opaque brand tile
o = Image.open(OPAQUE).convert("RGB")
for s, name in ((512, "logo-512.png"), (96, "logo-96.png"), (64, "icon-64.png")):
    o.resize((s, s), Image.LANCZOS).save(OUT + name, optimize=True)

# 3. favicon traced from the real pixel grid of the opaque logo
px = np.array(o).astype(int)
white = (px.sum(2) > 3*200)
ys, xs = np.where(white)
x0, x1, y0, y1 = xs.min(), xs.max()+1, ys.min(), ys.max()+1
bg = tuple(px[0, 0]); fg = tuple(px[584, 477])
cols = 26
cell = (x1-x0)/cols
rows = int(round((y1-y0)/cell))
ox = (32-cols)/2; oy = (32-rows)/2
d = []
for r in range(rows):
    c = 0
    row = []
    for c in range(cols):
        blk = white[int(y0+r*cell):int(y0+(r+1)*cell), int(x0+c*cell):int(x0+(c+1)*cell)]
        row.append(blk.mean() > 0.5)
    c = 0
    while c < cols:
        if row[c]:
            s = c
            while c < cols and row[c]: c += 1
            d.append(f"M{ox+s:g} {oy+r:g}h{c-s}v1h-{c-s}z")
        else: c += 1
hexc = lambda t: "#%02x%02x%02x" % t
svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" shape-rendering="crispEdges">'
       f'<rect width="32" height="32" rx="6" fill="{hexc(bg)}"/><path fill="{hexc(fg)}" d="{"".join(d)}"/></svg>')
assert "--" not in svg
open(OUT + "favicon.svg", "w").write(svg)
print("bbox", (x0, x1, y0, y1), "grid", cols, rows, hexc(bg), hexc(fg), len(svg))
