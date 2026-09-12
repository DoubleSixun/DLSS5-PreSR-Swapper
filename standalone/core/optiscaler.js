'use strict';

const fs = require('fs');
const path = require('path');
const extractZip = require('extract-zip');
const pe = require('./derived/pe');
const ini = require('./ini');
const download = require('./download');
const fileState = require('./file-state');

const RELEASE = Object.freeze({
  version: '0.7.7',
  packageId: '0.7.7-presr',
  url: 'https://github.com/wilsjo2/OptiScaler-DLSSNR-PreSR-Multipass/releases/download/v0.7.7/OptiScaler-DLSSNR-v0.7.7.zip',
  sha256: '4a315a3b3ee495631bd7cb1f562f609af577443602e507bfc7a7e6749c296258',
  readme: 'INSTALL-DLSSNR.md',
  licenseUrl: 'https://raw.githubusercontent.com/Dagherbou/OptiScaler_DLSSNR/393e070/LICENSE',
  licenseSha256: '3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986'
});

const LIBRARIES = Object.freeze([
  'libxess.dll', 'libxess_dx11.dll', 'libxess_fg.dll', 'libxell.dll',
  'amd_fidelityfx_vk.dll', 'amd_fidelityfx_upscaler_dx12.dll',
  'amd_fidelityfx_loader_dx12.dll', 'amd_fidelityfx_framegeneration_dx12.dll',
  'D3D12_OptiScaler/D3D12Core.dll'
]);

const LICENSES = Object.freeze(['DirectX_LICENSE.txt', 'FidelityFX_v2_LICENSE.md', 'RenoDX_ATTRIBUTION.txt', 'XeSS_LICENSE.txt']);
const STYLE_VALUES = new Set(['auto', '0', '1', '2']);

function fail(code, message = code) {
  return Object.assign(new Error(message), { code });
}

function hookFor(api) {
  return api === 'vulkan' ? 'winmm.dll' : 'dxgi.dll';
}

function validatePackage(root) {
  const binaries = ['OptiScaler.dll', 'nvngx.dll_dlssnr.dll', ...LIBRARIES.map(file => `OptiScaler/${file}`)];
  for (const rel of binaries) {
    const file = fileState.safePath(root, rel);
    if (pe.getBitness(file) !== 64) throw fail('invalidOptiScalerPackage', `Invalid or missing OptiScaler binary: ${rel}`);
  }
  for (const rel of ['OptiScaler.ini', RELEASE.readme, ...LICENSES.map(file => `Licenses/${file}`)]) {
    if (!fs.existsSync(fileState.safePath(root, rel))) throw fail('invalidOptiScalerPackage', `Missing OptiScaler package file: ${rel}`);
  }
  return true;
}

async function ensurePackage(cacheRoot) {
  const base = path.join(path.resolve(cacheRoot), 'components', `OptiScaler-${RELEASE.packageId}`);
  const archive = base + '.zip';
  if (!download.cached(archive, RELEASE.sha256)) await download.fetchVerified(RELEASE.url, RELEASE.sha256, archive);
  await fs.promises.rm(base, { recursive: true, force: true });
  await extractZip(archive, { dir: base });

  const license = path.join(base, 'OptiScaler-GPL-3.0.txt');
  if (!download.cached(license, RELEASE.licenseSha256)) {
    await download.fetchVerified(RELEASE.licenseUrl, RELEASE.licenseSha256, license);
  }
  validatePackage(base);
  return base;
}

function styleValue(settings, key) {
  const value = String(settings?.[key] ?? 'auto').toLowerCase();
  if (!STYLE_VALUES.has(value)) throw fail('invalidStyle', `Invalid Neural Rendering style: ${value}`);
  return value;
}

function configure(text, target, settings = {}) {
  const passes = Number(settings.passes || 1);
  if (!Number.isInteger(passes) || passes < 1 || passes > 3) throw fail('invalidPasses', 'Passes must be 1, 2, or 3.');
  const runBeforeSR = settings.runBeforeSR !== false;
  let out = String(text || '');
  const values = [
    ['DlssNr', 'Enabled', 'true'],
    ['DlssNr', 'RunBeforeSR', runBeforeSR ? 'true' : 'false'],
    ['DlssNr', 'FinishedPicture', 'false'],
    ['DlssNr', 'Passes', String(passes)],
    ['DlssNr', 'WorkingScale', '1.0'],
    // wilsjo2's multipass backend uses 0=Standard, 1=Natural, 2=Cinematic.
    // Later-pass `auto` values inherit pass 1, as documented by the backend.
    ['DlssNr', 'Style', styleValue(settings, 'pass1Style')],
    ['DlssNr', 'Pass2Style', styleValue(settings, 'pass2Style')],
    ['DlssNr', 'Pass3Style', styleValue(settings, 'pass3Style')],
    ['Log', 'LogToFile', 'true'],
    ['Log', 'LogLevel', '2'],
    ['Spoofing', 'Dxgi', 'false'],
    ['Plugins', 'LoadAsiPlugins', 'false'],
    ['ProcessFilter', 'TargetProcessName', path.basename(target.exePath)]
  ];
  for (const [section, key, value] of values) out = ini.set(out, section, key, value);

  for (const [field, fallback] of [
    ['Dx12Upscaler', 'dlss'],
    ['Dx11Upscaler', 'ffx_12'],
    ['VulkanUpscaler', 'ffx_12']
  ]) {
    const current = ini.get(out, 'Upscalers', field);
    if (!current || current === 'auto') out = ini.set(out, 'Upscalers', field, fallback);
  }
  return out;
}

