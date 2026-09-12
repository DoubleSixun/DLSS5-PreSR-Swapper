# Standalone migration

This branch is the staging area for turning the Pre-SR fork into an independently structured DLSS Neural Rendering manager.

## Current architecture

The standalone app lives under `standalone/` and launches with:

```bash
npm run start:standalone
```

It has its own Electron main process, preload bridge, renderer, game scanner, INI editor, runtime manager, OptiScaler installer and tracked backup/restore implementation. It does **not** load the upstream `main.js` and does not import the upstream `scan.js`, `apply.js`, `feeder-config.js`, `runtime-components.js`, `optiscaler.js` or `presr-bootstrap.js` product modules.

The standalone product has no Community, Chat, Feeder, RenoDX, emulator or add-on product flow.

## Retained code derived from DLSS5-Swapper

A small, explicit derived boundary remains:

- `standalone/core/derived/pe.js` — PE architecture/import/version inspection, derived from DLSS5-Swapper by Rakan Alkhaldi under the MIT License.
- The manifest shape and backup-directory convention in `standalone/core/file-state.js` intentionally remain compatible with the earlier DLSS5-Swapper-based builds so users can restore installations made during migration. The new implementation is narrower and OptiScaler-only.

The final repository must preserve Rakan Alkhaldi's MIT copyright and permission notice for copied or substantially derived portions.

## Code specific to this project

- standalone Electron application architecture and IPC surface
- exact-EXE game management and narrowed DLSS/API detection flow
- runtime-free `nvngx_dlssnr.dll` validation, import and local cache
- pinned `wilsjo2/OptiScaler-DLSSNR-PreSR-Multipass` download and checksum verification
- OptiScaler-only install, conflict checks and tracked restore flow
- one Neural Rendering installation with `RunBeforeSR` controlling Pre-SR vs after-SR placement
- 1–3 pass control and independent Style selection for each pass
- known-game profiles such as Where Winds Meet
- English / Simplified Chinese language separation
- new renderer design
- future profile management and OptiScaler-focused in-game overlay

## Neural Rendering backend

The actual Neural Rendering / Pre-SR / multipass implementation is provided by `wilsjo2/OptiScaler-DLSSNR-PreSR-Multipass`, which is based on OptiScaler and Dagherbou's Neural Rendering work. Its GPL-3.0 licence obligations and third-party notices remain separate from the MIT-derived application portions.

The backend documents up to three sequential model passes. `Style=0/1/2` selects Standard/Natural/Cinematic for pass 1; `Pass2Style` and `Pass3Style` select later-pass styles, and `auto` on later passes inherits pass 1. The standalone UI writes those documented keys directly rather than inventing its own style model.

The NVIDIA `nvngx_dlssnr.dll` runtime is not redistributed by this project. The user imports a trusted copy; the app validates it and caches it locally.

## Migration status

- [x] Standalone Electron shell without loading upstream `main.js`.
- [x] Standalone renderer and preload bridge.
- [x] Exact game EXE add/select flow.
- [x] Remove Community / Chat / Feeder / RenoDX / emulator product surfaces.
- [x] Replace upstream `feeder-config.js` with a local minimal INI editor.
- [x] Replace upstream `presr-bootstrap.js` with a standalone runtime manager.
- [x] Replace upstream `optiscaler.js` and `runtime-components.js` with a narrowed OptiScaler-only installer/downloader.
- [x] Replace upstream `apply.js` / `file-journal.js` dependency with a standalone tracked backup/restore implementation while retaining manifest compatibility.
- [x] Replace upstream `scan.js` dependency with exact-EXE DLSS/API inspection.
- [x] Add supported 1–3-pass per-pass Style controls (Default/Standard/Natural/Cinematic; later passes can inherit pass 1).
- [ ] Add tests against real packaged OptiScaler fixtures and migration manifests.
- [ ] Decide whether to expose additional documented per-pass Intensity / Local structure / Local tone / Skin structure controls under Advanced.
- [ ] Build the OptiScaler-focused in-game overlay.
- [ ] Give the standalone package its final product name, icons and release pipeline.
- [ ] Create the final independent repository and carry over required licence notices.

## Attribution target

A concise user-facing credit can read:

> Portions of PE/game compatibility inspection are derived from DLSS5-Swapper by Rakan Alkhaldi, used under the MIT License.

The repository should separately credit the wilsjo2 / OptiScaler Neural Rendering backend. Product UI, runtime management, standalone installation flow, profiles and the future OptiScaler overlay belong to this project rather than DLSS5-Swapper.