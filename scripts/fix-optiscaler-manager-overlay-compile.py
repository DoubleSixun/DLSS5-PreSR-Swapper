#!/usr/bin/env python3
"""Small compatibility fix applied after the independent manager overlay patch.

The pinned OptiScaler v0.7.7 tree currently ships an ImGui API without
GetWindowContentRegionMax in the namespace used by menu_common.cpp, and
menu_common.cpp does not include the Vulkan NR feature header that declares
DlssNr::IsRunningVk(). Keep the main overlay patch readable and apply these
three source-level compatibility adjustments before MSBuild.
"""

from __future__ import annotations

import pathlib
import sys


def replace_exact(text: str, old: str, new: str, label: str, expected: int | None = None) -> str:
    count = text.count(old)
    if expected is not None and count != expected:
        raise RuntimeError(f"{label}: expected {expected} match(es), found {count}")
    if count == 0:
        raise RuntimeError(f"{label}: source pattern not found")
    return text.replace(old, new)


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: fix-optiscaler-manager-overlay-compile.py <OptiScaler checkout>", file=sys.stderr)
        return 2

    root = pathlib.Path(sys.argv[1]).resolve()
    target = root / "OptiScaler" / "menu" / "menu_common.cpp"
    text = target.read_text(encoding="utf-8-sig")

    # IsRunningVk is implemented in the pinned backend but declared in this header,
    # which stock menu_common.cpp does not otherwise need.
    include_anchor = "#include <dlssnr/DlssNr_ExposureScan.h>\n"
    include_line = "#include <dlssnr/DlssNrFeature_Vk.h>\n"
    if include_line not in text:
        text = replace_exact(text, include_anchor, include_anchor + include_line,
                             "Vulkan NR header include", expected=1)

    # This pinned ImGui exposes GetContentRegionAvail(), which is enough to derive
    # the current content-region right edge in local window coordinates.
    old_edge = "ImGui::GetWindowContentRegionMax().x"
    new_edge = "(ImGui::GetCursorPosX() + ImGui::GetContentRegionAvail().x)"
    text = replace_exact(text, old_edge, new_edge, "content region edge", expected=2)

    target.write_text(text, encoding="utf-8")
    print(f"applied manager overlay compile compatibility fixes: {target}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
