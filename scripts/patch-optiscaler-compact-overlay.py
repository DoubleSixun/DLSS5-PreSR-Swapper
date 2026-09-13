#!/usr/bin/env python3
"""Patch the pinned OptiScaler v0.7.7 main menu into a compact DLSS 5 NR overlay.

The app keeps the upstream renderer/input/config machinery and replaces only the visible
main-menu function. This avoids a second graphics hook while giving the standalone app
its own focused in-game UI.
"""

from __future__ import annotations

import pathlib
import sys

SIGNATURE = "void MenuCommon::RenderMainMenuWindow(RenderMenuContext& ctx)"

REPLACEMENT = r'''void MenuCommon::RenderMainMenuWindow(RenderMenuContext& ctx)
{
    auto config = ctx.config;
    auto& io = ctx.io;
    const float scale = std::clamp(ctx.menuResScale, 0.75f, 1.50f);
    const float opacity = std::clamp(config->FpsOverlayAlpha.value_or_default(), 0.50f, 0.95f);
    const float margin = 26.0f * scale;

    ImVec2 anchor(io.DisplaySize.x - margin, margin);
    ImVec2 pivot(1.0f, 0.0f);
    switch (config->FpsOverlayPosition.value_or_default())
    {
    case FpsOverlayPos_TopLeft:
        anchor = ImVec2(margin, margin);
        pivot = ImVec2(0.0f, 0.0f);
        break;
    case FpsOverlayPos_BottomLeft:
        anchor = ImVec2(margin, io.DisplaySize.y - margin);
        pivot = ImVec2(0.0f, 1.0f);
        break;
    case FpsOverlayPos_BottomRight:
        anchor = ImVec2(io.DisplaySize.x - margin, io.DisplaySize.y - margin);
        pivot = ImVec2(1.0f, 1.0f);
        break;
    case FpsOverlayPos_TopRight:
    default:
        break;
    }

    ImGui::SetNextWindowPos(anchor, ImGuiCond_Always, pivot);
    ImGui::SetNextWindowSize(ImVec2(430.0f * scale, 0.0f), ImGuiCond_Always);
    ImGui::SetNextWindowBgAlpha(opacity);

    ImGui::PushStyleVar(ImGuiStyleVar_WindowRounding, 22.0f * scale);
    ImGui::PushStyleVar(ImGuiStyleVar_FrameRounding, 11.0f * scale);
    ImGui::PushStyleVar(ImGuiStyleVar_WindowPadding, ImVec2(20.0f, 18.0f) * scale);
    ImGui::PushStyleVar(ImGuiStyleVar_ItemSpacing, ImVec2(10.0f, 11.0f) * scale);
    ImGui::PushStyleVar(ImGuiStyleVar_FramePadding, ImVec2(10.0f, 7.0f) * scale);
    ImGui::PushStyleColor(ImGuiCol_WindowBg, ImVec4(0.035f, 0.055f, 0.070f, 1.0f));
    ImGui::PushStyleColor(ImGuiCol_Border, ImVec4(0.50f, 0.92f, 0.48f, 0.22f));
    ImGui::PushStyleColor(ImGuiCol_FrameBg, ImVec4(0.10f, 0.15f, 0.18f, 0.72f));
    ImGui::PushStyleColor(ImGuiCol_FrameBgHovered, ImVec4(0.14f, 0.20f, 0.23f, 0.86f));
    ImGui::PushStyleColor(ImGuiCol_FrameBgActive, ImVec4(0.16f, 0.23f, 0.26f, 0.92f));
    ImGui::PushStyleColor(ImGuiCol_CheckMark, ImVec4(0.52f, 0.93f, 0.44f, 1.0f));
    ImGui::PushStyleColor(ImGuiCol_Header, ImVec4(0.28f, 0.55f, 0.29f, 0.42f));
    ImGui::PushStyleColor(ImGuiCol_HeaderHovered, ImVec4(0.34f, 0.66f, 0.34f, 0.56f));
    ImGui::PushStyleColor(ImGuiCol_Button, ImVec4(0.12f, 0.18f, 0.21f, 0.74f));
    ImGui::PushStyleColor(ImGuiCol_ButtonHovered, ImVec4(0.18f, 0.27f, 0.28f, 0.92f));

    const auto flags = ImGuiWindowFlags_NoTitleBar | ImGuiWindowFlags_NoCollapse |
                       ImGuiWindowFlags_NoScrollbar | ImGuiWindowFlags_NoSavedSettings |
                       ImGuiWindowFlags_AlwaysAutoResize;

    bool changed = false;
    if (ImGui::Begin("DLSS 5##DoubleSixunCompactOverlay", nullptr, flags))
    {
        ImGui::TextColored(ImVec4(0.58f, 0.95f, 0.50f, 1.0f), "DLSS 5");
        ImGui::SameLine();
        ImGui::TextDisabled("Neural Rendering");
        ImGui::Spacing();
        ImGui::Separator();
        ImGui::Spacing();

        bool enabled = config->DlssNrEnabled.value_or_default();
        if (ImGui::Checkbox("Neural Rendering", &enabled))
        {
            config->DlssNrEnabled = enabled;
            changed = true;
        }

        ImGui::BeginDisabled(!enabled);
        bool beforeSr = config->DlssNrRunBeforeSr.value_or_default();
        if (ImGui::Checkbox("Pre-SR  (run before DLSS Super Resolution)", &beforeSr))
        {
            config->DlssNrRunBeforeSr = beforeSr;
            changed = true;
        }

        int passes = (int) std::clamp(config->DlssNrPasses.value_or_default(), 1u, 3u);
        ImGui::SetNextItemWidth(160.0f * scale);
        if (ImGui::Combo("Passes", &passes, "1\0\2\0\3\0\0"))
        {
            config->DlssNrPasses = (uint32_t) std::clamp(passes, 1, 3);
            changed = true;
        }

        const char* styles[] = { "Standard", "Natural", "Cinematic" };
        int style1 = (int) std::clamp(config->DlssNrStyle.value_or_default(), 0u, 2u);
        ImGui::SetNextItemWidth(190.0f * scale);
        if (ImGui::Combo("Pass 1 style", &style1, styles, IM_ARRAYSIZE(styles)))
        {
            config->DlssNrStyle = (uint32_t) style1;
            changed = true;
        }

        auto inheritedStyle = [&](const char* label, auto* option) {
            const char* choices[] = { "Inherit Pass 1", "Standard", "Natural", "Cinematic" };
            int selected = 0;
            if (option->has_value())
                selected = std::clamp((int) option->value(), 0, 2) + 1;
            ImGui::SetNextItemWidth(190.0f * scale);
            if (!ImGui::Combo(label, &selected, choices, IM_ARRAYSIZE(choices)))
                return false;
            if (selected == 0)
                option->reset();
            else
                *option = (uint32_t) (selected - 1);
            return true;
        };

        if (passes >= 2 && inheritedStyle("Pass 2 style", &config->DlssNrPass2Style)) changed = true;
        if (passes >= 3 && inheritedStyle("Pass 3 style", &config->DlssNrPass3Style)) changed = true;
        ImGui::EndDisabled();

        ImGui::Spacing();
        ImGui::Separator();
        ImGui::Spacing();
        ImGui::TextDisabled(enabled ? (beforeSr ? "Active: Pre-SR" : "Active: After-SR") : "Neural Rendering is off");
        ImGui::SameLine(ImGui::GetWindowWidth() - (154.0f * scale));
        ImGui::TextDisabled("shortcut toggles panel");
    }
    ImGui::End();

    if (changed)
        config->SaveIni();

    ImGui::PopStyleColor(10);
    ImGui::PopStyleVar(5);
}
'''


