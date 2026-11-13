"""Puts a window screenshot on a soft gradient backdrop with rounded corners and a glow,
like the reference presentation shots. usage: mockup.py in.png out.png palette"""
import sys, random
from PIL import Image, ImageDraw, ImageFilter, ImageChops

src, out, palette = sys.argv[1], sys.argv[2], sys.argv[3]
W, H = 1600, 1080
PAL = {
    'sunset': [((30, 70, 200), (0.15, 0.2)), ((255, 120, 70), (0.85, 0.15)), ((240, 60, 90), (0.1, 0.95)), ((90, 150, 255), (0.9, 0.9))],
    'aurora': [((30, 60, 210), (0.2, 0.15)), ((60, 220, 120), (0.85, 0.1)), ((50, 200, 130), (0.05, 0.85)), ((70, 130, 255), (0.9, 0.95))],
    'dark': [((40, 30, 50), (0.2, 0.2)), ((90, 20, 60), (0.85, 0.3)), ((20, 20, 26), (0.5, 0.95))],
}[palette]

bg = Image.new('RGB', (W, H), (20, 40, 140) if palette != 'dark' else (18, 18, 22))
for color, (cx, cy) in PAL:
    blob = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(blob)
    r = int(W * 0.42)
    d.ellipse([cx * W - r, cy * H - r, cx * W + r, cy * H + r], fill=255)
    blob = blob.filter(ImageFilter.GaussianBlur(220))
    bg = Image.composite(Image.new('RGB', (W, H), color), bg, blob)
# film grain
random.seed(4)
grain = Image.effect_noise((W, H), 12).convert('RGB')
bg = ImageChops.add(bg, grain, scale=1.0, offset=-40) if palette != 'dark' else bg
bg = Image.blend(bg, Image.new('RGB', (W, H), (128, 128, 128)), 0.0)

win = Image.open(src).convert('RGB')
ww, wh = win.size
scale = min(1240 / ww, 820 / wh)
win = win.resize((int(ww * scale), int(wh * scale)), Image.LANCZOS)
ww, wh = win.size
x, y = (W - ww) // 2, (H - wh) // 2
radius = 34
mask = Image.new('L', (ww, wh), 0)
ImageDraw.Draw(mask).rounded_rectangle([0, 0, ww - 1, wh - 1], radius, fill=255)

# glow + shadow
glow = Image.new('L', (W, H), 0)
ImageDraw.Draw(glow).rounded_rectangle([x - 6, y - 6, x + ww + 6, y + wh + 6], radius + 6, fill=150)
glow = glow.filter(ImageFilter.GaussianBlur(26))
bg = Image.composite(Image.new('RGB', (W, H), (215, 230, 255) if palette != 'dark' else (80, 40, 70)), bg, glow.point(lambda v: v * 0.55))
shadow = Image.new('L', (W, H), 0)
ImageDraw.Draw(shadow).rounded_rectangle([x, y + 30, x + ww, y + wh + 40], radius, fill=170)
shadow = shadow.filter(ImageFilter.GaussianBlur(40))
bg = Image.composite(Image.new('RGB', (W, H), (0, 0, 0)), bg, shadow.point(lambda v: v * 0.5))
# frame: a thin light rim
rim = Image.new('L', (W, H), 0)
ImageDraw.Draw(rim).rounded_rectangle([x - 3, y - 3, x + ww + 2, y + wh + 2], radius + 3, fill=255)
bg = Image.composite(Image.new('RGB', (W, H), (190, 205, 235) if palette != 'dark' else (60, 60, 70)), bg, rim)
bg.paste(win, (x, y), mask)
bg.save(out, optimize=True)
