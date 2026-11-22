"""Draws f1nanc3's home-screen icons (icons/icon-*.png): t1ld3's pixel
figure in the accent, holding up a coin, over faint noise, with the name
in monospace. Run from the repo root: python tools/make_icons.py"""
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

BONE = "#E7E7DD"
INK = "#111210"
FAINT = "#A6A79B"
ACCENT = "#E8642C"
DARK_ACCENT = "#B44718"
# t1ld3's figure (resonance/ascii_art.py), one arm raised to a coin (c).
FIGURE = (
    "......ccc",
    "..oo..c.c",
    "..oo..ccc",
    ".OooOo...",
    "o.oo.....",
    "..oo.....",
    ".o..o....",
    ".o..o....",
)
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono-Bold.ttf"
NOISE = ".:;'`~*+-,"


def draw(size: int) -> Image.Image:
    image = Image.new("RGB", (size, size), BONE)
    pen = ImageDraw.Draw(image)
    rng = random.Random(7)
    noise_font = ImageFont.truetype(FONT, max(6, size // 24))
    for _ in range(size // 3):
        x, y = rng.randrange(size), rng.randrange(size)
        # Keep the middle clear for the figure and the name.
        if size * 0.18 < x < size * 0.82 and size * 0.12 < y < size * 0.86:
            continue
        pen.text((x, y), rng.choice(NOISE), fill=FAINT, font=noise_font)
    cell = size // 16
    width = len(FIGURE[0]) * cell
    left = (size - width) // 2 + cell
    top = int(size * 0.17)
    colours = {"o": ACCENT, "O": DARK_ACCENT, "c": ACCENT}
    for row, line in enumerate(FIGURE):
        for column, mark in enumerate(line):
            if mark in colours:
                x, y = left + column * cell, top + row * cell
                pen.rectangle((x, y, x + cell - 1, y + cell - 1), fill=colours[mark])
    font = ImageFont.truetype(FONT, size // 7)
    text = "f1nanc3"
    box = pen.textbbox((0, 0), text, font=font)
    pen.text(((size - (box[2] - box[0])) // 2 - box[0], int(size * 0.66)), text, fill=INK, font=font)
    return image


if __name__ == "__main__":
    folder = Path("icons")
    folder.mkdir(exist_ok=True)
    for size in (180, 192, 512):
        draw(size).save(folder / f"icon-{size}.png")
