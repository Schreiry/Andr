"""Generate static font instances from the variable fonts.

Chromium embeds variable fonts into PDF as Type 3 fonts, which some print
shops reject at preflight. Static TrueType instances are embedded as regular
TrueType (CID) fonts instead. Instances are listed in assets/fonts/faces.json.

  python3 -I tools/make_font_instances.py assets/fonts

Requires: fonttools (pip install fonttools).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.varLib import instancer


def main(fonts_dir: Path) -> None:
    spec = json.loads((fonts_dir / "faces.json").read_text(encoding="utf-8"))
    out_dir = fonts_dir / "static"
    out_dir.mkdir(exist_ok=True)
    for stem in spec["families"].values():
        source = fonts_dir / "variable" / f"{stem}-VF.ttf"
        for inst in spec["instances"]:
            font = TTFont(source)
            static = instancer.instantiateVariableFont(
                font, {"wght": inst["wght"], "wdth": inst["wdth"]}, updateFontNames=False
            )
            set_names(static, stem, inst["name"])
            target = out_dir / f"{stem}-{inst['name']}.ttf"
            static.save(target)
            print(f"{target.relative_to(fonts_dir)}  wght={inst['wght']} wdth={inst['wdth']}")


def set_names(font: TTFont, stem: str, style: str) -> None:
    """Give every instance a distinct PostScript name so PDFs list them clearly."""
    family = font["name"].getDebugName(1) or stem
    full = f"{family} {style}"
    postscript = f"{stem}-{style}"
    for record in font["name"].names:
        if record.nameID == 2:
            record.string = style
        elif record.nameID == 3:
            record.string = f"{postscript};instance"
        elif record.nameID == 4:
            record.string = full
        elif record.nameID == 6:
            record.string = postscript


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("usage: make_font_instances.py <assets/fonts>")
    main(Path(sys.argv[1]))
