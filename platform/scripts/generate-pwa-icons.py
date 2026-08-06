# Generate MakeReady PWA / home-screen icons from the brand artwork.
# Crops the mountain mark out of public/makeready-logo.png (already background-
# transparent) and centers it on the brand navy tile. Run: python scripts/generate-pwa-icons.py
from PIL import Image

NAVY = (15, 23, 42, 255)  # #0f172a
SRC = "public/makeready-logo.png"

im = Image.open(SRC).convert("RGBA")
w, h = im.size
px = im.load()

# Find the gap between the mark (top) and the wordmark to crop just the mark.
maxr = 0
rows = []
for y in range(h):
    s = sum(px[x, y][3] for x in range(0, w, 2))
    rows.append(s)
    maxr = max(maxr, s)
mark_bottom = int(h * 0.46)
seen = False
for y in range(h):
    if rows[y] > maxr * 0.02:
        seen = True
    elif seen and rows[y] <= maxr * 0.02:
        j = y
        while j < h and rows[j] <= maxr * 0.02:
            j += 1
        if j - y > h * 0.03:
            mark_bottom = y
            break
mark = im.crop((0, 0, w, mark_bottom))
mark = mark.crop(mark.getbbox())

# The artwork is black; recolor the mark white so it reads on the navy tile
# (keep its alpha shape).
white_mark = Image.new("RGBA", mark.size, (255, 255, 255, 0))
white_mark.putalpha(mark.getchannel("A"))
mark = white_mark

def render(size):
    canvas = Image.new("RGBA", (size, size), NAVY)  # full-bleed (any + maskable)
    scale = min(size * 0.64 / mark.width, size * 0.64 / mark.height)
    m = mark.resize((max(1, int(mark.width * scale)), max(1, int(mark.height * scale))), Image.LANCZOS)
    canvas.alpha_composite(m, ((size - m.width) // 2, (size - m.height) // 2))
    return canvas

for name, size in [("icon-192.png", 192), ("icon-512.png", 512), ("apple-touch-icon.png", 180)]:
    render(size).save("public/" + name)
    print("wrote public/" + name, f"({size}px)")
