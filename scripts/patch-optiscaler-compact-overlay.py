#!/usr/bin/env python3
# Patch pinned OptiScaler v0.7.7 with an independent DLSS 5 Manager overlay.
#
# The manager panel has its own visibility state and never opens OptiScaler's
# stock RenderMainMenuWindow. It reuses OptiScaler's existing ImGui renderer
# and input plumbing so no second graphics injector (such as ReShade) is needed.

from __future__ import annotations

import pathlib
import sys

VISIBILITY_ANCHOR = "static bool capturingKey = false;"
RENDER_MENU_SIGNATURE = "bool MenuCommon::RenderMenu()"
INPUT_MODE_SIGNATURE = "void MenuCommon::UpdateMenuInputMode(RenderMenuContext& ctx)"
SHORTCUTS_SIGNATURE = "void MenuCommon::HandleMenuShortcuts(RenderMenuContext& ctx)"
HIDE_SIGNATURE = "void MenuCommon::HideMenu()"

MANAGER_STATE = r"""
static bool dlss5ManagerOverlayVisible = false;
"""

INPUT_MODE_REPLACEMENT = r"""void MenuCommon::UpdateMenuInputMode(RenderMenuContext& ctx)
{
    auto& io = ctx.io;
    const bool interactiveVisible = _isVisible || dlss5ManagerOverlayVisible;

    // Keep OptiScaler's proven input backend, but let the DLSS 5 Manager panel
    // own interaction without ever opening the stock OptiScaler main menu.
    if (interactiveVisible)
    {
        if (hasGamepad)
            io.BackendFlags |= ImGuiBackendFlags_HasGamepad;

        io.ConfigFlags = ImGuiConfigFlags_NavEnableKeyboard | ImGuiConfigFlags_NavEnableGamepad;
    }
    else
    {
        capturingKey = false;
        hasGamepad = (io.BackendFlags & ImGuiBackendFlags_HasGamepad) != 0;
        io.BackendFlags &= ~ImGuiBackendFlags_HasGamepad;
        io.ConfigFlags = ImGuiConfigFlags_NoMouse | ImGuiConfigFlags_NoMouseCursorChange | ImGuiConfigFlags_NoKeyboard;
    }
}
"""

SHORTCUTS_REPLACEMENT = r"""void MenuCommon::HandleMenuShortcuts(RenderMenuContext& ctx)
{
    auto& state = ctx.state;
    auto config = ctx.config;
    auto& io = ctx.io;

    if (inputFG)
    {
        inputFG = false;

        if (state.activeFgInput != FGInput::NoFG && state.activeFgOutput != FGOutput::NoFG &&
            (state.currentFGSwapchain != nullptr || state.activeFgInput == FGInput::NvngxFG))
        {
            config->FGEnabled = !config->FGEnabled.value_or_default();
            LOG_DEBUG("FG toggle key pressed, setting FGEnabled to {}", config->FGEnabled.value_or_default());

            if (config->FGEnabled.value_or_default())
                state.fgChanged = true;
        }
    }

    if (inputFps)
    {
        inputFps = false;
        config->ShowFps = !config->ShowFps.value_or_default();
    }

    if (inputDlssNr)
    {
        inputDlssNr = false;
        config->DlssNrEnabled = !config->DlssNrEnabled.value_or_default();
        LOG_DEBUG("Neural Rendering toggle key pressed, setting DlssNrEnabled to {}",
                  config->DlssNrEnabled.value_or_default());

        ImGuiToast toast { ImGuiToastType::Info, 2000 };
        toast.setTitle("DLSS 5 Neural Rendering");
        toast.setContent(config->DlssNrEnabled.value_or_default() ? "On" : "Off");
        ImGui::InsertNotification(toast);
    }

    if (inputFpsCycle && config->ShowFps.value_or_default())
        config->FpsOverlayType = (FpsOverlay) ((config->FpsOverlayType.value_or_default() + 1) % FpsOverlay_COUNT);

    if (inputMenu)
    {
        inputMenu = false;

        // The manager shortcut controls only our panel. OptiScaler's stock menu
        // stays closed, so none of its large diagnostic UI is user-facing.
        _isVisible = false;
        dlss5ManagerOverlayVisible = !dlss5ManagerOverlayVisible;

        LOG_DEBUG("DLSS 5 Manager overlay key pressed, {}", dlss5ManagerOverlayVisible ? "opening" : "closing");

        io.ClearEventsQueue();
        io.ClearInputKeys();
        io.ClearInputMouse();
        OptiInput::ResetMenuInputTransientState();

        if (dlss5ManagerOverlayVisible)
            ApplyThemeStyle();

        io.MouseDrawCursor = dlss5ManagerOverlayVisible;
        io.WantCaptureKeyboard = dlss5ManagerOverlayVisible;
        io.WantCaptureMouse = dlss5ManagerOverlayVisible;
        io.WantSetMousePos = false;
    }

    inputFpsCycle = false;
}
"""

