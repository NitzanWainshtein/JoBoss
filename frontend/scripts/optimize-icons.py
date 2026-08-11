"""
Downscale and re-encode frontend/public/icons in place.

Why: the source art was exported at 1254x1254 (and up to 2508px wide) while
iconSizes.js renders these at 20-135 CSS px. That made public/icons ~14MB, all of
which a first-time visitor downloads on a mobile connection.

Targets keep >=2x headroom over the largest size each asset is actually rendered
at, so nothing gets soft on a high-DPR screen:

  square UI icons  -> 320px   (largest use is the 135px NOPE stamp)
  wide banners     -> 1080px  (full device width at 2x on a ~540px viewport)
  phone backdrops  -> left at native size, re-encoded only
  PWA/app icon     -> untouched here; generate-pwa-icons.py handles those

Idempotent: an image already at or below its target is only re-encoded, and
files that do not get smaller are left exactly as they were.

    python frontend/scripts/optimize-icons.py --dry-run
    python frontend/scripts/optimize-icons.py
"""
import argparse
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow is required:  pip install Pillow")

ICONS_DIR = Path(__file__).resolve().parents[1] / "public" / "icons"

SQUARE_MAX = 320
WIDE_MAX = 1080

# Rendered as full-bleed backgrounds behind the mockup screen — resizing these
# is what actually shows, so only re-encode them.
ENCODE_ONLY = {
    "swipes_icons/screen_base_background.png",
    "swipes_icons/slider_background.png",
}

# Owned by generate-pwa-icons.py / the manifest. Never touch from here.
SKIP = {
    "app_icon_appstore.png",
    "app_icon_192.png",
    "app_icon_512.png",
    "app_icon_maskable_512.png",
}


def target_for(rel_path, width, height):
    if rel_path in ENCODE_ONLY:
        return None
    longest = max(width, height)
    # "Wide" = a banner/logo strip rather than a square glyph.
    limit = WIDE_MAX if width > height * 1.6 else SQUARE_MAX
    return limit if longest > limit else None


def process(path, dry_run):
    rel = path.relative_to(ICONS_DIR).as_posix()
    if rel in SKIP:
        return None

    before = path.stat().st_size
    with Image.open(path) as im:
        im.load()
        width, height = im.size
        mode = im.mode
        limit = target_for(rel, width, height)

        if limit:
            scale = limit / max(width, height)
            new_size = (max(1, round(width * scale)), max(1, round(height * scale)))
            out = im.resize(new_size, Image.LANCZOS)
        else:
            new_size = (width, height)
            out = im.copy()

        # Preserve alpha where it exists (these sit on gradient backgrounds, so
        # flattening would show as a hard rectangle), drop it where it does not.
        if mode in ("RGBA", "LA", "P"):
            out = out.convert("RGBA")
        else:
            out = out.convert("RGB")

        tmp = path.with_suffix(".opt.png")
        out.save(tmp, format="PNG", optimize=True)

    after = tmp.stat().st_size

    # Never regress: an already-tight file can come out bigger after re-encoding.
    if after >= before:
        tmp.unlink()
        return (rel, before, before, (width, height), new_size, "kept")

    if dry_run:
        tmp.unlink()
    else:
        tmp.replace(path)

    return (rel, before, after, (width, height), new_size, "shrunk")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="report only, write nothing")
    args = ap.parse_args()

    if not ICONS_DIR.is_dir():
        sys.exit(f"icons dir not found: {ICONS_DIR}")

    rows = []
    for path in sorted(ICONS_DIR.rglob("*.png")):
        result = process(path, args.dry_run)
        if result:
            rows.append(result)

    total_before = sum(r[1] for r in rows)
    total_after = sum(r[2] for r in rows)

    for rel, before, after, old_size, new_size, action in sorted(rows, key=lambda r: r[1] - r[2], reverse=True):
        if action == "kept":
            continue
        print(
            f"  {before // 1024:>5}KB -> {after // 1024:>4}KB  "
            f"{old_size[0]}x{old_size[1]} -> {new_size[0]}x{new_size[1]}  {rel}"
        )

    kept = sum(1 for r in rows if r[5] == "kept")
    print()
    print(f"{'DRY RUN — ' if args.dry_run else ''}"
          f"{len(rows) - kept} optimized, {kept} already optimal")
    print(f"total: {total_before // 1024}KB -> {total_after // 1024}KB "
          f"({100 - (total_after * 100 // max(total_before, 1))}% smaller)")


if __name__ == "__main__":
    main()
