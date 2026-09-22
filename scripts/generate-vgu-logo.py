"""Generate the animated white ASCII VGU logo used by the landing header."""

from pathlib import Path
import argparse
import math
import random

import numpy as np
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "apps/web/public/brand/vgu-logo.png"
OUTPUT = ROOT / "apps/web/public/brand/vgu-logo-white-ascii.gif"
FRAME_COUNT = 36
FRAME_MS = 80
TARGET_WIDTH = 1600
GLYPHS = "VGU01<>[]{}#*+=/\\:;"


def font(size: int) -> ImageFont.FreeTypeFont:
    candidates = (
        "/System/Library/Fonts/SFNSMono.ttf",
        "/System/Library/Fonts/Menlo.ttc",
        "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
    )
    for candidate in candidates:
        try:
            return ImageFont.truetype(candidate, size)
        except OSError:
            pass
    raise RuntimeError("A monospace TrueType font is required")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--font-size", type=int, default=21)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    output = args.output if args.output.is_absolute() else ROOT / args.output

    source = Image.open(SOURCE).convert("RGBA")
    height = round(source.height * TARGET_WIDTH / source.width)
    source = source.resize((TARGET_WIDTH, height), Image.Resampling.LANCZOS)
    pixels = np.asarray(source)
    alpha = pixels[..., 3].astype(np.float32) / 255

    # Orange is the emblem; the gray wordmark remains a stable, solid white.
    orange = (
        (pixels[..., 0] > 180)
        & (pixels[..., 1] > 55)
        & (pixels[..., 1] < 190)
        & (pixels[..., 2] < 100)
        & (alpha > 0)
    )
    ys, xs = np.where(orange)
    if not len(xs):
        raise RuntimeError("No orange emblem pixels found")
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()

    base = np.zeros_like(pixels)
    base[..., :3] = 255
    base[..., 3] = pixels[..., 3]
    base[..., 3][orange] = 0

    text_font = font(args.font_size)
    # Horizontal pitch controls how many glyphs span each emblem stroke. Vertical
    # pitch is deliberately looser so large variants never cut through the row below.
    cell_x = round(args.font_size * 0.76)
    cell_y = round(args.font_size * 1.2)
    cells = []
    seeded = random.Random(2609)
    for y in range(y0 - cell_y, y1 + cell_y, cell_y):
        for x in range(x0 - cell_x, x1 + cell_x, cell_x):
            x_end = min(x + cell_x, source.width)
            y_end = min(y + cell_y, source.height)
            if x_end <= 0 or y_end <= 0:
                continue
            region = orange[max(0, y):y_end, max(0, x):x_end]
            if region.size and region.mean() > 0.08:
                cells.append((x, y, seeded.choice(GLYPHS), seeded.random()))

    frames: list[Image.Image] = []
    emblem_alpha = (orange.astype(np.float32) * alpha * 255).astype(np.uint8)
    span_x = max(1, x1 - x0)
    span_y = max(1, y1 - y0)

    for frame_index in range(FRAME_COUNT):
        scan = -0.12 + 2.24 * frame_index / (FRAME_COUNT - 1)
        ascii_layer = Image.new("L", source.size, 0)
        draw = ImageDraw.Draw(ascii_layer)
        for cell_index, (x, y, glyph, phase) in enumerate(cells):
            progress = (x - x0) / span_x + (y - y0) / span_y
            distance = abs(progress - scan)
            boost = max(0.0, 1.0 - distance / 0.19)
            flicker = 0.08 * math.sin(frame_index * 1.7 + phase * 19)
            value = int(255 * min(1.0, max(0.32, 0.44 + boost * 0.56 + flicker)))
            active_glyph = glyph
            if (cell_index * 11 + frame_index * 7) % 53 == 0:
                active_glyph = GLYPHS[(cell_index + frame_index) % len(GLYPHS)]
            draw.text((x, y), active_glyph, font=text_font, fill=value, anchor="lt")

        ascii_alpha = np.asarray(ascii_layer, dtype=np.float32)
        clipped = (ascii_alpha * (emblem_alpha.astype(np.float32) / 255)).astype(np.uint8)
        frame = base.copy()
        frame[..., 3] = np.maximum(frame[..., 3], clipped)
        frames.append(Image.fromarray(frame))

    output.parent.mkdir(parents=True, exist_ok=True)
    frames[0].save(
        output,
        save_all=True,
        append_images=frames[1:],
        duration=FRAME_MS,
        loop=0,
        disposal=2,
        optimize=True,
    )
    print(f"Wrote {output.relative_to(ROOT)} ({len(frames)} frames, {TARGET_WIDTH}x{height}, {args.font_size}px glyphs)")


if __name__ == "__main__":
    main()
