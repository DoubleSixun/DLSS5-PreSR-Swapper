#!/usr/bin/env python3
"""Compatibility fixes applied after the independent manager overlay patch.

The manager overlay deliberately lives in OptiScaler's existing ImGui host, but
our pinned v0.7.7 source differs slightly from newer ImGui/config APIs. Keep the
main overlay patch readable and adapt those pinned-source details here before
MSBuild.
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

    # Pass 2/3 style options are CustomOptional<uint32_t, NoDefault>. A generic
    # lambda containing value_or_default() compiles both runtime branches and is
    # therefore ill-formed for those no-default optionals. Keep primary and
    # inherited style controls as separate template instantiations.
    old_styles = r'''        auto styleCombo = [&](const char* label, auto* option, bool inherit)
        {
            if (!inherit)
            {
                int style = (int) std::clamp(option->value_or_default(), 0u, 2u);
                ImGui::SetNextItemWidth(-1.0f);
                if (ImGui::Combo(label, &style, styles, IM_ARRAYSIZE(styles)))
                {
                    *option = (uint32_t) style;
                    return true;
                }
                return false;
            }

            int selected = option->has_value() ? std::clamp((int) option->value(), 0, 2) + 1 : 0;
            ImGui::SetNextItemWidth(-1.0f);
            if (!ImGui::Combo(label, &selected, inheritedStyles, IM_ARRAYSIZE(inheritedStyles)))
                return false;
            if (selected == 0)
                option->reset();
            else
                *option = (uint32_t) (selected - 1);
            return true;
        };

        ImGui::Spacing();
        if (styleCombo("Pass 1 style", &config->DlssNrStyle, false))
            changed = true;
        if (passes >= 2 && styleCombo("Pass 2 style", &config->DlssNrPass2Style, true))
            changed = true;
        if (passes >= 3 && styleCombo("Pass 3 style", &config->DlssNrPass3Style, true))
            changed = true;'''

    new_styles = r'''        auto primaryStyleCombo = [&](const char* label, auto* option)
        {
            int style = (int) std::clamp(option->value_or_default(), 0u, 2u);
            ImGui::SetNextItemWidth(-1.0f);
            if (!ImGui::Combo(label, &style, styles, IM_ARRAYSIZE(styles)))
                return false;
            *option = (uint32_t) style;
            return true;
        };

        auto inheritedStyleCombo = [&](const char* label, auto* option)
        {
            int selected = option->has_value() ? std::clamp((int) option->value(), 0, 2) + 1 : 0;
            ImGui::SetNextItemWidth(-1.0f);
            if (!ImGui::Combo(label, &selected, inheritedStyles, IM_ARRAYSIZE(inheritedStyles)))
                return false;
            if (selected == 0)
                option->reset();
            else
                *option = (uint32_t) (selected - 1);
            return true;
        };

        ImGui::Spacing();
        if (primaryStyleCombo("Pass 1 style", &config->DlssNrStyle))
            changed = true;
        if (passes >= 2 && inheritedStyleCombo("Pass 2 style", &config->DlssNrPass2Style))
            changed = true;
        if (passes >= 3 && inheritedStyleCombo("Pass 3 style", &config->DlssNrPass3Style))
            changed = true;'''

    text = replace_exact(text, old_styles, new_styles, "style combo split", expected=1)

    target.write_text(text, encoding="utf-8")
    print(f"applied manager overlay compile compatibility fixes: {target}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
