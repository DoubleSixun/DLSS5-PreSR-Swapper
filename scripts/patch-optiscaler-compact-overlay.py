#!/usr/bin/env python3
"""Patch pinned OptiScaler v0.7.7 with a compact DLSS 5 NR menu body.

Keep OptiScaler's original RenderMainMenuWindow, frame/input handling, GPU guard,
font/scale lifecycle and ImGui host intact. Only replace the content table plus
its graph/footer sections. This is deliberately narrower than the old patch,
which replaced the whole main window and could desynchronise game input/menu
state on some titles.
"""

from __future__ import annotations

import pathlib
import sys

TABLE_SIGNATURE = "void MenuCommon::RenderMainMenuTable(RenderMenuContext& ctx)"
GRAPHS_SIGNATURE = "void MenuCommon::RenderMainMenuGraphs(RenderMenuContext& ctx)"
BOTTOM_SIGNATURE = "void MenuCommon::RenderMainMenuBottomBar(RenderMenuContext& ctx)"

TABLE_REPLACEMENT = r'''void MenuCommon::RenderMainMenuTable(RenderMenuContext& ctx)
{
    auto config = ctx.config;
    const float scale = std::clamp(ctx.menuResScale, 0.75f, 1.50f);

    ImGui::PushID("DoubleSixunCompactOverlay");
    ImGui::PushStyleVar(ImGuiStyleVar_FrameRounding, 10.0f * scale);
    ImGui::PushStyleVar(ImGuiStyleVar_ItemSpacing, ImVec2(10.0f, 10.0f) * scale);
    ImGui::PushStyleVar(ImGuiStyleVar_FramePadding, ImVec2(10.0f, 7.0f) * scale);
    ImGui::PushStyleColor(ImGuiCol_CheckMark, ImVec4(0.52f, 0.93f, 0.44f, 1.0f));
    ImGui::PushStyleColor(ImGuiCol_FrameBg, ImVec4(0.10f, 0.15f, 0.18f, 0.72f));
    ImGui::PushStyleColor(ImGuiCol_FrameBgHovered, ImVec4(0.14f, 0.20f, 0.23f, 0.86f));
    ImGui::PushStyleColor(ImGuiCol_FrameBgActive, ImVec4(0.16f, 0.23f, 0.26f, 0.92f));
    ImGui::PushStyleColor(ImGuiCol_Header, ImVec4(0.28f, 0.55f, 0.29f, 0.42f));
    ImGui::PushStyleColor(ImGuiCol_HeaderHovered, ImVec4(0.34f, 0.66f, 0.34f, 0.56f));

    bool changed = false;
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
    ImGui::SetNextItemWidth(170.0f * scale);
    if (ImGui::Combo("Passes", &passes, "1\0\2\0\3\0\0"))
    {
        config->DlssNrPasses = (uint32_t) std::clamp(passes, 1, 3);
        changed = true;
    }

    const char* styles[] = { "Standard", "Natural", "Cinematic" };
    int style1 = (int) std::clamp(config->DlssNrStyle.value_or_default(), 0u, 2u);
    ImGui::SetNextItemWidth(205.0f * scale);
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
        ImGui::SetNextItemWidth(205.0f * scale);
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

    if (changed)
        config->SaveIni();

    ImGui::PopStyleColor(6);
    ImGui::PopStyleVar(3);
    ImGui::PopID();
}
'''

GRAPHS_REPLACEMENT = r'''void MenuCommon::RenderMainMenuGraphs(RenderMenuContext& ctx)
{
    // Compact manager overlay intentionally omits diagnostic plots. Keeping this
    // as a narrow section patch preserves the upstream main-window lifecycle.
    (void) ctx;
}
'''

