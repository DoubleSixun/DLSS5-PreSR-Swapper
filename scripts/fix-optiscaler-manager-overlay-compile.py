#!/usr/bin/env python3
"""Compatibility and product-UI fixes applied after the independent manager overlay patch.

The manager overlay deliberately reuses OptiScaler's proven ImGui/render/input host, while the
visible panel is owned by DLSS 5 Neural Rendering Manager. This post-patch adapts pinned v0.7.7
APIs, adds manager-language plumbing, loads CJK glyphs when Chinese is selected, and applies the
small layout/UX refinements that belong to our panel rather than OptiScaler's stock menu.
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


def replace_once(text: str, old: str, new: str, label: str) -> str:
    return replace_exact(text, old, new, label, expected=1)


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: fix-optiscaler-manager-overlay-compile.py <OptiScaler checkout>", file=sys.stderr)
        return 2

    root = pathlib.Path(sys.argv[1]).resolve()
    target = root / "OptiScaler" / "menu" / "menu_common.cpp"
    config_h = root / "OptiScaler" / "Config.h"
    config_cpp = root / "OptiScaler" / "Config.cpp"

    text = target.read_text(encoding="utf-8-sig")

    # IsRunningVk is implemented in the pinned backend but declared in this header,
    # which stock menu_common.cpp does not otherwise need.
    include_anchor = "#include <dlssnr/DlssNr_ExposureScan.h>\n"
    include_line = "#include <dlssnr/DlssNrFeature_Vk.h>\n"
    if include_line not in text:
        text = replace_once(text, include_anchor, include_anchor + include_line, "Vulkan NR header include")

    # Pinned ImGui has GetContentRegionAvail(), not the newer window-content helper.
    old_edge = "ImGui::GetWindowContentRegionMax().x"
    new_edge = "(ImGui::GetCursorPosX() + ImGui::GetContentRegionAvail().x)"
    text = replace_exact(text, old_edge, new_edge, "content region edge", expected=2)

    # Pull the panel inward from the physical screen edge. Vertical spacing stays compact;
    # the larger horizontal safe margin matches modern game overlays and avoids edge clipping.
    old_position = r'''    const float margin = 26.0f * scale;

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
        break;'''
    new_position = r'''    const float horizontalMargin = 64.0f * scale;
    const float verticalMargin = 26.0f * scale;

    ImVec2 anchor(io.DisplaySize.x - horizontalMargin, verticalMargin);
    ImVec2 pivot(1.0f, 0.0f);
    switch (config->FpsOverlayPosition.value_or_default())
    {
    case FpsOverlayPos_TopLeft:
        anchor = ImVec2(horizontalMargin, verticalMargin);
        pivot = ImVec2(0.0f, 0.0f);
        break;
    case FpsOverlayPos_BottomLeft:
        anchor = ImVec2(horizontalMargin, io.DisplaySize.y - verticalMargin);
        pivot = ImVec2(0.0f, 1.0f);
        break;
    case FpsOverlayPos_BottomRight:
        anchor = ImVec2(io.DisplaySize.x - horizontalMargin, io.DisplaySize.y - verticalMargin);
        pivot = ImVec2(1.0f, 1.0f);
        break;'''
    text = replace_once(text, old_position, new_position, "overlay safe margins")

    # Language is deliberately a manager-owned INI key. It follows the desktop app without
    # changing OptiScaler's own stock-menu language or exposing that menu to the user.
    language_anchor = "    const float opacity = std::clamp(config->MenuBGColorA.value_or_default(), 0.50f, 0.95f);\n"
    language_block = r'''    const bool zh = config->Dlss5ManagerLanguage.value_or_default() == "zh-CN";
    const auto tr = [zh](const char* en, const char* zhCn) -> const char* { return zh ? zhCn : en; };
'''
    text = replace_once(text, language_anchor, language_anchor + language_block, "overlay language helper")

    # Pass 2/3 style options are CustomOptional<uint32_t, NoDefault>, so do not instantiate
    # value_or_default() for them. Also hide the implementation-level "inherit Pass 1" choice:
    # an unset later pass simply displays Pass 1's effective style until the user chooses an override.
    # The compact right-aligned combo width leaves the label visible instead of pushing it offscreen.
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

    new_styles = r'''        auto styleRow = [&](const char* label, const char* id, int& style)
        {
            ImGui::TextUnformatted(label);
            ImGui::SameLine();
            const float comboWidth = 176.0f * scale;
            const float rightEdge = ImGui::GetCursorPosX() + ImGui::GetContentRegionAvail().x;
            ImGui::SetCursorPosX(std::max(ImGui::GetCursorPosX(), rightEdge - comboWidth));
            ImGui::SetNextItemWidth(comboWidth);
            return ImGui::Combo(id, &style, styles, IM_ARRAYSIZE(styles));
        };

        auto primaryStyleCombo = [&](const char* label, const char* id, auto* option)
        {
            int style = (int) std::clamp(option->value_or_default(), 0u, 2u);
            if (!styleRow(label, id, style))
                return false;
            *option = (uint32_t) style;
            return true;
        };

        auto optionalStyleCombo = [&](const char* label, const char* id, auto* option)
        {
            const int baseStyle = (int) std::clamp(config->DlssNrStyle.value_or_default(), 0u, 2u);
            int style = option->has_value() ? std::clamp((int) option->value(), 0, 2) : baseStyle;
            if (!styleRow(label, id, style))
                return false;
            *option = (uint32_t) style;
            return true;
        };

        ImGui::Spacing();
        if (primaryStyleCombo(tr("Pass 1 style", "第 1 层风格"), "##ManagerPass1Style", &config->DlssNrStyle))
            changed = true;
        if (passes >= 2 && optionalStyleCombo(tr("Pass 2 style", "第 2 层风格"), "##ManagerPass2Style", &config->DlssNrPass2Style))
            changed = true;
        if (passes >= 3 && optionalStyleCombo(tr("Pass 3 style", "第 3 层风格"), "##ManagerPass3Style", &config->DlssNrPass3Style))
            changed = true;'''
    text = replace_once(text, old_styles, new_styles, "style rows")

    # The old arrays still expose implementation-level inheritance; collapse to the three actual styles.
    text = replace_once(
        text,
        '        const char* styles[] = { "Standard", "Natural", "Cinematic" };\n        const char* inheritedStyles[] = { "Inherit Pass 1", "Standard", "Natural", "Cinematic" };',
        '        const char* styles[] = { tr("Standard", "标准"), tr("Natural", "自然"), tr("Cinematic", "电影感") };',
        "localized style names")

    # Main panel localization.
    replacements = [
        ('ImGui::TextDisabled("Neural Rendering");', 'ImGui::TextDisabled(tr("Neural Rendering", "神经渲染"));', 'subtitle'),
        ('ImGui::Checkbox("Neural Rendering", &enabled)', 'ImGui::Checkbox(tr("Neural Rendering", "神经渲染"), &enabled)', 'NR checkbox'),
        ('ImGui::Checkbox("Pre-SR", &beforeSr)', 'ImGui::Checkbox(tr("Pre-SR", "Pre-SR（超分前）"), &beforeSr)', 'Pre-SR checkbox'),
        ('ImGui::SetTooltip("Run Neural Rendering before DLSS Super Resolution.");', 'ImGui::SetTooltip("%s", tr("Run Neural Rendering before DLSS Super Resolution.", "在 DLSS 超分辨率之前运行神经渲染。"));', 'Pre-SR tooltip'),
        ('ImGui::TextDisabled("Passes");', 'ImGui::TextDisabled(tr("Passes", "层数"));', 'passes label'),
        ('ImGui::SliderInt("Model resolution", &scalePercent, 25, 200, "%d%%")', 'ImGui::SliderInt(tr("Model resolution", "模型分辨率"), &scalePercent, 25, 200, "%d%%")', 'model resolution'),
        ('ImGui::SetTooltip("Lower values improve performance. Higher values increase Neural Rendering detail.");', 'ImGui::SetTooltip("%s", tr("Lower values improve performance. Higher values increase Neural Rendering detail.", "降低可提升性能；提高可增加神经渲染细节。"));', 'resolution tooltip'),
        ('ImGui::SliderFloat("Detail strength", &detail, 0.0f, 2.0f, "%.2f")', 'ImGui::SliderFloat(tr("Detail strength", "细节强度"), &detail, 0.0f, 2.0f, "%.2f")', 'detail strength'),
        ('ImGui::SliderFloat("Colour strength", &colour, 0.0f, 4.0f, "%.2f")', 'ImGui::SliderFloat(tr("Colour strength", "色彩强度"), &colour, 0.0f, 4.0f, "%.2f")', 'colour strength'),
        ('ImGui::CollapsingHeader("Advanced")', 'ImGui::CollapsingHeader(tr("Advanced", "高级"))', 'advanced header'),
        ('ImGui::Checkbox("Apply to finished picture", &finishedPicture)', 'ImGui::Checkbox(tr("Apply to finished picture", "应用到最终画面"), &finishedPicture)', 'finished picture'),
        ('ImGui::TextDisabled("Finished-picture mode requires native DirectX 12.");', 'ImGui::TextDisabled("%s", tr("Finished-picture mode requires native DirectX 12.", "最终画面模式需要原生 DirectX 12。"));', 'finished picture hint'),
        ('ImGui::Checkbox("Apply effect (A/B preview)", &applyModel)', 'ImGui::Checkbox(tr("Apply effect (A/B preview)", "应用效果（A/B 对比）"), &applyModel)', 'A/B checkbox'),
        ('ImGui::SetTooltip("Turn off to compare before/after. Neural Rendering still runs and keeps its GPU cost.");', 'ImGui::SetTooltip("%s", tr("Turn off to compare before/after. Neural Rendering still runs and keeps its GPU cost.", "关闭可对比前后效果；神经渲染仍会运行并保持 GPU 开销。"));', 'A/B tooltip'),
        ('ImGui::CollapsingHeader("Experimental")', 'ImGui::CollapsingHeader(tr("Experimental", "实验性"))', 'experimental header'),
        ('"Experimental - may cause artifacts, latency, or require restart.");', '"%s", tr("Experimental - may cause artifacts, latency, or require restart.", "实验性功能 - 可能产生伪影、延迟，或需要重启游戏。"));', 'experimental warning'),
        ('ImGui::Checkbox("Carry Pre-SR edit across Ray Reconstruction", &residualAcrossRr)', 'ImGui::Checkbox(tr("Carry Pre-SR edit across Ray Reconstruction", "将 Pre-SR 编辑保留到光线重建"), &residualAcrossRr)', 'RR residual'),
        ('ImGui::SliderFloat("RR detail accumulation", &rrBlend, 0.01f, 1.0f, "%.2f")', 'ImGui::SliderFloat(tr("RR detail accumulation", "光线重建细节累积"), &rrBlend, 0.01f, 1.0f, "%.2f")', 'RR detail'),
        ('ImGui::Checkbox("Generate before SR, apply after SR", &deferred)', 'ImGui::Checkbox(tr("Generate before SR, apply after SR", "超分前生成，超分后应用"), &deferred)', 'deferred NR'),
        ('ImGui::Checkbox("NR every second frame with NVIDIA FG", &everySecond)', 'ImGui::Checkbox(tr("NR every second frame with NVIDIA FG", "配合 NVIDIA 帧生成时每隔一帧运行 NR"), &everySecond)', 'every second frame'),
        ('ImGui::Checkbox("Allow approximate FG camera guides", &approximateCamera)', 'ImGui::Checkbox(tr("Allow approximate FG camera guides", "允许近似的帧生成相机引导"), &approximateCamera)', 'camera guides'),
        ('ImGui::Combo("Model precision", &precision, precisionNames, IM_ARRAYSIZE(precisionNames))', 'ImGui::Combo(tr("Model precision", "模型精度"), &precision, precisionNames, IM_ARRAYSIZE(precisionNames))', 'model precision'),
        ('ImGui::Combo("HDR mapping", &hdrMode, hdrModes, IM_ARRAYSIZE(hdrModes))', 'ImGui::Combo(tr("HDR mapping", "HDR 映射"), &hdrMode, hdrModes, IM_ARRAYSIZE(hdrModes))', 'HDR mapping'),
    ]
    for old, new, label in replacements:
        text = replace_once(text, old, new, label)

    # Localize advanced-pass controls and keep every currently-active pass open by default.
    text = replace_once(
        text,
        '                const std::string title = "Pass " + std::to_string(pass);',
        '                const std::string title = zh ? "第 " + std::to_string(pass) + " 层" : "Pass " + std::to_string(pass);',
        "advanced pass title")
    text = replace_once(
        text,
        '                if (ImGui::TreeNodeEx(title.c_str(), pass == 1 ? ImGuiTreeNodeFlags_DefaultOpen : 0))',
        '                if (ImGui::TreeNodeEx(title.c_str(), ImGuiTreeNodeFlags_DefaultOpen))',
        "active pass default expansion")
    for old, new, label in [
        ('deferredSlider("Intensity", intensity', 'deferredSlider(tr("Intensity", "强度"), intensity', 'intensity'),
        ('deferredSlider("Local structure", structure', 'deferredSlider(tr("Local structure", "局部结构"), structure', 'local structure'),
        ('deferredSlider("Local tone", tone', 'deferredSlider(tr("Local tone", "局部色调"), tone', 'local tone'),
        ('deferredSlider("Skin structure", skin', 'deferredSlider(tr("Skin structure", "皮肤结构"), skin', 'skin structure'),
        ('ImGui::Checkbox("Auto skin mask", &mask)', 'ImGui::Checkbox(tr("Auto skin mask", "自动皮肤遮罩"), &mask)', 'auto mask'),
        ('ImGui::SmallButton("Reset##AutoMask")', 'ImGui::SmallButton(tr("Reset##AutoMask", "重置##AutoMask"))', 'auto mask reset'),
    ]:
        text = replace_once(text, old, new, label)
    text = replace_once(
        text,
        '                const std::string reset = std::string("Reset##") + label;',
        '                const std::string reset = std::string(zh ? "重置##" : "Reset##") + label;',
        "localized reset button")

    # Translate the HDR option values rather than leaving an otherwise-Chinese panel half-English.
    old_hdr = r'''            const char* hdrModes[] = { "Off (soft knee)", "Neutwo + composed", "Neutwo + replace",
                                       "Hybrid + composed", "Hybrid + replace" };'''
    new_hdr = r'''            const char* hdrModes[] = { tr("Off (soft knee)", "关闭（柔和拐点）"),
                                       tr("Neutwo + composed", "Neutwo + 合成"), tr("Neutwo + replace", "Neutwo + 替换"),
                                       tr("Hybrid + composed", "混合 + 合成"), tr("Hybrid + replace", "混合 + 替换") };'''
    text = replace_once(text, old_hdr, new_hdr, "HDR mode names")

    # Footer status and close hint.
    old_status = r'''        const bool running = DlssNr::IsRunning() || DlssNr::IsRunningVk();
        if (!enabled)
            ImGui::TextDisabled("Off");
        else if (running)
            ImGui::TextColored(ImVec4(0.52f, 0.94f, 0.42f, 1.0f), "%s - %d pass%s",
                               beforeSr ? "Pre-SR active" : "After-SR active", passes, passes == 1 ? "" : "es");
        else
            ImGui::TextColored(ImVec4(0.90f, 0.72f, 0.34f, 1.0f), "Waiting for DLSS / rendered scene");'''
    new_status = r'''        const bool running = DlssNr::IsRunning() || DlssNr::IsRunningVk();
        if (!enabled)
            ImGui::TextDisabled("%s", tr("Off", "关闭"));
        else if (running)
        {
            const char* mode = beforeSr ? tr("Pre-SR active", "Pre-SR 已启用") : tr("After-SR active", "后置 NR 已启用");
            if (zh)
                ImGui::TextColored(ImVec4(0.52f, 0.94f, 0.42f, 1.0f), "%s · %d 层", mode, passes);
            else
                ImGui::TextColored(ImVec4(0.52f, 0.94f, 0.42f, 1.0f), "%s · %d pass%s", mode, passes, passes == 1 ? "" : "es");
        }
        else
            ImGui::TextColored(ImVec4(0.90f, 0.72f, 0.34f, 1.0f), "%s", tr("Waiting for DLSS / rendered scene", "等待 DLSS / 3D 场景"));'''
    text = replace_once(text, old_status, new_status, "localized status footer")
    text = replace_once(
        text,
        '        const std::string closeHint = shortcut + " / Esc to close";',
        '        const std::string closeHint = shortcut + (zh ? " / Esc 关闭" : " / Esc to close");',
        "localized close hint")

    # Add a manager-owned language option to the pinned Config surface.
    cfg_h = config_h.read_text(encoding="utf-8-sig")
    cfg_h = replace_once(
        cfg_h,
        '    CustomOptional<float> MenuBGColorA { 0.99f };',
        '    CustomOptional<float> MenuBGColorA { 0.99f };\n    CustomOptional<std::string> Dlss5ManagerLanguage { "en" };',
        "manager language config field")
    config_h.write_text(cfg_h, encoding="utf-8")

    cfg_cpp = config_cpp.read_text(encoding="utf-8-sig")
    cfg_cpp = replace_once(
        cfg_cpp,
        '            DisableSplash.set_from_config(readBool("Menu", "DisableSplash"));',
        '            DisableSplash.set_from_config(readBool("Menu", "DisableSplash"));\n            Dlss5ManagerLanguage.set_from_config(readString("Menu", "DLSS5ManagerLanguage"));',
        "manager language config load")
    config_cpp.write_text(cfg_cpp, encoding="utf-8")

    # OptiScaler normally loads only the default Latin glyph range even for a custom TTF.
    # When the Manager asks for Chinese, load the full Chinese range from the system CJK font
    # selected by the Electron app. English keeps the smaller/default range.
    glyph_old = "io.Fonts->GetGlyphRangesDefault()"
    glyph_new = '(Config::Instance()->Dlss5ManagerLanguage.value_or_default() == "zh-CN" ? io.Fonts->GetGlyphRangesChineseFull() : io.Fonts->GetGlyphRangesDefault())'
    text = replace_exact(text, glyph_old, glyph_new, "manager CJK glyph range")

    target.write_text(text, encoding="utf-8")
    print(f"applied manager overlay compatibility/localization fixes: {target}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
