"""
Generate the PWA icon set from the single source app icon.

The manifest used to point all three of its entries at app_icon_appstore.png
(1254x1254, 1.6MB) while *declaring* them as 1254 / 512 / 192. Two consequences:

  1. Installing the app downloaded 1.6MB to render a 192px launcher icon.
  2. Every entry was tagged "any maskable". The source is a rounded square that
     bleeds to the canvas edge, so an OS applying a circular mask crops into the
     artwork. A maskable icon needs its own version with the logo inset far
     enough that the mask can only ever eat background.

This writes:
  app_icon_192.png            192x192, purpose "any"      (transparency kept)
  app_icon_512.png            512x512, purpose "any"      (transparency kept)
  app_icon_maskable_512.png   512x512, purpose "maskable" (logo inset on brand bg)

Idempotent — safe to re-run after replacing the source art.

    python frontend/scripts/generate-pwa-icons.py
"""
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow is required:  pip install Pillow")

ICONS = Path(__file__).resolve().parents[1] / "public" / "icons"
SOURCE = ICONS / "app_icon_appstore.png"

# Brand navy — matches manifest background_color/theme_color, so the masked area
# reads as part of the icon rather than as a seam.
BRAND_BG = (30, 42, 74, 255)

# Android's maskable safe zone is the centre circle of 80% diameter. Insetting the
# logo to 78% of the canvas keeps all artwork inside that circle whatever shape
# the launcher crops to.
MASKABLE_LOGO_SCALE = 0.78


def load_source():
    if not SOURCE.exists():
        sys.exit(f"source icon not found: {SOURCE}")
    im = Image.open(SOURCE)
    im.load()
    return im.convert("RGBA")


def write_plain(src, size, out_name):
    out = src.resize((size, size), Image.LANCZOS)
    path = ICONS / out_name
    out.save(path, format="PNG", optimize=True)
    return path


def write_maskable(src, size, out_name):
    canvas = Image.new("RGBA", (size, size), BRAND_BG)
    logo_px = round(size * MASKABLE_LOGO_SCALE)
    logo = src.resize((logo_px, logo_px), Image.LANCZOS)
    offset = (size - logo_px) // 2
    # Third arg = mask, so the logo's own alpha composites onto the brand bg
    # instead of punching transparent holes through it.
    canvas.paste(logo, (offset, offset), logo)
    path = ICONS / out_name
    canvas.save(path, format="PNG", optimize=True)
    return path


def main():
    src = load_source()
    print(f"source: {SOURCE.name} {src.size[0]}x{src.size[1]} "
          f"({SOURCE.stat().st_size // 1024}KB)")

    written = [
        write_plain(src, 192, "app_icon_192.png"),
        write_plain(src, 512, "app_icon_512.png"),
        write_maskable(src, 512, "app_icon_maskable_512.png"),
    ]

    for path in written:
        with Image.open(path) as im:
            dims = f"{im.size[0]}x{im.size[1]}"
        print(f"  wrote {path.name:<28} {dims:<10} {path.stat().st_size // 1024}KB")


if __name__ == "__main__":
    main()
