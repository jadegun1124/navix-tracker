#!/usr/bin/env python3
"""Reproduce the approved Umap mark and write launcher, splash, and favicon sizes.

The approved icon is a blue rounded tile, a white GPS pin, a red heart inside
the pin, and a separate white oval under the tip. The pin has no hair curl.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
BLUE = (0, 132, 255, 255)
RED = (255, 45, 54, 255)
WHITE = (255, 255, 255, 255)
BLUE_HEX = "#0084FF"


def heart_points(cx: float, cy: float, w: float, h: float, n: int = 360) -> list[tuple[float, float]]:
    raw: list[tuple[float, float]] = []
    for i in range(n):
        t = 2 * math.pi * i / n
        x = 16 * math.sin(t) ** 3
        y = -(13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t))
        raw.append((x, y))
    xs = [p[0] for p in raw]
    ys = [p[1] for p in raw]
    minx, maxx = min(xs), max(xs)
    miny, maxy = min(ys), max(ys)
    return [
        (cx - w / 2 + (x - minx) / (maxx - minx) * w, cy - h / 2 + (y - miny) / (maxy - miny) * h)
        for x, y in raw
    ]


def draw_mark(base: Image.Image) -> None:
    size = base.size[0]
    draw = ImageDraw.Draw(base)
    cx = size * 0.50
    cy = size * 0.392
    radius = size * 0.198
    tip_y = cy + radius * 1.50
    shadow_cy = tip_y + size * 0.072
    shadow_rx = size * 0.118
    shadow_ry = size * 0.0175
    draw.ellipse(
        [cx - shadow_rx, shadow_cy - shadow_ry, cx + shadow_rx, shadow_cy + shadow_ry],
        fill=WHITE,
    )
    draw.ellipse([cx - radius, cy - radius, cx + radius, cy + radius], fill=WHITE)
    dist = tip_y - cy
    alpha = math.acos(max(-1.0, min(1.0, radius / dist)))
    sin_a = math.sin(alpha)
    chord_y = cy + (radius * radius) / dist
    left_x = cx - radius * sin_a
    right_x = cx + radius * sin_a
    draw.polygon([(left_x, chord_y), (cx, tip_y), (right_x, chord_y)], fill=WHITE)
    heart_w = radius * 1.12
    heart_h = heart_w * 0.90
    draw.polygon(heart_points(cx, cy - radius * 0.06, heart_w, heart_h), fill=RED)


def render(kind: str, size: int) -> Image.Image:
    scale = 4
    big = size * scale
    if kind == "rounded":
        image = Image.new("RGBA", (big, big), (0, 0, 0, 0))
        ImageDraw.Draw(image).rounded_rectangle(
            [0, 0, big - 1, big - 1],
            radius=int(big * 0.223),
            fill=BLUE,
        )
    elif kind == "full":
        image = Image.new("RGBA", (big, big), BLUE)
    else:
        image = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    draw_mark(image)
    return image.resize((size, size), Image.Resampling.LANCZOS)


def circle_crop(image: Image.Image) -> Image.Image:
    size = image.size[0]
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, size - 1, size - 1], fill=255)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    out.paste(image.convert("RGBA"), (0, 0))
    out.putalpha(mask)
    return out


def splash(width: int, height: int, icon: Image.Image) -> Image.Image:
    canvas = Image.new("RGBA", (width, height), BLUE)
    side = int(min(width, height) * 0.62)
    tile = icon.resize((side, side), Image.Resampling.LANCZOS)
    canvas.alpha_composite(tile, ((width - side) // 2, (height - side) // 2))
    return canvas.convert("RGB")


def save_ios(full: Image.Image) -> None:
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
        filename = f"icon-{pt:g}@{scale}x.png" if scale != 1 or idiom != "ios-marketing" else "icon-1024.png"
        if idiom == "ios-marketing":
            filename = "icon-1024.png"
        full.resize((px, px), Image.Resampling.LANCZOS).convert("RGB").save(catalog / filename, optimize=True)
        entry: dict[str, str | int] = {
            "filename": filename,
            "idiom": idiom,
            "scale": f"{scale}x",
            "size": f"{pt:g}x{pt:g}",
        }
        images.append(entry)
    (catalog / "Contents.json").write_text(
        json.dumps({"images": images, "info": {"author": "xcode", "version": 1}}, indent=2) + "\n",
        encoding="utf-8",
    )

    splash_dir = ROOT / "resources" / "ios" / "Splash.imageset"
    splash_dir.mkdir(parents=True, exist_ok=True)
    base = splash(1366, 1366, render("rounded", 1024))
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


def main() -> None:
    rounded = render("rounded", 1024)
    full = render("full", 1024)
    mark = render("mark", 1024)

    resources = ROOT / "resources"
    resources.mkdir(parents=True, exist_ok=True)
    full.convert("RGB").save(resources / "icon.png", optimize=True)
    rounded.save(resources / "icon-rounded.png", optimize=True)
    mark.save(resources / "icon-foreground.png", optimize=True)
    splash(2732, 2732, rounded).save(resources / "splash.png", optimize=True)
    full.resize((512, 512), Image.Resampling.LANCZOS).convert("RGB").save(resources / "play-icon.png", optimize=True)

    public = ROOT / "public"
    rounded.resize((512, 512), Image.Resampling.LANCZOS).save(public / "umap-icon.png", optimize=True)
    rounded.resize((192, 192), Image.Resampling.LANCZOS).save(public / "umap-icon-192.png", optimize=True)
    rounded.resize((32, 32), Image.Resampling.LANCZOS).save(public / "favicon.png", optimize=True)
    full.resize((180, 180), Image.Resampling.LANCZOS).convert("RGB").save(public / "apple-touch-icon.png", optimize=True)
    full.resize((512, 512), Image.Resampling.LANCZOS).convert("RGB").save(public / "umap-icon-512.png", optimize=True)

    res = ROOT / "android" / "app" / "src" / "main" / "res"
    legacy = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
    foreground = {"mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432}
    for density, size in legacy.items():
        folder = res / f"mipmap-{density}"
        folder.mkdir(parents=True, exist_ok=True)
        tile = full.resize((size, size), Image.Resampling.LANCZOS).convert("RGB")
        tile.save(folder / "ic_launcher.png", optimize=True)
        circle_crop(tile).save(folder / "ic_launcher_round.png", optimize=True)
    for density, size in foreground.items():
        folder = res / f"mipmap-{density}"
        mark.resize((size, size), Image.Resampling.LANCZOS).save(folder / "ic_launcher_foreground.png", optimize=True)

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
        splash(width, height, rounded).save(res / relative, optimize=True)

    save_ios(full)
    print(f"Umap icons written. brand blue {BLUE_HEX}")


if __name__ == "__main__":
    main()
