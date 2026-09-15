# DLSS Neural Rendering Manager

A focused Windows desktop app for installing and managing DLSS Neural Rendering through the OptiScaler DLSS-NR Pre-SR Multipass backend.

This standalone app is intentionally separate from the original DLSS5-Swapper product shell. It keeps only the functionality needed for Neural Rendering: game selection, compatibility inspection, runtime import/detection, tracked installation and restore, Pre-SR placement, model pass count and per-pass style profiles.

## Current preview

- Add a game by choosing its installation folder, reviewing ranked EXE candidates and confirming the main program; direct `.exe` selection is also available.
- Open cached game details immediately while refreshing only the selected game's status.
- Right-click a game (or press Shift+F10) to Play, favorite/unfavorite, browse local files or hide/unhide it.
- Favorites appear first. Hidden games remain available in the Hidden filter and stay hidden across scans and restarts. Hiding never deletes game files, configuration or backups.
- Detect architecture, rendering API and native DLSS.
- Install the pinned OptiScaler DLSS-NR Pre-SR Multipass backend.
- Toggle `RunBeforeSR` without treating Pre-SR and after-SR as separate products.
- Configure 1 to 3 Neural Rendering passes.
- Choose Standard, Natural or Cinematic style per pass; later passes may inherit Pass 1.
- Detect `nvngx_dlssnr.dll` beside the game or reuse a previously imported local cache.
- Back up and restore files managed by this app.
- English and Simplified Chinese UI.
- The mgr7 overlay stays inside the current screen bounds at the selected scale; style labels have reserved space and all active advanced passes default open.

To apply mgr7 to an existing managed game, close the game, open it in the new manager build and choose **Update in-game backend**, then restart the game. Installing a newer manager alone does not replace a backend already copied into a game folder.

## Runtime policy

The NVIDIA Neural Rendering runtime `nvngx_dlssnr.dll` is not bundled. If a compatible runtime is not already beside the selected game and has not been imported previously, the app asks the user to select a trusted copy. The selected file is validated locally and cached locally.

## Neural Rendering placement

The app installs Neural Rendering once. The placement toggle maps directly to OptiScaler's `RunBeforeSR` setting:

- On: Neural Rendering runs before DLSS Super Resolution (Pre-SR).
- Off: Neural Rendering runs after DLSS Super Resolution.

The game's own DLSS Quality / Balanced / Performance setting remains controlled by the game.

## Safety

This is an experimental graphics-mod tool. Injection-based graphics mods can conflict with anti-cheat systems. The app does not bypass, disable or tamper with anti-cheat. A known online-game profile can display an explicit warning before installation.

## Development

From the repository root:

```powershell
npm ci
npm run start:standalone
npm test
npx electron scripts/test-standalone-library-ui.js
npm run build:standalone:portable
```

The standalone Windows preview is written to `dist-standalone/`.

## Licences and attribution

The standalone application code is MIT-licensed under `standalone/LICENSE`.

Small retained portions derived from DLSS5-Swapper, the independently licensed OptiScaler backend, and the NVIDIA runtime policy are documented in `standalone/THIRD_PARTY_NOTICES.md`.
