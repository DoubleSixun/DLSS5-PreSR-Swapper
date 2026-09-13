#!/usr/bin/env python3
"""Patch pinned OptiScaler v0.7.7 into the manager's compact DLSS 5 overlay.

Keep OptiScaler's menu visibility, input capture, frame lifecycle and renderer hooks intact.
Only replace the visible NR controls/footer and narrowly restyle the existing host window.
"""

from __future__ import annotations

import pathlib
import sys

TABLE_SIGNATURE = "void MenuCommon::RenderMainMenuTable(RenderMenuContext& ctx)"
GRAPHS_SIGNATURE = "void MenuCommon::RenderMainMenuGraphs(RenderMenuContext& ctx)"
BOTTOM_SIGNATURE = "void MenuCommon::RenderMainMenuBottomBar(RenderMenuContext& ctx)"

FLAGS_OLD = '''    ImGuiWindowFlags flags = 0;\n    flags |= ImGuiWindowFlags_NoSavedSettings;\n    flags |= ImGuiWindowFlags_NoCollapse;\n    flags |= ImGuiWindowFlags_AlwaysAutoResize;'''

FLAGS_NEW = '''    ImGuiWindowFlags flags = 0;\n    flags |= ImGuiWindowFlags_NoSavedSettings;\n    flags |= ImGuiWindowFlags_NoCollapse;\n    flags |= ImGuiWindowFlags_AlwaysAutoResize;\n    flags |= ImGuiWindowFlags_NoTitleBar;\n    flags |= ImGuiWindowFlags_NoResize;\n    flags |= ImGuiWindowFlags_NoScrollbar;'''

HOST_OLD = '''    if (ImGui::Begin(windowTitle.c_str(), NULL, flags))\n    {\n        // Header/status messages shown above the two-column settings table.\n        RenderMainMenuHeaderMessages(ctx);\n\n        // Main two-column settings content.\n        RenderMainMenuTable(ctx);\n\n        // Diagnostics and footer actions below the settings table.\n        RenderMainMenuGraphs(ctx);\n        RenderMainMenuBottomBar(ctx);\n\n        ImGui::End();\n    }'''

HOST_NEW = '''    const float compactHostScale = std::clamp(menuResScale, 0.75f, 1.50f);\n    const float compactHostOpacity = std::clamp(config->FpsOverlayAlpha.value_or_default(), 0.50f, 0.95f);\n    const float compactMargin = 26.0f * compactHostScale;\n    ImVec2 compactAnchor(ctx.io.DisplaySize.x - compactMargin, compactMargin);\n    ImVec2 compactPivot(1.0f, 0.0f);\n    switch (config->FpsOverlayPosition.value_or_default())\n    {\n    case FpsOverlayPos_TopLeft:\n        compactAnchor = ImVec2(compactMargin, compactMargin);\n        compactPivot = ImVec2(0.0f, 0.0f);\n        break;\n    case FpsOverlayPos_BottomLeft:\n        compactAnchor = ImVec2(compactMargin, ctx.io.DisplaySize.y - compactMargin);\n        compactPivot = ImVec2(0.0f, 1.0f);\n        break;\n    case FpsOverlayPos_BottomRight:\n        compactAnchor = ImVec2(ctx.io.DisplaySize.x - compactMargin, ctx.io.DisplaySize.y - compactMargin);\n        compactPivot = ImVec2(1.0f, 1.0f);\n        break;\n    case FpsOverlayPos_TopRight:\n    default:\n        break;\n    }\n\n    ImGui::SetNextWindowPos(compactAnchor, ImGuiCond_Appearing, compactPivot);\n    ImGui::SetNextWindowSizeConstraints(ImVec2(390.0f * compactHostScale, 0.0f),\n                                        ImVec2(520.0f * compactHostScale, FLT_MAX));\n    ImGui::SetNextWindowBgAlpha(compactHostOpacity);\n    ImGui::PushStyleVar(ImGuiStyleVar_WindowRounding, 18.0f * compactHostScale);\n    ImGui::PushStyleVar(ImGuiStyleVar_WindowPadding, ImVec2(18.0f, 16.0f) * compactHostScale);\n    ImGui::PushStyleVar(ImGuiStyleVar_WindowBorderSize, 1.0f);\n    ImGui::PushStyleColor(ImGuiCol_WindowBg, ImVec4(0.030f, 0.048f, 0.060f, 1.0f));\n    ImGui::PushStyleColor(ImGuiCol_Border, ImVec4(0.52f, 0.93f, 0.44f, 0.20f));\n\n    const bool compactHostVisible = ImGui::Begin("DLSS 5 Neural Rendering##DoubleSixunCompactHost", NULL, flags);\n    if (compactHostVisible)\n    {\n        // Keep the stock host lifecycle but omit OptiScaler's large status/header block.\n        RenderMainMenuTable(ctx);\n        RenderMainMenuGraphs(ctx);\n        RenderMainMenuBottomBar(ctx);\n    }\n    ImGui::End();\n\n    ImGui::PopStyleColor(2);\n    ImGui::PopStyleVar(3);'''

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
    int passIndex = passes - 1;
    const char* passChoices[] = { "1", "2", "3" };
    ImGui::SetNextItemWidth(170.0f * scale);
    if (ImGui::Combo("Passes", &passIndex, passChoices, IM_ARRAYSIZE(passChoices)))
    {
        passes = std::clamp(passIndex + 1, 1, 3);
        config->DlssNrPasses = (uint32_t) passes;
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


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if old not in text:
        raise RuntimeError(f"pinned {label} block not found")
    return text.replace(old, new, 1)


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

    # Preserve RenderMainMenuWindow's execution/input lifecycle. Only restyle the
    # existing host at two narrow call sites and replace its visible content helpers.
    text = replace_function(text, TABLE_SIGNATURE, TABLE_REPLACEMENT)
    text = replace_function(text, GRAPHS_SIGNATURE, GRAPHS_REPLACEMENT)
    text = replace_function(text, BOTTOM_SIGNATURE, BOTTOM_REPLACEMENT)
    text = replace_once(text, FLAGS_OLD, FLAGS_NEW, "main-menu flags")
    text = replace_once(text, HOST_OLD, HOST_NEW, "main-menu host")

    target.write_text(text, encoding="utf-8")
    print(f"patched compact DLSS 5 overlay while preserving OptiScaler lifecycle: {target}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
