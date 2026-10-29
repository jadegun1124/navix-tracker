#!/usr/bin/env python3
"""Build Umap launcher, splash, and favicon sizes from the cropped icon artwork.

`resources/icon-master.png` is the square icon with the white margin removed.
Pass a source image (the taller JPEG with white padding) to crop that master
again before writing the densities.

Android adaptive foreground keeps the pin and family inside the 66dp safe
zone so circle and squircle masks do not clip the pin tip.
"""

from __future__ import annotations

import json
import sys
from collections import deque
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
MASTER = ROOT / "resources" / "icon-master.png"
# Inner share of the 108dp adaptive canvas that circle masks keep visible.
SAFE_DIAMETER = 66 / 108
SAFE_MARGIN = 0.03


def is_wall(r: int, g: int, b: int) -> bool:
    sat = max(r, g, b) - min(r, g, b)
    if r > 248 and g > 248 and b > 248:
        return False
    if sat <= 12 and abs(r - g) <= 8 and abs(g - b) <= 8:
        return False
    return sat >= 18


def extract_square_icon(source: Image.Image) -> Image.Image:
    """Crop the rounded tile out of the padded source and return a square RGBA."""
    rgb = source.convert("RGB")
    width, height = rgb.size
    pix = rgb.load()
    wall = Image.new("L", (width, height), 0)
    wall_px = wall.load()
    for y in range(height):
        for x in range(width):
            if is_wall(*pix[x, y]):
                wall_px[x, y] = 255
    wall = wall.filter(ImageFilter.MaxFilter(3))
    wall_px = wall.load()

    reached = bytearray(width * height)
    queue: deque[tuple[int, int]] = deque()
    for x in range(width):
        queue.append((x, 0))
        queue.append((x, height - 1))
    for y in range(height):
        queue.append((0, y))
        queue.append((width - 1, y))
    while queue:
        x, y = queue.popleft()
        index = y * width + x
        if reached[index] or wall_px[x, y]:
            continue
        reached[index] = 1
        if x + 1 < width:
            queue.append((x + 1, y))
        if x > 0:
            queue.append((x - 1, y))
        if y + 1 < height:
            queue.append((x, y + 1))
        if y > 0:
            queue.append((x, y - 1))

    inside = Image.new("L", (width, height), 0)
    inside_px = inside.load()
    for y in range(height):
        row = y * width
        for x in range(width):
            if not reached[row + x]:
                inside_px[x, y] = 255
    inside = inside.filter(ImageFilter.MinFilter(5))
    bbox = inside.getbbox()
    if bbox is None:
        raise SystemExit("icon artwork was not found in the source image")
    mask = inside.crop(bbox)
    tile = rgb.crop(bbox)
    side = min(mask.size)
    left = (mask.size[0] - side) // 2
    top = (mask.size[1] - side) // 2
    box = (left, top, left + side, top + side)
    rgba = tile.crop(box).convert("RGBA")
    rgba.putalpha(mask.crop(box))
    return rgba


def extend_rgb(image: Image.Image) -> Image.Image:
    """Fill transparent pixels with the nearest opaque color."""
    rgba = image.convert("RGBA")
    width, height = rgba.size
    pix = rgba.load()
    color: list[list[tuple[int, int, int] | None]] = [[None] * width for _ in range(height)]
    dist = [[10**9] * width for _ in range(height)]
    queue: deque[tuple[int, int]] = deque()
    for y in range(height):
        for x in range(width):
            red, green, blue, alpha = pix[x, y]
            if alpha >= 250:
                color[y][x] = (red, green, blue)
                dist[y][x] = 0
                queue.append((x, y))
    while queue:
        x, y = queue.popleft()
        base = dist[y][x]
        paint = color[y][x]
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < width and 0 <= ny < height and dist[ny][nx] > base + 1:
                dist[ny][nx] = base + 1
                color[ny][nx] = paint
                queue.append((nx, ny))
    out = Image.new("RGB", (width, height))
    out_px = out.load()
    for y in range(height):
        for x in range(width):
            out_px[x, y] = color[y][x] or (255, 255, 255)
    return out


