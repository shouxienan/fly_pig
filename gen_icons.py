#!/usr/bin/env python3
"""Generate cute piggy app icons for Piggy Can Fly! (supersampled for smooth edges)."""
import os
from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(__file__), "icons")
os.makedirs(OUT, exist_ok=True)

SS = 4  # supersample factor for antialiasing


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def draw_icon(size, maskable=False):
    S = size * SS
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # --- background: vertical pink gradient, full bleed square ---
    top, bot = (255, 194, 226), (255, 120, 182)
    for y in range(S):
        d.line([(0, y), (S, y)], fill=lerp(top, bot, y / S))

    # sparkles in the corners
    for (fx, fy, r) in [(0.16, 0.18, 0.030), (0.85, 0.22, 0.022), (0.20, 0.82, 0.020), (0.82, 0.80, 0.028)]:
        cx, cy, rr = fx * S, fy * S, r * S
        d.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=(255, 255, 255, 210))

    # piggy is a bit smaller on maskable icons (safe zone)
    scale = 0.62 if maskable else 0.72
    cx, cy = S * 0.5, S * 0.53
    R = S * scale * 0.5  # head radius

    def circle(x, y, r, fill):
        d.ellipse([x - r, y - r, x + r, y + r], fill=fill)

    # white wings behind
    for sgn in (-1, 1):
        wx = cx + sgn * R * 0.95
        d.ellipse([wx - R * 0.55, cy - R * 0.55, wx + R * 0.55, cy - R * 0.05],
                  fill=(255, 255, 255, 235))

    # ears
    ear = (255, 150, 198)
    for sgn in (-1, 1):
        bx = cx + sgn * R * 0.5
        d.polygon([(bx, cy - R * 0.78), (bx + sgn * R * 0.42, cy - R * 1.25),
                   (bx + sgn * R * 0.55, cy - R * 0.62)], fill=ear)

    # head/body
    circle(cx, cy, R, (255, 178, 214))
    circle(cx, cy, R * 0.985, (255, 194, 224))  # subtle lighter fill

    # blush cheeks
    for sgn in (-1, 1):
        circle(cx + sgn * R * 0.55, cy + R * 0.22, R * 0.18, (255, 120, 168, 150))

    # eyes
    for sgn in (-1, 1):
        ex, ey = cx + sgn * R * 0.34, cy - R * 0.16
        circle(ex, ey, R * 0.13, (74, 43, 58))
        circle(ex + R * 0.05, ey - R * 0.05, R * 0.05, (255, 255, 255))

    # snout
    sx, sy = cx, cy + R * 0.32
    d.ellipse([sx - R * 0.36, sy - R * 0.26, sx + R * 0.36, sy + R * 0.26], fill=(255, 134, 189))
    for sgn in (-1, 1):
        circle(sx + sgn * R * 0.13, sy, R * 0.065, (232, 95, 160))

    # smile
    d.arc([cx - R * 0.24, cy + R * 0.42, cx + R * 0.24, cy + R * 0.72],
          start=15, end=165, fill=(201, 79, 134), width=max(2, int(R * 0.05)))

    return img.resize((size, size), Image.LANCZOS)


for name, size, mask in [
    ("icon-180.png", 180, False),
    ("icon-192.png", 192, False),
    ("icon-512.png", 512, False),
    ("icon-512-maskable.png", 512, True),
]:
    draw_icon(size, mask).save(os.path.join(OUT, name))
    print("wrote", name)
