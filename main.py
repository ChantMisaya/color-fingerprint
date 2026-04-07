from __future__ import annotations

import argparse
from collections import Counter
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageDraw, ImageFont


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Analyze a PNG image, build a solid color panel from the image colors, "
            "print RGB info on that panel, and stack it above the original image."
        )
    )
    parser.add_argument("input", type=Path, help="Input PNG image path")
    parser.add_argument("output", type=Path, help="Output PNG image path")
    parser.add_argument(
        "--method",
        choices=("average", "dominant"),
        default="average",
        help="Color extraction method: average or dominant",
    )
    parser.add_argument(
        "--background",
        default="255,255,255",
        help=(
            "Background RGB used to flatten transparent pixels before analysis, "
            'formatted as "R,G,B"'
        ),
    )
    return parser.parse_args()


def parse_rgb(value: str) -> tuple[int, int, int]:
    try:
        parts = [int(part.strip()) for part in value.split(",")]
    except ValueError as exc:
        raise argparse.ArgumentTypeError("RGB values must be integers") from exc

    if len(parts) != 3 or any(part < 0 or part > 255 for part in parts):
        raise argparse.ArgumentTypeError("RGB must be in the format R,G,B with 0-255")

    return tuple(parts)  # type: ignore[return-value]


def flatten_to_rgb(image: Image.Image, background: tuple[int, int, int]) -> Image.Image:
    rgba_image = image.convert("RGBA")
    background_rgba = Image.new("RGBA", rgba_image.size, background + (255,))
    composited = Image.alpha_composite(background_rgba, rgba_image)
    return composited.convert("RGB")


def average_color(pixels: Iterable[tuple[int, int, int]]) -> tuple[int, int, int]:
    total_r = total_g = total_b = count = 0
    for red, green, blue in pixels:
        total_r += red
        total_g += green
        total_b += blue
        count += 1

    if count == 0:
        raise ValueError("The image does not contain any pixels")

    return (
        round(total_r / count),
        round(total_g / count),
        round(total_b / count),
    )


def dominant_color(pixels: Iterable[tuple[int, int, int]]) -> tuple[int, int, int]:
    try:
        return Counter(pixels).most_common(1)[0][0]
    except IndexError as exc:
        raise ValueError("The image does not contain any pixels") from exc


def choose_text_color(fill_color: tuple[int, int, int]) -> tuple[int, int, int]:
    brightness = (fill_color[0] * 299 + fill_color[1] * 587 + fill_color[2] * 114) / 1000
    return (0, 0, 0) if brightness > 186 else (255, 255, 255)


def load_font(image_height: int) -> ImageFont.ImageFont | ImageFont.FreeTypeFont:
    font_size = max(24, image_height // 12)
    try:
        return ImageFont.truetype("DejaVuSans.ttf", font_size)
    except OSError:
        return ImageFont.load_default()


def build_color_panel(
    size: tuple[int, int], fill_color: tuple[int, int, int], label: str
) -> Image.Image:
    panel = Image.new("RGB", size, fill_color)
    draw = ImageDraw.Draw(panel)
    font = load_font(size[1])
    text_color = choose_text_color(fill_color)

    text_bbox = draw.textbbox((0, 0), label, font=font)
    text_width = text_bbox[2] - text_bbox[0]
    text_height = text_bbox[3] - text_bbox[1]

    x = (size[0] - text_width) / 2
    y = (size[1] - text_height) / 2

    padding_x = max(12, size[0] // 50)
    padding_y = max(8, size[1] // 50)
    background_box = (
        x - padding_x,
        y - padding_y,
        x + text_width + padding_x,
        y + text_height + padding_y,
    )

    overlay_color = (255, 255, 255) if text_color == (0, 0, 0) else (0, 0, 0)
    draw.rounded_rectangle(background_box, radius=12, fill=overlay_color)
    draw.text((x, y), label, fill=text_color, font=font)
    return panel


def combine_images(top: Image.Image, bottom: Image.Image) -> Image.Image:
    width = max(top.width, bottom.width)
    height = top.height + bottom.height
    combined = Image.new("RGB", (width, height), (255, 255, 255))
    combined.paste(top, (0, 0))
    combined.paste(bottom, (0, top.height))
    return combined


def main() -> None:
    args = parse_args()
    background = parse_rgb(args.background)

    if args.input.suffix.lower() != ".png":
        raise SystemExit("Input file must be a PNG image")

    if args.output.suffix.lower() != ".png":
        raise SystemExit("Output file must be a PNG image")

    with Image.open(args.input) as source:
        original_rgb = flatten_to_rgb(source, background)

    pixels = list(original_rgb.getdata())
    if args.method == "average":
        extracted_color = average_color(pixels)
    else:
        extracted_color = dominant_color(pixels)

    label = f"RGB: {extracted_color[0]}, {extracted_color[1]}, {extracted_color[2]}"
    color_panel = build_color_panel(original_rgb.size, extracted_color, label)
    final_image = combine_images(color_panel, original_rgb)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    final_image.save(args.output, format="PNG")


if __name__ == "__main__":
    main()