def find_function_end(text: str, signature_offset: int) -> tuple[int, int]:
    brace = text.find("{", signature_offset)
    if brace < 0:
        raise RuntimeError("function opening brace not found")
    depth = 0
    i = brace
    state = "code"
    while i < len(text):
        c = text[i]
        n = text[i + 1] if i + 1 < len(text) else ""
        if state == "code":
            if c == '"':
                state = "string"
            elif c == "'":
                state = "char"
            elif c == "/" and n == "/":
                state = "line_comment"; i += 1
            elif c == "/" and n == "*":
                state = "block_comment"; i += 1
            elif c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
                if depth == 0:
                    return signature_offset, i + 1
        elif state == "string":
            if c == "\\": i += 1
            elif c == '"': state = "code"
        elif state == "char":
            if c == "\\": i += 1
            elif c == "'": state = "code"
        elif state == "line_comment":
            if c == "\n": state = "code"
        elif state == "block_comment":
            if c == "*" and n == "/": state = "code"; i += 1
        i += 1
    raise RuntimeError("function closing brace not found")


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: patch-optiscaler-compact-overlay.py <OptiScaler checkout>", file=sys.stderr)
        return 2
    root = pathlib.Path(sys.argv[1]).resolve()
    target = root / "OptiScaler" / "menu" / "menu_common.cpp"
    text = target.read_text(encoding="utf-8-sig")
    if "DoubleSixunCompactOverlay" in text:
        print("compact overlay patch already present")
        return 0
    start = text.find(SIGNATURE)
    if start < 0:
        raise RuntimeError(f"pinned function signature not found in {target}")
    start, end = find_function_end(text, start)
    patched = text[:start] + REPLACEMENT + text[end:]
    target.write_text(patched, encoding="utf-8")
    print(f"patched {target}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