def extend_smooth(image: Image.Image) -> Image.Image:
    """Fill transparent pixels, then blur only that outside region so corners stay smooth."""
    filled = extend_rgb(image)
    radius = max(6.0, image.size[0] * 0.03)
    blurred = filled.filter(ImageFilter.GaussianBlur(radius=radius))
    mask = image.convert("RGBA").getchannel("A")
    soft = mask.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(radius=1.2))
    return Image.composite(filled, blurred, soft).convert("RGB")


def rounded_from(full: Image.Image, master: Image.Image, size: int) -> Image.Image:
    rgb = full.resize((size, size), Image.Resampling.LANCZOS)
    alpha = master.getchannel("A").filter(ImageFilter.GaussianBlur(radius=0.7))
    alpha = alpha.resize((size, size), Image.Resampling.LANCZOS)
    image = rgb.convert("RGBA")
    image.putalpha(alpha)
    return image


def circle_crop(image: Image.Image) -> Image.Image:
    size = image.size[0]
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, size - 1, size - 1], fill=255)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(image.convert("RGBA"), (0, 0))
    out.putalpha(mask)
    return out


def pin_fractions(master: Image.Image) -> tuple[float, float, float, float]:
    """Return top, bottom, left, right of the white pin as fractions of the master."""
    rgba = master.convert("RGBA")
    width, height = rgba.size
    pix = rgba.load()

    def is_pin(x: int, y: int) -> bool:
        red, green, blue, alpha = pix[x, y]
        if alpha < 200:
            return False
        sat = max(red, green, blue) - min(red, green, blue)
        return red >= 244 and green >= 244 and blue >= 238 and sat <= 18

    seen = bytearray(width * height)
    best: tuple[int, int, int, int, int] | None = None
    for y in range(height):
        for x in range(width):
            index = y * width + x
            if seen[index] or not is_pin(x, y):
                continue
            queue: deque[tuple[int, int]] = deque([(x, y)])
            seen[index] = 1
            minx = maxx = x
            miny = maxy = y
            count = 0
            while queue:
                cx, cy = queue.popleft()
                count += 1
                minx = min(minx, cx)
                maxx = max(maxx, cx)
                miny = min(miny, cy)
                maxy = max(maxy, cy)
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if not (0 <= nx < width and 0 <= ny < height):
                        continue
                    nindex = ny * width + nx
                    if seen[nindex] or not is_pin(nx, ny):
                        continue
                    seen[nindex] = 1
                    queue.append((nx, ny))
            if best is None or count > best[0]:
                best = (count, minx, miny, maxx, maxy)
    if best is None or best[0] < 100:
        raise SystemExit("white pin was not found in the icon master")
    _, minx, miny, maxx, maxy = best
    return (miny / height, (maxy + 1) / height, minx / width, (maxx + 1) / width)


def adaptive_placement(master: Image.Image) -> tuple[float, float, float]:
    """Fit the whole tile inside the adaptive safe circle. The artwork has no white pin."""
    del master
    scale = SAFE_DIAMETER
    offset = (1 - scale) / 2
    print(f"adaptive scale {scale:.3f} offset ({offset:.3f}, {offset:.3f}) full tile in safe zone")
    return scale, offset, offset


def adaptive_foreground(
    full: Image.Image,
    master: Image.Image,
    size: int,
    scale: float,
    offset_x: float,
    offset_y: float,
) -> Image.Image:
    inner = max(1, round(size * scale))
    art = rounded_from(full, master, inner)
    red, green, blue = bytes.fromhex(edge_hex(master.convert("RGBA"))[1:])
    canvas = Image.new("RGBA", (size, size), (red, green, blue, 255))
    canvas.alpha_composite(art, (round(size * offset_x), round(size * offset_y)))
    return canvas