BOTTOM_REPLACEMENT = r'''void MenuCommon::RenderMainMenuBottomBar(RenderMenuContext& ctx)
{
    auto config = ctx.config;
    auto& io = ctx.io;

    ImGui::Spacing();
    ImGui::Separator();
    ImGui::Spacing();

    if (ImGui::Button("Save Settings"))
        config->SaveIni();

    ImGui::SameLine(0.0f, 8.0f);
    if (ImGui::Button("Close"))
    {
        // Preserve OptiScaler's original close/input cleanup verbatim. The game
        // must regain keyboard/mouse ownership through the same path as stock.
        _isVisible = false;
        hasGamepad = (io.BackendFlags | ImGuiBackendFlags_HasGamepad) > 0;
        io.BackendFlags &= 30;
        io.ConfigFlags = ImGuiConfigFlags_NoMouse | ImGuiConfigFlags_NoMouseCursorChange | ImGuiConfigFlags_NoKeyboard;
        _showMipmapCalcWindow = false;
        _showHudlessWindow = false;
        io.MouseDrawCursor = false;
        io.WantCaptureKeyboard = false;
        io.WantCaptureMouse = false;
    }

    // Use the manager's position preference only for the initial placement. Once
    // the user drags the menu, preserve the manually chosen position for the rest
    // of the session, matching upstream behavior.
    const auto winSize = ImGui::GetWindowSize();
    const auto winPos = ImGui::GetWindowPos();
    if (lastPosition.x < -900.0f ||
        (lastPosition.x >= winPos.x - 1.0f && lastPosition.y >= winPos.y - 1.0f &&
         lastPosition.x <= winPos.x + 1.0f && lastPosition.y <= winPos.y + 1.0f))
    {
        const float margin = 26.0f * std::clamp(ctx.menuResScale, 0.75f, 1.50f);
        float posX = std::max(margin, (io.DisplaySize.x - winSize.x) * 0.5f);
        float posY = std::max(margin, (io.DisplaySize.y - winSize.y) * 0.5f);

        switch (config->FpsOverlayPosition.value_or_default())
        {
        case FpsOverlayPos_TopLeft:
            posX = margin;
            posY = margin;
            break;
        case FpsOverlayPos_TopRight:
            posX = std::max(margin, io.DisplaySize.x - winSize.x - margin);
            posY = margin;
            break;
        case FpsOverlayPos_BottomLeft:
            posX = margin;
            posY = std::max(margin, io.DisplaySize.y - winSize.y - margin);
            break;
        case FpsOverlayPos_BottomRight:
            posX = std::max(margin, io.DisplaySize.x - winSize.x - margin);
            posY = std::max(margin, io.DisplaySize.y - winSize.y - margin);
            break;
        default:
            break;
        }

        ImGui::SetWindowPos(ImVec2 { posX, posY });
        lastPosition = ImVec2 { posX, posY };
    }
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
                state = "line_comment"
                i += 1
            elif c == "/" and n == "*":
                state = "block_comment"
                i += 1
            elif c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
                if depth == 0:
                    return signature_offset, i + 1
        elif state == "string":
            if c == "\\":
                i += 1
            elif c == '"':
                state = "code"
        elif state == "char":
            if c == "\\":
                i += 1
            elif c == "'":
                state = "code"
        elif state == "line_comment":
            if c == "\n":
                state = "code"
        elif state == "block_comment":
            if c == "*" and n == "/":
                state = "code"
                i += 1
        i += 1
    raise RuntimeError("function closing brace not found")


def replace_function(text: str, signature: str, replacement: str) -> str:
    start = text.find(signature)
    if start < 0:
        raise RuntimeError(f"pinned function signature not found: {signature}")
    start, end = find_function_end(text, start)
    return text[:start] + replacement + text[end:]


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

    # Do not patch RenderMainMenuWindow: it owns the stable upstream ImGui/input
    # lifecycle. Only swap the visible content sections inside that host.
    text = replace_function(text, TABLE_SIGNATURE, TABLE_REPLACEMENT)
    text = replace_function(text, GRAPHS_SIGNATURE, GRAPHS_REPLACEMENT)
    text = replace_function(text, BOTTOM_SIGNATURE, BOTTOM_REPLACEMENT)
    target.write_text(text, encoding="utf-8")
    print(f"patched compact content while preserving upstream menu host: {target}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
