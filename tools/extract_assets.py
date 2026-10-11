"""Extract clean design assets from the original Photoshop PDF.

The original poster (source/original-ru.pdf) is a single page made of
full-page 300 dpi image layers with the Russian text drawn on top as
clipping paths. This script renders the relevant layers, removes the baked-in
Russian text and the old icons, and writes reusable assets:

  assets/img/pattern-paper.jpg   page background pattern (white)
  assets/img/pattern-panel.jpg   the same pattern recoloured for the panel
  assets/img/logo.png            logo with transparent background
  assets/img/leaf.png            decorative leaf next to the title

Run once when the source design changes:

  python3 -I tools/extract_assets.py source/original-ru.pdf assets/img

Requires: python3, pypdf, numpy, Pillow and poppler-utils (pdftoppm).
"""

from __future__ import annotations

import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, NameObject

DPI = 300
# The background pattern repeats exactly every 255 px vertically at 300 dpi
# (measured by autocorrelation), so any dirty pixel can be replaced with the
# pixel one or more periods above or below it.
PATTERN_PERIOD_Y = 255

# Colours sampled from the original artwork (sRGB).
GOLD = (217, 169, 70)
GREEN = (88, 157, 65)
DARK = (34, 31, 32)

# Regions in 300 dpi page pixels: (x0, y0, x1, y1).
LOGO_BOX = (880, 20, 1620, 330)
LEAF_BOX = (790, 315, 950, 430)
PANEL_SAMPLE_BOX = (1700, 1000, 2300, 2600)


@dataclass(frozen=True)
class Layers:
    paper: np.ndarray  # page pattern + logo + baked text and icons
    panel: np.ndarray  # beige panel pattern + icons (white outside the panel)


def render_layer(pdf: Path, image_name: str, workdir: Path) -> np.ndarray:
    """Render a single image XObject of the page, unclipped, at DPI."""
    writer = PdfWriter(clone_from=str(pdf))
    page = writer.pages[0]
    width, height = float(page.mediabox.width), float(page.mediabox.height)
    stream = DecodedStreamObject()
    stream.set_data(f"q {width} 0 0 {height} 0 0 cm /{image_name} Do Q".encode())
    page[NameObject("/Contents")] = writer._add_object(stream)
    single = workdir / f"{image_name}.pdf"
    writer.write(single)
    prefix = workdir / image_name
    subprocess.run(
        ["pdftoppm", "-r", str(DPI), "-png", "-singlefile", str(single), str(prefix)],
        check=True,
    )
    return np.asarray(Image.open(f"{prefix}.png").convert("RGB")).astype(np.float64)


def dilate(mask: np.ndarray, radius: int) -> np.ndarray:
    out = mask.copy()
    for dy in range(-radius, radius + 1):
        for dx in range(-radius, radius + 1):
            out |= np.roll(np.roll(mask, dy, axis=0), dx, axis=1)
    return out


def content_mask(img: np.ndarray, max_sat: float, min_gray: float) -> np.ndarray:
    """Pixels that are not part of the background pattern."""
    sat = img.max(axis=2) - img.min(axis=2)
    gray = img.mean(axis=2)
    return dilate((sat > max_sat) | (gray < min_gray), radius=4)