def splash(width: int, height: int, icon: Image.Image) -> Image.Image:
    red, green, blue = bytes.fromhex(edge_hex(icon.convert("RGBA"))[1:])
    canvas = Image.new("RGBA", (width, height), (red, green, blue, 255))
    side = int(min(width, height) * 0.62)
    tile = icon.resize((side, side), Image.Resampling.LANCZOS)
    canvas.alpha_composite(tile, ((width - side) // 2, (height - side) // 2))
    return canvas.convert("RGB")


def edge_hex(full: Image.Image) -> str:
    width, height = full.size
    samples = [
        full.getpixel((width // 2, 2)),
        full.getpixel((width // 2, height - 3)),
        full.getpixel((2, height // 2)),
        full.getpixel((width - 3, height // 2)),
    ]
    red = sum(pixel[0] for pixel in samples) // len(samples)
    green = sum(pixel[1] for pixel in samples) // len(samples)
    blue = sum(pixel[2] for pixel in samples) // len(samples)
    return f"#{red:02X}{green:02X}{blue:02X}"


def write_launcher_background(hex_color: str) -> None:
    values = ROOT / "android" / "app" / "src" / "main" / "res" / "values" / "ic_launcher_background.xml"
    values.write_text(
        """<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">"""
        + hex_color
        + """</color>
</resources>
""",
        encoding="utf-8",
    )
    drawable = ROOT / "android" / "app" / "src" / "main" / "res" / "drawable" / "ic_launcher_background.xml"
    drawable.write_text(
        """<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <path
        android:fillColor=\""""
        + hex_color
        + """\"
        android:pathData="M0,0h108v108h-108z" />
</vector>
""",
        encoding="utf-8",
    )


def save_ios(full: Image.Image, rounded_icon: Image.Image) -> None:
    catalog = ROOT / "resources" / "ios" / "AppIcon.appiconset"
    catalog.mkdir(parents=True, exist_ok=True)
    specs = [
        (20, 2, "iphone"),
        (20, 3, "iphone"),
        (29, 2, "iphone"),
        (29, 3, "iphone"),
        (40, 2, "iphone"),
        (40, 3, "iphone"),
        (60, 2, "iphone"),
        (60, 3, "iphone"),
        (20, 1, "ipad"),
        (20, 2, "ipad"),
        (29, 1, "ipad"),
        (29, 2, "ipad"),
        (40, 1, "ipad"),
        (40, 2, "ipad"),
        (76, 1, "ipad"),
        (76, 2, "ipad"),
        (83.5, 2, "ipad"),
        (1024, 1, "ios-marketing"),
    ]
    images = []
    for pt, scale, idiom in specs:
        px = int(round(pt * scale))
        filename = "icon-1024.png" if idiom == "ios-marketing" else f"icon-{pt:g}@{scale}x.png"
        full.resize((px, px), Image.Resampling.LANCZOS).convert("RGB").save(catalog / filename, optimize=True)
        images.append(
            {
                "filename": filename,
                "idiom": idiom,
                "scale": f"{scale}x",
                "size": f"{pt:g}x{pt:g}",
            }
        )
    (catalog / "Contents.json").write_text(
        json.dumps({"images": images, "info": {"author": "xcode", "version": 1}}, indent=2) + "\n",
        encoding="utf-8",
    )

    splash_dir = ROOT / "resources" / "ios" / "Splash.imageset"
    splash_dir.mkdir(parents=True, exist_ok=True)
    base = splash(1366, 1366, rounded_icon)
    for name, size in (("splash-1x.png", 512), ("splash-2x.png", 1024), ("splash-3x.png", 1536)):
        base.resize((size, size), Image.Resampling.LANCZOS).save(splash_dir / name, optimize=True)
    (splash_dir / "Contents.json").write_text(
        json.dumps(
            {
                "images": [
                    {"filename": "splash-1x.png", "idiom": "universal", "scale": "1x"},
                    {"filename": "splash-2x.png", "idiom": "universal", "scale": "2x"},
                    {"filename": "splash-3x.png", "idiom": "universal", "scale": "3x"},
                ],
                "info": {"author": "xcode", "version": 1},
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )


def emit(master: Image.Image) -> None:
    resources = ROOT / "resources"
    resources.mkdir(parents=True, exist_ok=True)
    master.save(MASTER, optimize=True)

    native_full = extend_smooth(master)
    rounded_icon = rounded_from(native_full, master, 1024)
    full = native_full.resize((1024, 1024), Image.Resampling.LANCZOS)
    scale, offset_x, offset_y = adaptive_placement(master)
    foreground = adaptive_foreground(native_full, master, 1024, scale, offset_x, offset_y)
    background = edge_hex(foreground)

    full.save(resources / "icon.png", optimize=True)
    rounded_icon.save(resources / "icon-rounded.png", optimize=True)
    foreground.save(resources / "icon-foreground.png", optimize=True)
    splash(2732, 2732, rounded_icon).save(resources / "splash.png", optimize=True)
    full.resize((512, 512), Image.Resampling.LANCZOS).save(resources / "play-icon.png", optimize=True)

    public = ROOT / "public"
    rounded_icon.resize((512, 512), Image.Resampling.LANCZOS).save(public / "umap-icon.png", optimize=True)
    rounded_icon.resize((192, 192), Image.Resampling.LANCZOS).save(public / "umap-icon-192.png", optimize=True)
    rounded_icon.resize((32, 32), Image.Resampling.LANCZOS).save(public / "favicon.png", optimize=True)
    full.resize((180, 180), Image.Resampling.LANCZOS).convert("RGB").save(public / "apple-touch-icon.png", optimize=True)
    full.resize((512, 512), Image.Resampling.LANCZOS).convert("RGB").save(public / "umap-icon-512.png", optimize=True)

    res = ROOT / "android" / "app" / "src" / "main" / "res"
    legacy = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
    foreground_sizes = {"mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432}
    for density, size in legacy.items():
        folder = res / f"mipmap-{density}"
        folder.mkdir(parents=True, exist_ok=True)
        tile = full.resize((size, size), Image.Resampling.LANCZOS).convert("RGB")
        tile.save(folder / "ic_launcher.png", optimize=True)
        circle_crop(tile).save(folder / "ic_launcher_round.png", optimize=True)
    for density, size in foreground_sizes.items():
        folder = res / f"mipmap-{density}"
        foreground.resize((size, size), Image.Resampling.LANCZOS).save(
            folder / "ic_launcher_foreground.png",
            optimize=True,
        )

    splashes = {
        "drawable/splash.png": (480, 320),
        "drawable-land-mdpi/splash.png": (480, 320),
        "drawable-land-hdpi/splash.png": (800, 480),
        "drawable-land-xhdpi/splash.png": (1280, 720),
        "drawable-land-xxhdpi/splash.png": (1600, 960),
        "drawable-land-xxxhdpi/splash.png": (1920, 1280),
        "drawable-port-mdpi/splash.png": (320, 480),
        "drawable-port-hdpi/splash.png": (480, 800),
        "drawable-port-xhdpi/splash.png": (720, 1280),
        "drawable-port-xxhdpi/splash.png": (960, 1600),
        "drawable-port-xxxhdpi/splash.png": (1280, 1920),
    }
    for relative, (width, height) in splashes.items():
        splash(width, height, rounded_icon).save(res / relative, optimize=True)

    write_launcher_background(background)
    save_ios(full, rounded_icon)
    print(f"Umap icons written. adaptive background {background}")


def main() -> None:
    if len(sys.argv) > 1:
        master = extract_square_icon(Image.open(sys.argv[1]))
    else:
        master = Image.open(MASTER).convert("RGBA")
    emit(master)


if __name__ == "__main__":
    main()
