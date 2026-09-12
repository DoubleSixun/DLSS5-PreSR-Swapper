# Standalone migration

This branch starts the move from a GitHub fork-shaped product to an independently structured DLSS Neural Rendering manager.

## Goal

The new app should not depend on the upstream `main.js`, renderer, Community, Chat, Feeder, RenoDX, emulator, or add-on product flows.

The first standalone entry point lives under `standalone/` and can be launched with:

```bash
npm run start:standalone
```

It currently provides its own Electron main process, preload bridge and renderer. It still reuses selected mature core modules while they are being separated and audited.

## Code retained from DLSS5-Swapper

The following categories currently reuse or derive from code by Rakan Alkhaldi under the MIT License:

- game executable / graphics API / DLSS discovery (`src/core/scan.js`, PE helpers and related detection code)
- compatibility and installation guards
- tracked file writes, backups, active manifests and Restore Originals (`src/core/apply.js`, `src/core/file-journal.js`)
- parts of OptiScaler installation plumbing that are being narrowed to the Neural Rendering route

The standalone product should credit these portions specifically rather than implying that its Pre-SR backend, new UI, profiles or future OptiScaler overlay came from DLSS5-Swapper.

## Code specific to this project

- standalone Electron architecture and product flow
- runtime-free `nvngx_dlssnr.dll` import, validation and local cache
- Pre-SR-first OptiScaler integration and pinned backend selection
- per-game Pre-SR / pass settings exposed by the standalone UI
- known-game profiles such as Where Winds Meet
- the new renderer design and English / Simplified Chinese language separation
- future profile management and OptiScaler-focused in-game overlay

## Neural Rendering backend

The actual Neural Rendering / Pre-SR / multipass implementation is provided by `wilsjo2/OptiScaler-DLSSNR-PreSR-Multipass`, which is based on OptiScaler and Dagherbou's Neural Rendering work. Its licence and notices remain separate from the MIT portions inherited from DLSS5-Swapper.

The NVIDIA `nvngx_dlssnr.dll` runtime is not redistributed by this project. The user imports a trusted copy and the app validates and caches it locally.

## Migration stages

1. Standalone Electron shell without `require('../main.js')`.
2. Game add/select/detection using only the retained discovery modules.
3. OptiScaler NR install and Restore Originals through retained tracked-file primitives.
4. Move retained Rakan-derived modules into a clearly attributed `vendor` or `core/derived` boundary, then trim unused Feeder/RenoDX/emulator dependencies from them.
5. Replace remaining upstream renderer/product code with the standalone UI.
6. Add multipass and per-pass style/profile controls supported by the wilsjo2 backend.
7. Build an OptiScaler-focused in-game overlay.
8. Create the final independent repository and carry over the required MIT copyright notice and third-party licence notices.

## Attribution target

A concise user-facing credit can eventually read:

> Portions of game discovery, compatibility detection and file backup/restore are derived from DLSS5-Swapper by Rakan Alkhaldi, used under the MIT License.

The repository must also retain the full MIT copyright and permission notice for copied or substantially derived code.