function copyPlan(root, api) {
  return [
    ['OptiScaler.dll', hookFor(api)],
    ['nvngx.dll_dlssnr.dll', 'nvngx.dll_dlssnr.dll'],
    ...LIBRARIES.map(file => [`OptiScaler/${file}`, `OptiScaler/${file}`]),
    ...LICENSES.map(file => [`Licenses/${file}`, `OptiScaler/licenses/${file}`]),
    ['OptiScaler-GPL-3.0.txt', 'OptiScaler/licenses/LICENSE.GPL-3.0.txt'],
    [RELEASE.readme, 'OptiScaler/README-DLSSNR.txt']
  ].map(([from, to]) => ({ from: fileState.safePath(root, from), to }));
}

function checkConflicts(gameDir, exePath, api) {
  const exeDir = path.dirname(exePath);
  const hook = hookFor(api);
  const watched = [hook, 'OptiScaler.ini', 'nvngx.dll_dlssnr.dll'];
  for (const name of watched) {
    const file = path.join(exeDir, name);
    if (!fs.existsSync(file)) continue;
    throw fail('installConflict', `Conflicting pre-existing file: ${file}. Remove or restore the existing graphics mod with its own installer first.`);
  }
  const optiDir = path.join(exeDir, 'OptiScaler');
  if (fs.existsSync(optiDir)) throw fail('installConflict', `Conflicting pre-existing OptiScaler folder: ${optiDir}`);
}

async function install({ gameDir, exePath, api, apiLabel, packageRoot, runtimePath, settings }, onLog) {
  const log = (code, params = {}) => onLog && onLog({ code, params });
  validatePackage(packageRoot);
  if (!runtimePath || !fs.existsSync(runtimePath)) throw fail('runtimeRequired', 'Neural Rendering runtime is missing.');
  checkConflicts(gameDir, exePath, api);

  const manifest = fileState.beginManifest(gameDir, exePath, api);
  manifest.optiscaler = { version: RELEASE.packageId, upstreamVersion: RELEASE.version, hook: hookFor(api) };
  manifest.game.bitness = 64;
  manifest.game.apiLabel = apiLabel || api;
  await fileState.saveManifest(gameDir, manifest);

  const exeDir = path.dirname(exePath);
  try {
    for (const item of copyPlan(packageRoot, api)) {
      const rel = await fileState.copyTracked(manifest, gameDir, item.from, path.join(exeDir, item.to), { kind: 'optiscaler' });
      log('added', { rel });
    }

    const runtimeTarget = path.join(exeDir, 'nvngx_dlssnr.dll');
    if (fs.existsSync(runtimeTarget)) {
      log('runtimeKept', { rel: path.relative(gameDir, runtimeTarget) });
    } else {
      const rel = await fileState.copyTracked(manifest, gameDir, runtimePath, runtimeTarget, { kind: 'runtime' });
      log('added', { rel });
    }

    const configFile = path.join(exeDir, 'OptiScaler.ini');
    const baseText = ini.read(configFile) || ini.read(path.join(packageRoot, 'OptiScaler.ini'));
    await fileState.writeTracked(manifest, gameDir, configFile, configure(baseText, { exePath }, settings), { kind: 'config' });
    await fileState.saveManifest(gameDir, manifest);
    log('installDone', { version: RELEASE.packageId });
    return manifest;
  } catch (error) {
    try { await fileState.saveManifest(gameDir, manifest); } catch {}
    throw error;
  }
}

function updateSettings(exePath, settings) {
  const file = path.join(path.dirname(exePath), 'OptiScaler.ini');
  if (!fs.existsSync(file)) return false;
  const text = configure(ini.read(file), { exePath }, settings);
  fs.writeFileSync(file, text, 'utf8');
  return true;
}

module.exports = {
  RELEASE,
  LIBRARIES,
  LICENSES,
  hookFor,
  validatePackage,
  ensurePackage,
  configure,
  copyPlan,
  checkConflicts,
  install,
  updateSettings
};