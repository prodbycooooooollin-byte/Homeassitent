#!/usr/bin/env python3
"""Deadlock - Anime-Test (30s). Prozedural gezeichnet mit Pillow + numpy, gemuxt mit ffmpeg.

Fan-Projekt, nicht offiziell von Valve. Aufruf: python3 make_video.py [out.mp4]
"""
import math, random, subprocess, sys, wave
from multiprocessing import Pool
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H, FPS, DUR = 1280, 720, 24, 30
N = FPS * DUR
GROUND = 575
AMBER = (255, 170, 40)      # Hidden King / Amber Hand
SAPPH = (60, 150, 255)      # Archmother / Sapphire Flame
INK = (9, 9, 16)

FB = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FS = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"


def font(path, size):
    try:
        return ImageFont.truetype(path, size)
    except Exception:
        return ImageFont.load_default()


def lerp(a, b, t):
    return a + (b - a) * t


def clamp(x, a=0.0, b=1.0):
    return max(a, min(b, x))


def ease(t):
    t = clamp(t)
    return t * t * (3 - 2 * t)


# ---------------------------------------------------------------- Hintergrund
BW, BH = int(W * 1.35), int(H * 1.35)


def build_bg():
    rnd = random.Random(7)
    arr = np.zeros((BH, BW, 3), np.float32)
    top, mid, bot = np.array([8, 10, 28]), np.array([48, 22, 70]), np.array([170, 70, 60])
    for y in range(BH):
        t = y / (GROUND * 1.35)
        t = clamp(t)
        c = top + (mid - top) * ease(t * 1.6) if t < 0.62 else mid + (bot - mid) * ((t - 0.62) / 0.38)
        arr[y, :] = c
    img = Image.fromarray(arr.astype(np.uint8))
    d = ImageDraw.Draw(img)
    # Sterne
    for _ in range(140):
        x, y = rnd.randrange(BW), rnd.randrange(int(BH * 0.4))
        d.point((x, y), fill=(220, 220, 255))
    # Gebaeude-Layer
    layers = [(0.30, (26, 18, 46), 120, 330), (0.20, (16, 12, 30), 150, 420), (0.12, (8, 7, 16), 190, 520)]
    base_y = int(GROUND * 1.35) + 40
    for _, col, hmin, hmax in layers:
        x = -20
        while x < BW:
            w = rnd.randrange(60, 150)
            h = rnd.randrange(hmin, hmax)
            d.rectangle([x, base_y - h, x + w, base_y + 200], fill=col)
            if rnd.random() < 0.3:  # Antenne / Spitze
                d.polygon([(x + w // 2 - 8, base_y - h), (x + w // 2, base_y - h - rnd.randrange(30, 90)), (x + w // 2 + 8, base_y - h)], fill=col)
            for wy in range(base_y - h + 14, base_y - 10, 22):
                for wx in range(x + 8, x + w - 8, 18):
                    if rnd.random() < 0.18:
                        d.rectangle([wx, wy, wx + 7, wy + 10], fill=(255, 205, 110) if rnd.random() < .7 else (150, 200, 255))
            x += w + rnd.randrange(-10, 14)
    # Statue-of-Liberty-Silhouette (Archmother-Maske-Anspielung) hinten rechts
    sx, sy = int(BW * 0.78), base_y - 250
    d.polygon([(sx - 22, sy), (sx + 22, sy), (sx + 30, sy + 200), (sx - 30, sy + 200)], fill=(14, 11, 26))
    d.ellipse([sx - 20, sy - 36, sx + 20, sy + 4], fill=(14, 11, 26))
    for k in range(-3, 4):
        a = math.radians(-90 + k * 22)
        d.line([(sx, sy - 28), (sx + math.cos(a) * 46, sy - 28 + math.sin(a) * 46)], fill=(14, 11, 26), width=5)
    d.line([(sx + 20, sy + 40), (sx + 44, sy - 70)], fill=(14, 11, 26), width=9)
    # Strasse
    d.rectangle([0, int(GROUND * 1.35) + 20, BW, BH], fill=(10, 8, 18))
    return img


BG = None
GLOW_CACHE = {}


def cam(zoom, cx, cy):
    """Ausschnitt aus dem Hintergrund (cx,cy in 0..1)."""
    bw, bh = W / zoom, H / zoom
    x0 = clamp(cx * BW - bw / 2, 0, BW - bw)
    y0 = clamp(cy * BH - bh / 2, 0, BH - bh)
    return BG.crop((int(x0), int(y0), int(x0 + bw), int(y0 + bh))).resize((W, H), Image.BILINEAR)


def glow(img, pos, radius, color, strength=1.0):
    layer = Image.new("RGB", (W, H), (0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.ellipse([pos[0] - radius, pos[1] - radius, pos[0] + radius, pos[1] + radius], fill=tuple(int(c * strength) for c in color))
    layer = layer.filter(ImageFilter.GaussianBlur(radius * 0.7))
    a = np.asarray(img, np.float32) + np.asarray(layer, np.float32)
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


def rain(img, t, density=110, slant=-0.25, alpha=70):
    ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    r = random.Random(int(t * FPS))
    for _ in range(density):
        x, y = r.randrange(-100, W), r.randrange(-40, H)
        l = r.randrange(24, 60)
        d.line([(x, y), (x + slant * l, y + l)], fill=(190, 210, 255, alpha), width=1)
    return Image.alpha_composite(img.convert("RGBA"), ov).convert("RGB")


def speed_lines(img, center, t, color=(255, 255, 255), n=70, inner=140, alpha=200):
    ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    r = random.Random(int(t * FPS * 2))
    for _ in range(n):
        a = r.uniform(0, math.tau)
        r0 = inner + r.uniform(0, 180)
        r1 = r0 + r.uniform(200, 900)
        wdt = r.choice([1, 2, 2, 3])
        d.line([(center[0] + math.cos(a) * r0, center[1] + math.sin(a) * r0),
                (center[0] + math.cos(a) * r1, center[1] + math.sin(a) * r1)], fill=color + (alpha,), width=wdt)
    return Image.alpha_composite(img.convert("RGBA"), ov).convert("RGB")


def horiz_lines(img, t, color=(255, 255, 255), n=40, alpha=130):
    ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    r = random.Random(int(t * FPS * 2) + 5)
    for _ in range(n):
        y = r.randrange(H)
        x = r.randrange(-200, W)
        d.line([(x, y), (x + r.randrange(200, 700), y)], fill=color + (alpha,), width=r.choice([1, 2, 3]))
    return Image.alpha_composite(img.convert("RGBA"), ov).convert("RGB")


# ---------------------------------------------------------------- Figuren
def trooper(d, x, gy, s, rim, face, ph, hit=0.0):
    """Trooper-Silhouette mit leuchtendem Auge. face=+1 schaut nach rechts."""
    sw = math.sin(ph) * 14 * s
    y0 = gy
    # Beine
    for k in (-1, 1):
        d.line([(x, y0 - 70 * s), (x + k * sw, y0)], fill=INK, width=int(11 * s))
    # Torso (leicht vorgebeugt)
    lean = 10 * s * face
    d.polygon([(x - 24 * s, y0 - 70 * s), (x + 24 * s, y0 - 70 * s), (x + 20 * s + lean, y0 - 135 * s), (x - 20 * s + lean, y0 - 135 * s)], fill=INK, outline=rim)
    # Kopf / Helm
    hx, hy = x + lean * 1.2, y0 - 150 * s
    d.ellipse([hx - 17 * s, hy - 17 * s, hx + 17 * s, hy + 17 * s], fill=INK, outline=rim)
    d.ellipse([hx + face * 5 * s - 4 * s, hy - 3 * s, hx + face * 5 * s + 4 * s, hy + 3 * s], fill=rim)
    # Waffe
    d.line([(x + lean, y0 - 105 * s), (x + face * 52 * s, y0 - 112 * s)], fill=INK, width=int(7 * s))
    d.line([(x + face * 40 * s, y0 - 112 * s), (x + face * 60 * s, y0 - 114 * s)], fill=rim, width=max(1, int(3 * s)))


def guardian(d, x, gy, s, rim):
    """Grosser Wächter / Walker-Turm mit leuchtendem Kern."""
    d.polygon([(x - 60 * s, gy), (x + 60 * s, gy), (x + 40 * s, gy - 210 * s), (x - 40 * s, gy - 210 * s)], fill=INK, outline=rim)
    d.polygon([(x - 50 * s, gy - 210 * s), (x + 50 * s, gy - 210 * s), (x, gy - 270 * s)], fill=INK, outline=rim)
    d.ellipse([x - 16 * s, gy - 160 * s, x + 16 * s, gy - 128 * s], fill=rim)


def hero(d, x, gy, s, ph, face=1, pose="run"):
    """Haze-inspirierter Held: Mantel, Schal, Messer."""
    sw = math.sin(ph) * 16 * s
    for k in (-1, 1):
        d.line([(x, gy - 80 * s), (x + k * sw, gy)], fill=(5, 5, 10), width=int(12 * s))
    # Mantel
    flare = math.sin(ph * 0.7) * 10 * s
    d.polygon([(x - 26 * s, gy - 82 * s), (x + 26 * s, gy - 82 * s), (x + 22 * s, gy - 158 * s), (x - 22 * s, gy - 158 * s)], fill=(14, 12, 24), outline=(190, 230, 255))
    d.polygon([(x - 24 * s, gy - 90 * s), (x - face * 90 * s, gy - 70 * s + flare), (x - face * 70 * s, gy - 130 * s + flare), (x - 20 * s, gy - 150 * s)], fill=(14, 12, 24))
    # Kopf + Haare
    hx, hy = x + face * 4 * s, gy - 176 * s
    d.ellipse([hx - 17 * s, hy - 19 * s, hx + 17 * s, hy + 19 * s], fill=(235, 215, 200))
    d.polygon([(hx - 20 * s, hy - 4 * s), (hx, hy - 30 * s), (hx + 20 * s, hy - 4 * s), (hx + 10 * s, hy - 14 * s - 3 * s * face), (hx - 8 * s, hy - 12 * s)], fill=(235, 238, 255))
    d.polygon([(hx - face * 16 * s, hy - 12 * s), (hx - face * 70 * s, hy - 26 * s + flare), (hx - face * 54 * s, hy - 2 * s + flare)], fill=(235, 238, 255))
    d.ellipse([hx + face * 6 * s - 3 * s, hy - 3 * s, hx + face * 6 * s + 3 * s, hy + 3 * s], fill=(255, 60, 90))
    # Schal
    d.polygon([(x - 18 * s, gy - 158 * s), (x + 18 * s, gy - 158 * s), (x - face * 80 * s, gy - 150 * s + flare * 1.3), (x - face * 70 * s, gy - 168 * s + flare)], fill=(190, 40, 70))
    # Messer
    if pose == "run":
        d.line([(x + face * 14 * s, gy - 120 * s), (x + face * 62 * s, gy - 100 * s)], fill=(230, 245, 255), width=max(2, int(4 * s)))


def slash(img, p0, p1, bend, prog, color=(255, 255, 255), width=14):
    ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    pts = []
    n = 24
    for i in range(n + 1):
        u = i / n
        if u > prog:
            break
        x = lerp(p0[0], p1[0], u)
        y = lerp(p0[1], p1[1], u) - math.sin(u * math.pi) * bend
        pts.append((x, y))
    if len(pts) > 1:
        for k, (wd, al) in enumerate(((width * 3, 70), (width * 1.6, 160), (width * 0.6, 255))):
            d.line(pts, fill=color + (al,), width=int(wd), joint="curve")
    ov = ov.filter(ImageFilter.GaussianBlur(1.2))
    return Image.alpha_composite(img.convert("RGBA"), ov).convert("RGB")


# ---------------------------------------------------------------- Szenen
def eclipse(img, t, pos, r):
    d = ImageDraw.Draw(img)
    for k in range(4):
        pass
    img = glow(img, pos, r * 2.4, (120, 70, 180), 0.55)
    img = glow(img, pos, r * 1.4, (255, 190, 120), 0.45 + 0.1 * math.sin(t * 3))
    d = ImageDraw.Draw(img)
    d.ellipse([pos[0] - r, pos[1] - r, pos[0] + r, pos[1] + r], fill=(2, 2, 6))
    # Korona-Ring
    d.ellipse([pos[0] - r - 3, pos[1] - r - 3, pos[0] + r + 3, pos[1] + r + 3], outline=(255, 230, 190), width=3)
    return img


def scene1(t):  # 0-5s: Finsternis ueber New York
    p = t / 5
    img = cam(lerp(1.0, 1.18, ease(p)), 0.5, lerp(0.55, 0.40, ease(p)))
    sc = lerp(1.0, 1.18, ease(p))
    pos = (W * 0.5, lerp(H * 0.42, H * 0.30, ease(p)))
    img = eclipse(img, t, pos, 85 * sc)
    img = rain(img, t, 90)
    # Maelstrom-Risse (Astral Gates) als dunkle Blitze
    d = ImageDraw.Draw(img)
    if 2.0 < t < 2.25 or 3.2 < t < 3.3:
        img = glow(img, (W * 0.5, H * 0.1), 500, (130, 90, 255), 0.7)
    return img


def scene2(t):  # 5-10s: zwei Patrone
    p = t / 5
    img = cam(1.0 + 0.06 * p, lerp(0.42, 0.58, p), 0.6)
    pulse = 0.85 + 0.15 * math.sin(t * 5)
    img = glow(img, (W * 0.12, H * 0.45), 420, AMBER, 0.75 * pulse)
    img = glow(img, (W * 0.88, H * 0.45), 420, SAPPH, 0.75 * pulse)
    d = ImageDraw.Draw(img)
    # Hidden King: gekroente Silhouette links, Archmother: Flamme rechts
    kx = W * 0.14
    d.polygon([(kx - 70, GROUND), (kx + 70, GROUND), (kx + 44, 220), (kx - 44, 220)], fill=INK, outline=AMBER)
    for i, ox in enumerate((-40, -20, 0, 20, 40)):
        d.polygon([(kx + ox - 10, 224), (kx + ox, 150 - (i % 2) * 30), (kx + ox + 10, 224)], fill=INK, outline=AMBER)
    d.ellipse([kx - 10, 300, kx + 10, 320], fill=AMBER)
    ax = W * 0.86
    d.polygon([(ax - 60, GROUND), (ax + 60, GROUND), (ax + 36, 260), (ax - 36, 260)], fill=INK, outline=SAPPH)
    for k in range(7):  # Strahlenkrone
        a = math.radians(-160 + k * 22)
        d.line([(ax, 235), (ax + math.cos(a) * 80, 235 + math.sin(a) * 80)], fill=SAPPH, width=5)
    d.ellipse([ax - 28, 205, ax + 28, 261], fill=INK, outline=SAPPH)
    # Flammen der Saphirflamme
    r = random.Random(int(t * 12))
    for _ in range(22):
        fx = ax + r.uniform(-44, 44)
        fy = 250 - r.uniform(0, 110)
        d.ellipse([fx - 5, fy - 9, fx + 5, fy + 9], fill=(110, 190, 255))
    # Trooper marschieren in der Mitte
    for i in range(5):
        x = lerp(W * 0.2, W * 0.46, ((t * 0.08 + i * 0.2) % 1.0)) + i * 8
        trooper(d, x, GROUND + 4, 0.8, AMBER, 1, t * 7 + i)
        x2 = lerp(W * 0.8, W * 0.54, ((t * 0.08 + i * 0.2 + 0.1) % 1.0)) - i * 8
        trooper(d, x2, GROUND + 4, 0.8, SAPPH, -1, t * 7 + i + 1)
    img = rain(img, t, 70)
    # Energie-Bruecke zwischen den Patronen
    ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    od = ImageDraw.Draw(ov)
    ph = ease(clamp((t - 2) / 2.5))
    for k in range(3):
        pts = []
        for i in range(0, 41):
            u = i / 40 * ph
            x = lerp(W * 0.14, W * 0.86, u)
            y = 130 + math.sin(u * 10 + t * 6 + k) * 20 - math.sin(u * math.pi) * 60
            pts.append((x, y))
        if len(pts) > 1:
            od.line(pts, fill=[AMBER, (255, 255, 255), SAPPH][k] + (150,), width=3)
    img = Image.alpha_composite(img.convert("RGBA"), ov).convert("RGB")
    return img


def scene3(t):  # 10-20s: Kampf auf der Strasse
    p = t / 10
    shake = (random.Random(int(t * 24)).uniform(-4, 4), random.Random(int(t * 24) + 1).uniform(-3, 3)) if (1.6 < t < 1.8 or 4.3 < t < 4.5 or 6.8 < t < 7.0 or 8.6 < t < 8.8) else (0, 0)
    img = cam(1.05 + 0.1 * math.sin(p * math.pi), 0.5 + 0.04 * math.sin(t), 0.62)
    img = glow(img, (W * 0.08, H * 0.6), 360, AMBER, 0.5)
    img = glow(img, (W * 0.92, H * 0.6), 360, SAPPH, 0.5)
    d = ImageDraw.Draw(img)
    # Guardians / Walker im Hintergrund
    guardian(d, W * 0.16, GROUND - 30, 0.9, AMBER)
    guardian(d, W * 0.84, GROUND - 30, 0.9, SAPPH)
    # Trooper-Wellen
    killed = [(2.0, 0), (3.2, 1), (4.4, 2), (5.8, 3), (7.0, 4), (8.7, 5)]
    for i in range(6):
        for team, rim, face, base in ((0, AMBER, 1, W * 0.28), (1, SAPPH, -1, W * 0.72)):
            ox = i * 38
            x = base + face * (-ox) + face * math.sin(t * 1.2 + i) * 22 + face * ease(clamp(t / 9)) * 120
            ph = t * 7 + i * 1.3 + team
            dead = None
            if team == 1:
                k = [kt for kt, ki in killed if ki == i]
                if k and t > k[0]:
                    dead = t - k[0]
            if dead is not None:
                x += dead * 230
                fade = clamp(1 - dead * 1.6)
                yy = GROUND + 4 - 90 * dead + 260 * dead * dead
                if fade > 0:
                    trooper(d, x, yy, 0.95, rim, face, ph)
                continue
            trooper(d, x, GROUND + 4, 0.95, rim, face, ph)
    # Haze rast von links nach rechts und zurueck (3 Dashes)
    seg = t % 3.3
    base_t = t
    hx = lerp(W * 0.3, W * 0.78, ease(clamp((t % 4.4) / 4.4)))
    hx = W * 0.5 + math.sin(t * 0.9) * W * 0.22
    face = 1 if math.cos(t * 0.9) > 0 else -1
    hero(d, hx, GROUND + 8, 1.15, t * 12, face)
    # Nachbilder (Dash-Trail)
    ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    od = ImageDraw.Draw(ov)
    for k in range(1, 5):
        tx = hx - face * k * 34
        od.polygon([(tx - 20, GROUND - 160), (tx + 20, GROUND - 160), (tx + 16, GROUND - 80), (tx - 16, GROUND - 80)], fill=(200, 230, 255, 70 - k * 14))
    img = Image.alpha_composite(img.convert("RGBA"), ov).convert("RGB")
    # Slashes + Treffer
    for kt, ki in killed:
        lt = t - kt
        if 0 <= lt < 0.45:
            prog = clamp(lt / 0.18)
            fx = W * 0.72 - ki * 20
            img = slash(img, (fx - 200, GROUND - 240), (fx + 160, GROUND - 40), 120, prog, (255, 255, 255), 12)
            if lt < 0.2:
                img = speed_lines(img, (fx, GROUND - 120), t, (255, 255, 255), 40, 40, 200)
            img = glow(img, (fx, GROUND - 120), 120 * (1 - lt / 0.45) + 30, (255, 255, 255), 0.8 * (1 - lt / 0.45))
    img = horiz_lines(img, t, (220, 235, 255), 22, 70)
    img = rain(img, t, 120, -0.35, 80)
    if shake != (0, 0):
        img = img.transform((W, H), Image.AFFINE, (1, 0, shake[0], 0, 1, shake[1]))
    return img


def scene4(t):  # 20-26s: Nahaufnahme - Auge
    img = Image.new("RGB", (W, H), (14, 8, 28))
    img = glow(img, (W * 0.5, H * 0.5), 520, (150, 40, 90), 0.8 + 0.1 * math.sin(t * 6))
    img = speed_lines(img, (W * 0.5, H * 0.48), t, (255, 200, 220), 90, 260, 140)
    d = ImageDraw.Draw(img)
    cx, cy = W * 0.5, H * 0.48
    blink = 0.0
    if 3.1 < t < 3.35:
        blink = math.sin((t - 3.1) / 0.25 * math.pi)
    eh = 150 * (1 - 0.9 * blink)
    ew = 440
    zoom = 1 + 0.05 * t
    ew *= zoom
    eh *= zoom
    # Augapfel
    d.ellipse([cx - ew / 2, cy - eh, cx + ew / 2, cy + eh], fill=(245, 240, 250))
    # Iris
    ir = 120 * zoom
    ix = cx + math.sin(t * 1.5) * 26
    for k in range(18):
        rr = ir * (1 - k / 18)
        col = (int(lerp(255, 120, k / 18)), int(lerp(70, 20, k / 18)), int(lerp(110, 60, k / 18)))
        d.ellipse([ix - rr, cy - rr, ix + rr, cy + rr], fill=col)
    d.ellipse([ix - 34 * zoom, cy - 66 * zoom, ix + 34 * zoom, cy + 66 * zoom], fill=(10, 4, 14))
    d.ellipse([ix - 62, cy - 78, ix - 24, cy - 40], fill=(255, 255, 255))
    d.ellipse([ix + 24, cy + 30, ix + 46, cy + 52], fill=(255, 255, 255))
    # Lidschatten (clip durch Maske)
    mask = Image.new("L", (W, H), 0)
    ImageDraw.Draw(mask).ellipse([cx - ew / 2, cy - eh, cx + ew / 2, cy + eh], fill=255)
    black = Image.new("RGB", (W, H), (14, 8, 28))
    # Oberlid / Wimpern
    d = ImageDraw.Draw(img)
    d.arc([cx - ew / 2 - 6, cy - eh - 6, cx + ew / 2 + 6, cy + eh + 6], 195, 345, fill=(5, 3, 10), width=12)
    for k in range(7):
        a = math.radians(205 + k * 21)
        x0 = cx + math.cos(a) * (ew / 2 + 2)
        y0 = cy + math.sin(a) * (eh + 2)
        d.line([(x0, y0), (x0 + math.cos(a) * 44 - 10, y0 + math.sin(a) * 34 - 8)], fill=(5, 3, 10), width=7)
    # Augenbraue
    d.line([(cx - 280, cy - 230), (cx - 60, cy - 250 + 6 * math.sin(t * 2)), (cx + 240, cy - 205)], fill=(235, 238, 255), width=16)
    # Funkeln
    for i in range(5):
        a = t * 1.1 + i * 1.26
        sx = cx + math.cos(a) * 330
        sy = cy + math.sin(a * 1.3) * 190
        s = 10 + 8 * math.sin(t * 8 + i)
        d.polygon([(sx, sy - s * 2), (sx + s * .5, sy - s * .5), (sx + s * 2, sy), (sx + s * .5, sy + s * .5), (sx, sy + s * 2), (sx - s * .5, sy + s * .5), (sx - s * 2, sy), (sx - s * .5, sy - s * .5)], fill=(255, 255, 255))
    return img


def scene5(t):  # 26-30s: Titel
    p = t / 4
    img = cam(1.0 + 0.05 * p, 0.5, 0.58)
    img = glow(img, (W * 0.2, H * 0.55), 380, AMBER, 0.55)
    img = glow(img, (W * 0.8, H * 0.55), 380, SAPPH, 0.55)
    img = eclipse(img, t, (W * 0.5, H * 0.34), 60)
    img = rain(img, t, 80)
    d = ImageDraw.Draw(img, "RGBA")
    a = int(255 * ease(t / 1.2))
    f1 = font(FS, 118)
    title = "DEADLOCK"
    bb = d.textbbox((0, 0), title, font=f1)
    tw = bb[2] - bb[0]
    x, y = (W - tw) / 2, H * 0.52
    # Diagonale Klinge hinter dem Titel
    sl = ease(t / 0.8)
    d.polygon([(x - 80, y + 130), (x - 80 + (tw + 160) * sl, y - 20), (x - 80 + (tw + 160) * sl, y), (x - 80, y + 150)], fill=(255, 255, 255, 40))
    for off, col in ((6, (0, 0, 0, a)), (0, (255, 255, 255, a))):
        d.text((x + off, y + off), title, font=f1, fill=col)
    # Farbige Unterstreichung
    d.rectangle([x, y + 150, x + tw / 2 * ease(t / 1.4), y + 156], fill=AMBER + (a,))
    d.rectangle([x + tw - tw / 2 * ease(t / 1.4), y + 150, x + tw, y + 156], fill=SAPPH + (a,))
    f2 = font(FB, 28)
    sub = "ANIME-TEST  -  Fan-Projekt, nicht offiziell von Valve"
    sb = d.textbbox((0, 0), sub, font=f2)
    d.text(((W - (sb[2] - sb[0])) / 2, y + 180), sub, font=f2, fill=(220, 225, 255, int(255 * ease((t - 1) / 1.2))))
    return img


# ---------------------------------------------------------------- Untertitel
CAPS = [
    (0.6, 4.7, "New York, 1949. Eine Finsternis riss die Tore zwischen den Welten auf."),
    (5.4, 7.6, "Zwei Patrone: der Verborgene König - und die Erzmutter."),
    (7.8, 9.8, "Wer ihr Ritual vollendet, dem erfüllen sie einen Wunsch."),
    (10.6, 14.4, "Trooper marschieren. Wächter fallen. Sechs gegen sechs."),
    (14.8, 19.4, "Und mittendrin: eine Klinge, schneller als der Regen."),
    (20.6, 25.6, "Jeder Held kämpft für seinen eigenen Wunsch."),
]


def captions(img, t):
    for a, b, text in CAPS:
        if a <= t <= b:
            al = clamp(min((t - a) / 0.4, (b - t) / 0.4))
            ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
            d = ImageDraw.Draw(ov)
            f = font(FB, 30)
            bb = d.textbbox((0, 0), text, font=f)
            tw = bb[2] - bb[0]
            x, y = (W - tw) / 2, H - 92
            d.rectangle([0, y - 20, W, y + 56], fill=(0, 0, 0, int(150 * al)))
            d.text((x + 2, y + 2), text, font=f, fill=(0, 0, 0, int(255 * al)))
            d.text((x, y), text, font=f, fill=(255, 255, 255, int(255 * al)))
            img = Image.alpha_composite(img.convert("RGBA"), ov).convert("RGB")
    return img


def letterbox(img):
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W, 46], fill=(0, 0, 0))
    d.rectangle([0, H - 46, W, H], fill=(0, 0, 0))
    return img


GRAIN = None


def post(img, t):
    a = np.asarray(img, np.float32)
    yy, xx = np.mgrid[0:H, 0:W]
    v = 1 - 0.55 * (((xx - W / 2) / (W / 2)) ** 2 + ((yy - H / 2) / (H / 2)) ** 2) * 0.5
    a *= v[..., None]
    rr = np.random.RandomState(int(t * FPS))
    a += rr.normal(0, 4, (H, W, 1))
    # leichte Anime-Farbsaettigung / Kontrast
    a = (a - 128) * 1.08 + 128
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


def frame(i):
    global BG
    if BG is None:
        BG = build_bg()
    t = i / FPS
    if t < 5:
        img = scene1(t)
    elif t < 10:
        img = scene2(t - 5)
    elif t < 20:
        img = scene3(t - 10)
    elif t < 26:
        img = scene4(t - 20)
    else:
        img = scene5(t - 26)
    # Schnitt-Blitze und Impact-Frames
    for cut in (5, 10, 20, 26):
        dt = t - cut
        if 0 <= dt < 0.25:
            img = glow(img, (W / 2, H / 2), 900, (255, 255, 255), 0.9 * (1 - dt / 0.25))
    for hit in (12.0, 14.4, 17.0, 18.7):
        if 0 <= t - hit < 2 / FPS:  # 2 Frames Invert (Impact Frame)
            arr = 255 - np.asarray(img.convert("L"))
            arr = np.where(arr > 128, 255, 10).astype(np.uint8)
            img = Image.fromarray(arr).convert("RGB")
    img = captions(img, t)
    img = post(img, t)
    if t < 0.8:
        img = Image.fromarray((np.asarray(img, np.float32) * ease(t / 0.8)).astype(np.uint8))
    if t > DUR - 0.8:
        img = Image.fromarray((np.asarray(img, np.float32) * ease((DUR - t) / 0.8)).astype(np.uint8))
    return letterbox(img).tobytes()


# ---------------------------------------------------------------- Audio
def make_audio(path):
    sr = 44100
    n = sr * DUR
    t = np.arange(n) / sr
    rng = np.random.RandomState(1)
    # dunkler Drone
    a = 0.22 * np.sin(2 * np.pi * 55 * t) + 0.12 * np.sin(2 * np.pi * 82.4 * t + 0.4 * np.sin(2 * np.pi * 0.2 * t))
    # Pad: Moll-Akkord, wird zum Kampf hin lauter
    env = np.clip((t - 4) / 6, 0, 1) * (t < 26) + 0.3
    for f in (220, 261.6, 329.6):
        a += 0.04 * env * np.sin(2 * np.pi * f * t + 0.3 * np.sin(2 * np.pi * 0.35 * t))
    # Regen
    noise = rng.normal(0, 1, n)
    k = np.ones(8) / 8
    rain_ = np.convolve(noise, k, mode="same") * 0.07
    a += rain_ * np.clip(1 - (t - 24) / 4, 0.2, 1)
    # Puls (Herzschlag/Kick) ab Szene 3
    for beat in np.arange(10, 26, 0.5):
        idx = int(beat * sr)
        m = min(int(0.3 * sr), n - idx)
        tt = np.arange(m) / sr
        a[idx:idx + m] += 0.45 * np.sin(2 * np.pi * (90 * np.exp(-tt * 14) + 40) * tt) * np.exp(-tt * 9)
    # Schwert-Treffer
    for hit in (12.0, 13.2, 14.4, 15.8, 17.0, 18.7):
        idx = int(hit * sr)
        m = min(int(0.5 * sr), n - idx)
        tt = np.arange(m) / sr
        a[idx:idx + m] += 0.35 * rng.normal(0, 1, m) * np.exp(-tt * 14) + 0.25 * np.sin(2 * np.pi * 1800 * tt) * np.exp(-tt * 12)
    # Riser vor Titel + Titelschlag
    r0, r1 = int(23 * sr), int(26 * sr)
    tt = np.arange(r1 - r0) / sr
    a[r0:r1] += 0.15 * np.sin(2 * np.pi * (200 + 700 * (tt / 3) ** 2) * tt) * (tt / 3)
    idx = int(26 * sr)
    m = int(2.5 * sr)
    tt = np.arange(m) / sr
    a[idx:idx + m] += 0.7 * np.sin(2 * np.pi * (70 * np.exp(-tt * 3) + 35) * tt) * np.exp(-tt * 2.2)
    # Fade
    a *= np.clip(t / 1.0, 0, 1) * np.clip((DUR - t) / 1.2, 0, 1)
    a = a / max(1e-6, np.abs(a).max()) * 0.85
    pcm = (a * 32767).astype(np.int16)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(pcm.tobytes())


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "deadlock_anime_test.mp4"
    wav = out + ".wav"
    make_audio(wav)
    ff = subprocess.Popen(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
         "-i", wav, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-preset", "medium", "-c:a", "aac", "-b:a", "160k", "-shortest", out],
        stdin=subprocess.PIPE)
    with Pool(4) as pool:
        for k, buf in enumerate(pool.imap(frame, range(N), chunksize=4)):
            ff.stdin.write(buf)
            if k % 60 == 0:
                print(f"{k}/{N}", flush=True)
    ff.stdin.close()
    ff.wait()
    import os
    os.remove(wav)
    print("fertig:", out)
