"""Draws the home-screen icons (icons/icon-*.png) in the "night" style: a
dark tile, faint noise with orange specks, the name in bone with the 1 in
orange, and an orange underline. Run from the repo root:
    python tools/make_icons.py            # f1nanc3's icons
    python tools/make_icons.py t1ld3 DIR  # the same style for t1ld3, into DIR"""
import random
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

NIGHT = "#121311"
BONE = "#E7E7DD"
SPECK = "#4D4E47"
ORANGE = "#E8642C"
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"
NOISE = ".:;'`~*+-,"


def draw(size: int, name: str) -> Image.Image:
    # Drawn at 512 and scaled, so every size looks the same.
    big = 512
    image = Image.new("RGB", (big, big), NIGHT)
    pen = ImageDraw.Draw(image)
    rng = random.Random(3)
    noise_font = ImageFont.truetype(FONT, 20)
    for _ in range(170):
        x, y = rng.randrange(big), rng.randrange(big)
        if 60 < x < 460 and 120 < y < 400:
            continue
        pen.text((x, y), rng.choice(NOISE), font=noise_font, fill=ORANGE if rng.random() < 0.25 else SPECK)
    # The name as large as fits, the "1" in orange.
    font_size = 72 if len(name) > 5 else 96
    font = ImageFont.truetype(FONT, font_size)
    width = pen.textlength(name, font=font)
    x = (big - width) / 2
    one = name.index("1")
    y = 200 if len(name) > 5 else 186
    pen.text((x, y), name[:one], font=font, fill=BONE)
    x_one = x + pen.textlength(name[:one], font=font)
    pen.text((x_one, y), "1", font=font, fill=ORANGE)
    pen.text((x_one + pen.textlength("1", font=font), y), name[one + 1:], font=font, fill=BONE)
    underline = y + font_size + 18
    pen.rectangle((x, underline, x + width, underline + 7), fill=ORANGE)
    return image.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    name = sys.argv[1] if len(sys.argv) > 1 else "f1nanc3"
    folder = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("icons")
    folder.mkdir(parents=True, exist_ok=True)
    for size in (180, 192, 512):
        draw(size, name).save(folder / f"icon-{size}.png")
    print(f"drew {name} into {folder}")