def fill_from_period(img: np.ndarray, dirty: np.ndarray) -> np.ndarray:
    """Replace dirty pixels with clean pixels whole pattern periods away."""
    out = img.copy()
    remaining = dirty.copy()
    height = img.shape[0]
    for step in range(1, height // PATTERN_PERIOD_Y + 1):
        for sign in (1, -1):
            shift = sign * step * PATTERN_PERIOD_Y
            src_rows = np.arange(height) + shift
            valid_rows = (src_rows >= 0) & (src_rows < height)
            ys, xs = np.nonzero(remaining & valid_rows[:, None])
            src_y = ys + shift
            ok = ~dirty[src_y, xs]
            out[ys[ok], xs[ok]] = img[src_y[ok], xs[ok]]
            remaining[ys[ok], xs[ok]] = False
        if not remaining.any():
            return out
    raise RuntimeError(f"{int(remaining.sum())} pixels could not be cleaned")


def fit_channel_map(src: np.ndarray, dst: np.ndarray) -> list[tuple[float, float]]:
    """Per-channel linear map dst = a * src + b (orthogonal fit on std devs)."""
    coeffs = []
    for c in range(3):
        s, d = src[..., c].ravel(), dst[..., c].ravel()
        a = d.std() / s.std()
        coeffs.append((a, d.mean() - a * s.mean()))
    return coeffs


def matte(region: np.ndarray, background: np.ndarray, palette: list[tuple]) -> Image.Image:
    """Recover an RGBA cut-out of flat-coloured artwork over a known background."""
    pal = np.asarray(palette, dtype=np.float64)
    diff = region - background
    best_alpha = np.zeros(region.shape[:2])
    best_err = np.full(region.shape[:2], np.inf)
    best_idx = np.zeros(region.shape[:2], dtype=int)
    for i, colour in enumerate(pal):
        span = colour - background
        alpha = np.clip((diff * span).sum(axis=2) / np.maximum((span * span).sum(axis=2), 1e-6), 0, 1)
        err = np.linalg.norm(region - (alpha[..., None] * colour + (1 - alpha[..., None]) * background), axis=2)
        better = err < best_err
        best_alpha[better], best_err[better], best_idx[better] = alpha[better], err[better], i
    best_alpha[best_alpha < 0.04] = 0
    rgba = np.dstack([pal[best_idx], best_alpha * 255]).round().astype(np.uint8)
    image = Image.fromarray(rgba, "RGBA")
    return image.crop(image.getbbox())


def crop(img: np.ndarray, box: tuple[int, int, int, int]) -> np.ndarray:
    x0, y0, x1, y1 = box
    return img[y0:y1, x0:x1]


def main(pdf: Path, out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        layers = Layers(
            paper=render_layer(pdf, "Im0", Path(tmp)),
            panel=render_layer(pdf, "Im1", Path(tmp)),
        )

    dirty = content_mask(layers.paper, max_sat=9, min_gray=245)
    paper = fill_from_period(layers.paper, dirty)
    assert not content_mask(paper, max_sat=9, min_gray=245).any(), "paper not clean"

    panel_sample = crop(layers.panel, PANEL_SAMPLE_BOX)
    panel_dirty = content_mask(panel_sample, max_sat=45, min_gray=220)
    clean_sample = ~panel_dirty
    coeffs = fit_channel_map(
        crop(paper, PANEL_SAMPLE_BOX)[clean_sample][None],
        panel_sample[clean_sample][None],
    )
    panel = np.dstack([a * paper[..., c] + b for c, (a, b) in enumerate(coeffs)])

    save_jpeg(paper, out_dir / "pattern-paper.jpg")
    save_jpeg(panel, out_dir / "pattern-panel.jpg")

    logo = matte(crop(layers.paper, LOGO_BOX), crop(paper, LOGO_BOX), [GREEN, DARK, GOLD])
    logo.save(out_dir / "logo.png", optimize=True)
    leaf = matte(crop(layers.paper, LEAF_BOX), crop(paper, LEAF_BOX), [GOLD])
    leaf.save(out_dir / "leaf.png", optimize=True)

    print("panel colour map:", [(round(a, 3), round(b, 1)) for a, b in coeffs])
    print("logo", logo.size, "leaf", leaf.size)


def save_jpeg(img: np.ndarray, path: Path) -> None:
    Image.fromarray(np.clip(img, 0, 255).round().astype(np.uint8), "RGB").save(
        path, quality=90, optimize=True, progressive=True, dpi=(DPI, DPI)
    )


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit("usage: extract_assets.py <original.pdf> <out_dir>")
    main(Path(sys.argv[1]), Path(sys.argv[2]))