HIDE_REPLACEMENT = r"""void MenuCommon::HideMenu()
{
    if (!_isVisible && !dlss5ManagerOverlayVisible)
        return;

    _isVisible = false;
    dlss5ManagerOverlayVisible = false;

    ImGuiIO& io = ImGui::GetIO();

    _showMipmapCalcWindow = false;
    _showHudlessWindow = false;

    io.MouseDrawCursor = false;
    io.WantCaptureKeyboard = false;
    io.WantCaptureMouse = false;
    io.WantSetMousePos = false;
    io.ConfigFlags = ImGuiConfigFlags_NoMouse | ImGuiConfigFlags_NoMouseCursorChange | ImGuiConfigFlags_NoKeyboard;

    OptiInput::SetMenuVisible(false);
}
"""

OVERLAY_FUNCTION = r"""
template <typename TContext>
static void RenderDlss5ManagerOverlay(TContext& ctx)
{
    if (!dlss5ManagerOverlayVisible)
        return;

    auto config = ctx.config;
    auto& io = ctx.io;
    const float scale = std::clamp(ctx.menuResScale, 0.75f, 1.50f);
    const float opacity = std::clamp(config->MenuBGColorA.value_or_default(), 0.50f, 0.95f);
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

    ImGui::SetNextWindowPos(anchor, ImGuiCond_Appearing, pivot);
    ImGui::SetNextWindowSizeConstraints(ImVec2(390.0f * scale, 0.0f),
                                        ImVec2(560.0f * scale, io.DisplaySize.y * 0.90f));
    ImGui::SetNextWindowBgAlpha(opacity);

    ImGuiWindowFlags flags = ImGuiWindowFlags_NoSavedSettings |
                             ImGuiWindowFlags_NoTitleBar |
                             ImGuiWindowFlags_NoCollapse |
                             ImGuiWindowFlags_AlwaysAutoResize;

    ImGui::PushStyleVar(ImGuiStyleVar_WindowRounding, 20.0f * scale);
    ImGui::PushStyleVar(ImGuiStyleVar_WindowPadding, ImVec2(20.0f, 18.0f) * scale);
    ImGui::PushStyleVar(ImGuiStyleVar_WindowBorderSize, 1.0f);
    ImGui::PushStyleVar(ImGuiStyleVar_FrameRounding, 10.0f * scale);
    ImGui::PushStyleVar(ImGuiStyleVar_FramePadding, ImVec2(10.0f, 7.0f) * scale);
    ImGui::PushStyleVar(ImGuiStyleVar_ItemSpacing, ImVec2(10.0f, 9.0f) * scale);

    ImGui::PushStyleColor(ImGuiCol_WindowBg, ImVec4(0.025f, 0.040f, 0.052f, 1.0f));
    ImGui::PushStyleColor(ImGuiCol_Border, ImVec4(0.50f, 0.93f, 0.39f, 0.34f));
    ImGui::PushStyleColor(ImGuiCol_CheckMark, ImVec4(0.52f, 0.96f, 0.42f, 1.0f));
    ImGui::PushStyleColor(ImGuiCol_FrameBg, ImVec4(0.085f, 0.115f, 0.135f, 0.86f));
    ImGui::PushStyleColor(ImGuiCol_FrameBgHovered, ImVec4(0.12f, 0.17f, 0.19f, 0.94f));
    ImGui::PushStyleColor(ImGuiCol_FrameBgActive, ImVec4(0.15f, 0.22f, 0.23f, 1.0f));
    ImGui::PushStyleColor(ImGuiCol_Header, ImVec4(0.25f, 0.52f, 0.25f, 0.48f));
    ImGui::PushStyleColor(ImGuiCol_HeaderHovered, ImVec4(0.32f, 0.66f, 0.31f, 0.62f));
    ImGui::PushStyleColor(ImGuiCol_SliderGrab, ImVec4(0.52f, 0.94f, 0.42f, 1.0f));
    ImGui::PushStyleColor(ImGuiCol_SliderGrabActive, ImVec4(0.62f, 1.0f, 0.52f, 1.0f));
    ImGui::PushStyleColor(ImGuiCol_Button, ImVec4(0.10f, 0.14f, 0.16f, 0.92f));
    ImGui::PushStyleColor(ImGuiCol_ButtonHovered, ImVec4(0.16f, 0.23f, 0.23f, 1.0f));
    ImGui::PushStyleColor(ImGuiCol_ButtonActive, ImVec4(0.22f, 0.34f, 0.28f, 1.0f));

    bool changed = false;

    auto closeOverlay = [&]()
    {
        dlss5ManagerOverlayVisible = false;
        io.MouseDrawCursor = false;
        io.WantCaptureKeyboard = false;
        io.WantCaptureMouse = false;
        io.WantSetMousePos = false;
        OptiInput::SetMenuVisible(false);
    };

    if (ImGui::Begin("DLSS 5 Neural Rendering##DoubleSixunManagerOverlay", nullptr, flags))
    {
        const float logo = 34.0f * scale;
        const ImVec2 logoAt = ImGui::GetCursorScreenPos();
        ImDrawList* draw = ImGui::GetWindowDrawList();
        draw->AddRectFilled(logoAt, ImVec2(logoAt.x + logo, logoAt.y + logo),
                            ImGui::GetColorU32(ImVec4(0.48f, 0.93f, 0.36f, 1.0f)), 10.0f * scale);
        const ImVec2 five = ImGui::CalcTextSize("5");
        draw->AddText(ImVec2(logoAt.x + (logo - five.x) * 0.5f,
                             logoAt.y + (logo - five.y) * 0.5f),
                      ImGui::GetColorU32(ImVec4(0.02f, 0.05f, 0.02f, 1.0f)), "5");
        ImGui::Dummy(ImVec2(logo, logo));
        ImGui::SameLine(0.0f, 12.0f * scale);
        ImGui::BeginGroup();
        ImGui::TextUnformatted("DLSS 5");
        ImGui::TextDisabled("Neural Rendering");
        ImGui::EndGroup();

        const float closeWidth = 32.0f * scale;
        ImGui::SameLine();
        ImGui::SetCursorPosX(ImGui::GetWindowContentRegionMax().x - closeWidth);
        if (ImGui::Button("X##ManagerClose", ImVec2(closeWidth, closeWidth)))
            closeOverlay();

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
        if (ImGui::Checkbox("Pre-SR", &beforeSr))
        {
            config->DlssNrRunBeforeSr = beforeSr;
            changed = true;
        }
        if (ImGui::IsItemHovered())
            ImGui::SetTooltip("Run Neural Rendering before DLSS Super Resolution.");

        ImGui::Spacing();
        ImGui::TextDisabled("Passes");
        int passes = (int) std::clamp(config->DlssNrPasses.value_or_default(), 1u, 3u);
        const float segmentGap = 8.0f * scale;
        const float segmentWidth = (ImGui::GetContentRegionAvail().x - segmentGap * 2.0f) / 3.0f;
        for (int pass = 1; pass <= 3; ++pass)
        {
            if (pass > 1)
                ImGui::SameLine(0.0f, segmentGap);

            const bool selected = passes == pass;
            if (selected)
            {
                ImGui::PushStyleColor(ImGuiCol_Button, ImVec4(0.48f, 0.91f, 0.34f, 0.95f));
                ImGui::PushStyleColor(ImGuiCol_ButtonHovered, ImVec4(0.55f, 0.98f, 0.41f, 1.0f));
                ImGui::PushStyleColor(ImGuiCol_Text, ImVec4(0.02f, 0.06f, 0.02f, 1.0f));
            }

            const std::string id = std::to_string(pass) + "##ManagerPassCount";
            if (ImGui::Button(id.c_str(), ImVec2(segmentWidth, 0.0f)) && !selected)
            {
                passes = pass;
                config->DlssNrPasses = (uint32_t) pass;
                changed = true;
            }

            if (selected)
                ImGui::PopStyleColor(3);
        }

        const char* styles[] = { "Standard", "Natural", "Cinematic" };
        const char* inheritedStyles[] = { "Inherit Pass 1", "Standard", "Natural", "Cinematic" };

        auto styleCombo = [&](const char* label, auto* option, bool inherit)
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
            changed = true;

        static int pendingScale = -1;
        int scalePercent = pendingScale >= 0
                               ? pendingScale
                               : (int) (config->DlssNrWorkingScale.value_or_default() * 100.0f + 0.5f);
        if (ImGui::SliderInt("Model resolution", &scalePercent, 25, 200, "%d%%"))
            pendingScale = scalePercent;
        if (ImGui::IsItemDeactivatedAfterEdit() && pendingScale >= 0)
        {
            config->DlssNrWorkingScale = std::clamp(pendingScale, 25, 200) / 100.0f;
            pendingScale = -1;
            changed = true;
        }
        if (ImGui::IsItemHovered())
            ImGui::SetTooltip("Lower values improve performance. Higher values increase Neural Rendering detail.");

        float detail = config->DlssNrTransferStrength.value_or_default();
        if (ImGui::SliderFloat("Detail strength", &detail, 0.0f, 2.0f, "%.2f"))
        {
            config->DlssNrTransferStrength = std::clamp(detail, 0.0f, 2.0f);
            changed = true;
        }

        float colour = config->DlssNrColourStrength.value_or_default();
        if (ImGui::SliderFloat("Colour strength", &colour, 0.0f, 4.0f, "%.2f"))
        {
            config->DlssNrColourStrength = std::clamp(colour, 0.0f, 4.0f);
            changed = true;
        }

        ImGui::Spacing();
        if (ImGui::CollapsingHeader("Advanced"))
        {
            ImGui::Indent(8.0f * scale);

            const auto feature = ctx.currentFeature;
            const bool nativeDx12 = feature && feature->Api() == API::DX12 && !feature->IsWithDx12();
            bool finishedPicture = config->DlssNrFinishedPicture.value_or_default();
            ImGui::BeginDisabled(!nativeDx12);
            if (ImGui::Checkbox("Apply to finished picture", &finishedPicture))
            {
                config->DlssNrFinishedPicture = finishedPicture;
                DlssNr::RetryAfterFailure();
                changed = true;
            }
            ImGui::EndDisabled();
            if (!nativeDx12)
                ImGui::TextDisabled("Finished-picture mode requires native DirectX 12.");

            bool applyModel = config->DlssNrApplyModel.value_or_default();
            if (ImGui::Checkbox("Apply effect (A/B preview)", &applyModel))
            {
                config->DlssNrApplyModel = applyModel;
                changed = true;
            }
            if (ImGui::IsItemHovered())
                ImGui::SetTooltip("Turn off to compare before/after. Neural Rendering still runs and keeps its GPU cost.");

            static std::unordered_map<ImGuiID, float> pending;
            auto deferredSlider = [&](const char* label, auto* option, float mn, float mx, float fallback, bool inherit)
            {
                const ImGuiID id = ImGui::GetID(label);
                auto it = pending.find(id);
                float value = it != pending.end() ? it->second : (option->has_value() ? option->value() : fallback);

                if (ImGui::SliderFloat(label, &value, mn, mx, "%.2f"))
                    pending[id] = value;

                bool edited = false;
                if (ImGui::IsItemDeactivatedAfterEdit())
                {
                    auto commit = pending.find(id);
                    if (commit != pending.end())
                    {
                        *option = std::clamp(commit->second, mn, mx);
                        pending.erase(commit);
                        edited = true;
                    }
                }

                ImGui::SameLine();
                const std::string reset = std::string("Reset##") + label;
                if (ImGui::SmallButton(reset.c_str()))
                {
                    if (inherit)
                        option->reset();
                    else
                        *option = fallback;
                    pending.erase(id);
                    edited = true;
                }
                return edited;
            };

            auto passAdvanced = [&](int pass, auto* intensity, auto* structure, auto* tone, auto* skin, auto* autoMask,
                                    bool inherit)
            {
                const std::string title = "Pass " + std::to_string(pass);
                ImGui::PushID(pass);
                if (ImGui::TreeNodeEx(title.c_str(), pass == 1 ? ImGuiTreeNodeFlags_DefaultOpen : 0))
                {
                    if (deferredSlider("Intensity", intensity, 0.0f, 2.0f,
                                       config->DlssNrIntensity.value_or_default(), inherit))
                        changed = true;
                    if (deferredSlider("Local structure", structure, 0.0f, 2.0f,
                                       config->DlssNrLocalStructure.value_or_default(), inherit))
                        changed = true;
                    const float toneDefault = inherit ? 0.0f : config->DlssNrLocalTone.value_or_default();
                    if (deferredSlider("Local tone", tone, 0.0f, 2.0f, toneDefault, inherit))
                        changed = true;
                    if (deferredSlider("Skin structure", skin, -1.0f, 2.0f,
                                       config->DlssNrSkinStructure.value_or_default(), inherit))
                        changed = true;

                    bool mask = autoMask->has_value() ? autoMask->value() : config->DlssNrAutoMask.value_or_default();
                    if (ImGui::Checkbox("Auto skin mask", &mask))
                    {
                        *autoMask = mask;
                        changed = true;
                    }
                    if (inherit)
                    {
                        ImGui::SameLine();
                        if (ImGui::SmallButton("Reset##AutoMask"))
                        {
                            autoMask->reset();
                            changed = true;
                        }
                    }
                    ImGui::TreePop();
                }
                ImGui::PopID();
            };

            passAdvanced(1, &config->DlssNrIntensity, &config->DlssNrLocalStructure,
                         &config->DlssNrLocalTone, &config->DlssNrSkinStructure,
                         &config->DlssNrAutoMask, false);
            if (passes >= 2)
                passAdvanced(2, &config->DlssNrPass2Intensity, &config->DlssNrPass2LocalStructure,
                             &config->DlssNrPass2LocalTone, &config->DlssNrPass2SkinStructure,
                             &config->DlssNrPass2AutoMask, true);
            if (passes >= 3)
                passAdvanced(3, &config->DlssNrPass3Intensity, &config->DlssNrPass3LocalStructure,
                             &config->DlssNrPass3LocalTone, &config->DlssNrPass3SkinStructure,
                             &config->DlssNrPass3AutoMask, true);

            ImGui::Unindent(8.0f * scale);
        }

        if (ImGui::CollapsingHeader("Experimental"))
        {
            ImGui::Indent(8.0f * scale);
            ImGui::TextColored(ImVec4(0.96f, 0.72f, 0.24f, 1.0f),
                               "Experimental - may cause artifacts, latency, or require restart.");

            bool residualAcrossRr = config->DlssNrResidualAcrossRr.value_or_default();
            ImGui::BeginDisabled(!beforeSr || config->DlssNrFinishedPicture.value_or_default());
            if (ImGui::Checkbox("Carry Pre-SR edit across Ray Reconstruction", &residualAcrossRr))
            {
                config->DlssNrResidualAcrossRr = residualAcrossRr;
                changed = true;
            }

            float rrBlend = config->DlssNrResidualAcrossRrBlend.value_or_default();
            ImGui::BeginDisabled(!residualAcrossRr);
            if (ImGui::SliderFloat("RR detail accumulation", &rrBlend, 0.01f, 1.0f, "%.2f"))
            {
                config->DlssNrResidualAcrossRrBlend = std::clamp(rrBlend, 0.01f, 1.0f);
                changed = true;
            }
            ImGui::EndDisabled();
            ImGui::EndDisabled();

            const auto feature = ctx.currentFeature;
            const bool rayReconstruction = feature && feature->GetUpscalerType() == Upscaler::DLSSD;
            bool deferred = config->DlssNrDeferredDlss.value_or_default();
            ImGui::BeginDisabled(config->DlssNrFinishedPicture.value_or_default() || rayReconstruction);
            if (ImGui::Checkbox("Generate before SR, apply after SR", &deferred))
            {
                config->DlssNrDeferredDlss = deferred;
                changed = true;
            }

            bool everySecond = config->DlssNrResidualFg.value_or_default();
            ImGui::BeginDisabled(!deferred);
            if (ImGui::Checkbox("NR every second frame with NVIDIA FG", &everySecond))
            {
                config->DlssNrResidualFg = everySecond;
                changed = true;
            }

            bool approximateCamera = config->DlssNrResidualFgApproxCamera.value_or_default();
            ImGui::BeginDisabled(!everySecond);
            if (ImGui::Checkbox("Allow approximate FG camera guides", &approximateCamera))
            {
                config->DlssNrResidualFgApproxCamera = approximateCamera;
                changed = true;
            }
            ImGui::EndDisabled();
            ImGui::EndDisabled();
            ImGui::EndDisabled();

            int precision = config->DlssNrPrecision.value_or_default() == 4 ? 1 : 0;
            const char* precisionNames[] = { "NVIDIA FP8", "FP8 + NVFP4 hybrid (RTX 50)" };
            if (ImGui::Combo("Model precision", &precision, precisionNames, IM_ARRAYSIZE(precisionNames)))
            {
                config->DlssNrPrecision = precision == 1 ? 4u : 0u;
                changed = true;
            }

            int hdrMode = (int) std::clamp(config->DlssNrReversibleMode.value_or_default(), 0u, 4u);
            const char* hdrModes[] = { "Off (soft knee)", "Neutwo + composed", "Neutwo + replace",
                                       "Hybrid + composed", "Hybrid + replace" };
            if (ImGui::Combo("HDR mapping", &hdrMode, hdrModes, IM_ARRAYSIZE(hdrModes)))
            {
                config->DlssNrReversibleMode = (uint32_t) hdrMode;
                changed = true;
            }

            ImGui::Unindent(8.0f * scale);
        }

        ImGui::EndDisabled();

        ImGui::Spacing();
        ImGui::Separator();
        ImGui::Spacing();

        const bool running = DlssNr::IsRunning() || DlssNr::IsRunningVk();
        if (!enabled)
            ImGui::TextDisabled("Off");
        else if (running)
            ImGui::TextColored(ImVec4(0.52f, 0.94f, 0.42f, 1.0f), "%s - %d pass%s",
                               beforeSr ? "Pre-SR active" : "After-SR active", passes, passes == 1 ? "" : "es");
        else
            ImGui::TextColored(ImVec4(0.90f, 0.72f, 0.34f, 1.0f), "Waiting for DLSS / rendered scene");

        ImGui::SameLine();
        const std::string shortcut =
            Keybind::KeyNameFromVirtualKeyCode(config->ShortcutKey.value_or_default());
        const std::string closeHint = shortcut + " / Esc to close";
        const float hintWidth = ImGui::CalcTextSize(closeHint.c_str()).x;
        const float rightEdge = ImGui::GetWindowContentRegionMax().x;
        const float hintX = std::max(ImGui::GetCursorPosX(), rightEdge - hintWidth);
        ImGui::SetCursorPosX(hintX);
        ImGui::TextDisabled("%s", closeHint.c_str());

        if (changed)
            config->SaveIni();

        if (ImGui::IsKeyPressed(ImGuiKey_Escape, false))
            closeOverlay();
    }
    ImGui::End();

    ImGui::PopStyleColor(13);
    ImGui::PopStyleVar(6);
}
"""

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

    if "DoubleSixunManagerOverlay" in text:
        print("independent DLSS 5 Manager overlay patch already present")
        return 0

    text = replace_once(text, "#include <type_traits>\n", "#include <type_traits>\n#include <unordered_map>\n",
                        "unordered_map include")
    text = replace_once(text, VISIBILITY_ANCHOR, VISIBILITY_ANCHOR + "\n" + MANAGER_STATE.strip("\n"),
                        "manager visibility anchor")
    text = replace_function(text, INPUT_MODE_SIGNATURE, INPUT_MODE_REPLACEMENT)
    text = replace_function(text, SHORTCUTS_SIGNATURE, SHORTCUTS_REPLACEMENT)
    text = replace_function(text, HIDE_SIGNATURE, HIDE_REPLACEMENT)

    begin_anchor = "    auto& newFrame = ctx.newFrame;\n"
    text = replace_once(text, begin_anchor,
                        begin_anchor + "    const bool interactiveVisible = _isVisible || dlss5ManagerOverlayVisible;\n",
                        "begin-frame visibility")
    text = replace_once(
        text,
        "        config->ShowFps.value_or_default() || _isVisible || ImGui::notifications.size() > 0 || scanIndicator ||",
        "        config->ShowFps.value_or_default() || interactiveVisible || ImGui::notifications.size() > 0 || scanIndicator ||",
        "begin-frame condition")
    text = replace_once(text, "        OptiInput::FeedImGui(_isVisible);",
                        "        OptiInput::FeedImGui(interactiveVisible);", "ImGui input feed")

    text = replace_once(text, RENDER_MENU_SIGNATURE, OVERLAY_FUNCTION + "\n" + RENDER_MENU_SIGNATURE,
                        "manager overlay insertion")
    text = replace_once(text, "    OptiInput::EndFrame(_isVisible);",
                        "    OptiInput::EndFrame(_isVisible || dlss5ManagerOverlayVisible);",
                        "input end-frame visibility")
    text = replace_once(text, "    RenderMainMenuWindow(ctx);",
                        "    RenderDlss5ManagerOverlay(ctx);\n    RenderMainMenuWindow(ctx);",
                        "manager overlay render call")

    target.write_text(text, encoding="utf-8")
    print(f"patched independent DLSS 5 Manager overlay: {target}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
