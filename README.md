# DLSS 5 Pre-SR Swapper

A Pre-SR-focused fork of [rakanki911/DLSS5-Swapper](https://github.com/rakanki911/DLSS5-Swapper).

The goal is simple: keep Swapper's game discovery, tracked backup/restore and one-click install workflow, while adding a verified **Pre-SR Neural Rendering** path powered by [wilsjo2/OptiScaler-DLSSNR-PreSR-Multipass](https://github.com/wilsjo2/OptiScaler-DLSSNR-PreSR-Multipass).

## What is different

The OptiScaler backend now exposes two clear rendering modes:

| Mode | Pipeline | Use case |
|---|---|---|
| **Performance · Pre-SR** *(default)* | `NR → DLSS Super Resolution → Output` | Runs Neural Rendering at the game's internal render resolution before DLSS SR. Usually the practical choice for 4K. |
| **Quality · Post-SR** | `DLSS Super Resolution → NR → Output` | Runs Neural Rendering after upscaling. Higher NR workload at high output resolutions. |

The Pre-SR backend is pinned to **OptiScaler-DLSSNR-PreSR-Multipass v0.7.7** and its release archive is SHA-256 verified before extraction:

`4a315a3b3ee495631bd7cb1f562f609af577443602e507bfc7a7e6749c296258`

When Pre-SR is selected, the installer writes these safe starting defaults:

```ini
[DlssNr]
Enabled=true
RunBeforeSR=true
FinishedPicture=false
Passes=1
WorkingScale=1.0
```

That is the direct **NR → SR** path. `FinishedPicture` is deliberately left off because it is a separate experimental late-application mode in the v0.7.7 backend.

## Current status

This fork is under active development on the `feature/presr-ui` branch. The first milestone covers:

- verified Pre-SR backend download
- Pre-SR as the one-click default
- Standard/Post-SR fallback per game
- existing Swapper backup and restore flow
- friendly `Performance / Pre-SR` and `Quality / Post-SR` labels
- automatic Pre-SR configuration
- unit tests for backend selection and INI generation

The next milestone is richer desktop controls for passes and model tuning plus a reproducible Windows build workflow.

## Neural Rendering runtime

The Pre-SR OptiScaler project does **not** redistribute NVIDIA's proprietary `nvngx_dlssnr.dll`. The open-source `nvngx.dll_dlssnr.dll` forwarder is a different file. See the upstream install guide for GPU/runtime requirements and hashes.

This fork does not claim NVIDIA endorsement or support.

## Multiplayer / anti-cheat warning

OptiScaler is an injection mod. **Do not use it to bypass anti-cheat or other game security controls.** The upstream Pre-SR project explicitly warns against using injection mods in anti-cheat-protected multiplayer games. This fork retains Swapper's anti-cheat warnings and does not implement bypass behavior.

## Development

```powershell
npm ci
npm test
npm start
```

The source build process inherited from DLSS5-Swapper expects a local payload containing the Neural Rendering runtime and other release components. That payload is intentionally not committed to this repository.

## Credits and licences

- Original application: [rakanki911/DLSS5-Swapper](https://github.com/rakanki911/DLSS5-Swapper) — MIT
- Pre-SR backend: [wilsjo2/OptiScaler-DLSSNR-PreSR-Multipass](https://github.com/wilsjo2/OptiScaler-DLSSNR-PreSR-Multipass) — GPL-3.0
- Standard OptiScaler DLSS-NR backend: [Dagherbou/OptiScaler_DLSSNR](https://github.com/Dagherbou/OptiScaler_DLSSNR) — GPL-3.0

See `LICENSE` and `THIRD_PARTY_NOTICES.md` for details.
