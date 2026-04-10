from __future__ import annotations

import argparse
from collections import Counter
from pathlib import Path
from typing import BinaryIO, Iterable

from PIL import Image, ImageDraw, ImageFont

FONT_CANDIDATES = (
    "DejaVuSans.ttf",
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/Library/Fonts/Arial.ttf",
    "/System/Library/Fonts/SFNS.ttf",
)
SUPPORTED_INPUT_SUFFIXES = {".png", ".jpg", ".jpeg"}
SUPPORTED_METHODS = ("average", "dominant")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Analyze a PNG/JPG image, build a solid color panel from the image colors, "
            "print RGB info on that panel, and stack it above the original image."
        )
    )
    parser.add_argument("input", type=Path, help="Input PNG/JPG image path")
    parser.add_argument("output", type=Path, help="Output PNG image path")
    parser.add_argument(
        "--method",
        choices=SUPPORTED_METHODS,
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


def validate_input_path(path: Path) -> None:
    if path.suffix.lower() not in SUPPORTED_INPUT_SUFFIXES:
        raise ValueError("Input file must be a PNG, JPG, or JPEG image")


def validate_output_path(path: Path) -> None:
    if path.suffix.lower() != ".png":
        raise ValueError("Output file must be a PNG image")


def validate_method(method: str) -> None:
    if method not in SUPPORTED_METHODS:
        raise ValueError(f"Method must be one of: {', '.join(SUPPORTED_METHODS)}")


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


def measure_text(
    draw: ImageDraw.ImageDraw, text: str, font: ImageFont.ImageFont | ImageFont.FreeTypeFont
) -> tuple[int, int, int, int]:
    return draw.textbbox((0, 0), text, font=font)


def load_scalable_font(size: int) -> ImageFont.ImageFont | ImageFont.FreeTypeFont:
    for candidate in FONT_CANDIDATES:
        try:
            return ImageFont.truetype(candidate, size)
        except OSError:
            continue

    return ImageFont.load_default()


def load_font_for_width(
    draw: ImageDraw.ImageDraw, text: str, image_size: tuple[int, int]
) -> ImageFont.ImageFont | ImageFont.FreeTypeFont:
    target_height = max(1, image_size[1] // 4)
    max_width = max(1, image_size[0] * 9 // 10)

    low = 1
    high = max(2, image_size[1])
    best_font = load_scalable_font(low)

    if not isinstance(best_font, ImageFont.FreeTypeFont):
        return best_font

    while low <= high:
        size = (low + high) // 2
        font = load_scalable_font(size)
        if not isinstance(font, ImageFont.FreeTypeFont):
            break

        bbox = measure_text(draw, text, font)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]

        if text_height <= target_height and text_width <= max_width:
            best_font = font
            low = size + 1
        else:
            high = size - 1

    return best_font


def build_color_panel(
    size: tuple[int, int], fill_color: tuple[int, int, int], label: str
) -> Image.Image:
    panel = Image.new("RGB", size, fill_color)
    draw = ImageDraw.Draw(panel)
    font = load_font_for_width(draw, label, size)
    text_color = choose_text_color(fill_color)

    text_bbox = measure_text(draw, label, font)
    text_width = text_bbox[2] - text_bbox[0]
    text_height = text_bbox[3] - text_bbox[1]

    x = (size[0] - text_width) / 2 - text_bbox[0]
    y = (size[1] - text_height) / 2 - text_bbox[1]
    draw.text((x, y), label, fill=text_color, font=font)
    return panel


def combine_images(top: Image.Image, bottom: Image.Image) -> Image.Image:
    width = max(top.width, bottom.width)
    height = top.height + bottom.height
    combined = Image.new("RGB", (width, height), (255, 255, 255))
    combined.paste(top, (0, 0))
    combined.paste(bottom, (0, top.height))
    return combined


def render_fingerprint_image(
    source: Image.Image, method: str, background: tuple[int, int, int]
) -> Image.Image:
    validate_method(method)

    original_rgb = flatten_to_rgb(source, background)
    pixels = list(original_rgb.get_flattened_data())
    if method == "average":
        extracted_color = average_color(pixels)
    else:
        extracted_color = dominant_color(pixels)

    label = "#{:02X}{:02X}{:02X}".format(*extracted_color)
    color_panel = build_color_panel(original_rgb.size, extracted_color, label)
    return combine_images(color_panel, original_rgb)


def process_image(
    input_path: Path, output_path: Path, method: str = "average", background: tuple[int, int, int] = (255, 255, 255)
) -> None:
    validate_input_path(input_path)
    validate_output_path(output_path)

    with Image.open(input_path) as source:
        final_image = render_fingerprint_image(source, method=method, background=background)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    final_image.save(output_path, format="PNG")


def process_image_stream(
    source_stream: BinaryIO, method: str = "average", background: tuple[int, int, int] = (255, 255, 255)
) -> Image.Image:
    with Image.open(source_stream) as source:
        return render_fingerprint_image(source, method=method, background=background)


def main() -> None:
    args = parse_args()
    background = parse_rgb(args.background)

    try:
        process_image(args.input, args.output, method=args.method, background=background)
    except ValueError as exc:
        raise SystemExit(str(exc)) from exc


if __name__ == "__main__":
    main()
