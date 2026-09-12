'use strict';

const fs = require('fs');
const path = require('path');
const extractZip = require('extract-zip');
const pe = require('./pe');
const ini = require('./feeder-config');
const { cached, fetchVerified } = require('./runtime-components');
const { safePath } = require('./file-journal');

// More than one pinned build, because upgrading one broke a game and there was
// no way back. Pre-SR is kept as a separate verified backend rather than a
// user-replaceable component so the installer can preserve its hash guarantees.
const RELEASES = Object.freeze([
  Object.freeze({
    version: '0.2.0-patch1',
    mode: 'standard',
    label: 'Standard · Post-SR',
    url: 'https://github.com/Dagherbou/OptiScaler_DLSSNR/releases/download/v0.2.0-patch1/OptiScaler-DLSSNR-v0.2.0-onimusha-fix.zip',
    sha256: '5db547216fa8a7dbd8ab0a193da1e3bce0ea4bd71f91189afa4ed2ede8bb9561',
    licenseUrl: 'https://raw.githubusercontent.com/Dagherbou/OptiScaler_DLSSNR/393e070/LICENSE',
    licenseHash: '3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986'
  }),
  Object.freeze({
    version: '0.7.7-presr',
    upstreamVersion: '0.7.7',
    mode: 'presr',
    label: 'Performance · Pre-SR (NR → SR)',
    url: 'https://github.com/wilsjo2/OptiScaler-DLSSNR-PreSR-Multipass/releases/download/v0.7.7/OptiScaler-DLSSNR-v0.7.7.zip',
    sha256: '4a315a3b3ee495631bd7cb1f562f609af577443602e507bfc7a7e6749c296258',
    // Both upstreams are GPL-3.0. Keep using the already pinned canonical text
    // while the release source itself is attributed in THIRD_PARTY_NOTICES.
    licenseUrl: 'https://raw.githubusercontent.com/Dagherbou/OptiScaler_DLSSNR/393e070/LICENSE',
    licenseHash: '3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986'
  }),
  // What 2.2.1 shipped. Same archive layout, so it satisfies the same
  // validation; kept for titles the newer standard build regressed on.
  Object.freeze({
    version: '0.1.1.5-dlssnr',
    mode: 'legacy',
    label: 'Legacy compatibility · 0.1.1.5',
    url: 'https://github.com/Dagherbou/OptiScaler_DLSSNR/releases/download/v0.1.1.5-dlssnr/OptiScaler-DLSSNR-v0.1.1.5-dlssnr.zip',
    sha256: '735b10b4077bc187ba4d07d607e864349aca386344c6126aba61ced746d27ece',
    licenseUrl: 'https://raw.githubusercontent.com/Dagherbou/OptiScaler_DLSSNR/393e070/LICENSE',
    licenseHash: '3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986'
  })
]);
const RELEASE = RELEASES[0];

// An unknown name resolves to the current standard build rather than failing:
// a state file naming a version this app no longer carries must not stop an install.
const releaseFor = (version) => RELEASES.find((r) => r.version === version) || RELEASE;
const releaseFromRoot = (root) => {
  const base = path.basename(path.resolve(String(root || '')));
  const version = base.startsWith('OptiScaler-') ? base.slice('OptiScaler-'.length) : '';
  return releaseFor(version);
};

const LIBRARIES = [
  'libxess.dll', 'libxess_dx11.dll', 'libxess_fg.dll', 'libxell.dll',
  'amd_fidelityfx_vk.dll', 'amd_fidelityfx_upscaler_dx12.dll',
  'amd_fidelityfx_loader_dx12.dll', 'amd_fidelityfx_framegeneration_dx12.dll',
  'D3D12_OptiScaler/D3D12Core.dll'
];
const LICENSES = ['DirectX_LICENSE.txt', 'FidelityFX_v2_LICENSE.md', 'RenoDX_ATTRIBUTION.txt', 'XeSS_LICENSE.txt'];

function fail(code, message = code) { return Object.assign(new Error(message), { code }); }

function validatePayload(root) {
  for (const rel of ['OptiScaler.dll', 'nvngx.dll_dlssnr.dll', ...LIBRARIES.map(f => 'OptiScaler/' + f)]) {
    if (pe.getBitness(safePath(root, rel)) !== 64) throw fail('errOptiPayload');
  }
  for (const rel of ['OptiScaler.ini', 'READ ME - DLSS Neural Rendering.txt', ...LICENSES.map(f => 'Licenses/' + f)]) {
    if (!fs.existsSync(safePath(root, rel))) throw fail('errOptiPayload');
  }
}

async function ensureOptiScaler(cacheRoot, version) {
  const release = releaseFor(version);
  const base = path.join(path.resolve(cacheRoot), 'components', `OptiScaler-${release.version}`);
  const archive = base + '.zip';
  if (!cached(archive, release.sha256)) await fetchVerified(release.url, release.sha256, archive);
  // Re-extract verified bytes on every install. The installer below copies an
  // explicit file list, not unknown files that may have appeared in the cache.
  await extractZip(archive, { dir: base });
  const license = path.join(base, 'OptiScaler-GPL-3.0.txt');
  if (!cached(license, release.licenseHash)) await fetchVerified(release.licenseUrl, release.licenseHash, license);
  validatePayload(base);
  return base;
}

function hookFor(api) { return api === 'vulkan' ? 'winmm.dll' : 'dxgi.dll'; }

function configure(text, target, release = RELEASE) {
  let out = text;
  for (const [section, key, value] of [
    ['DlssNr', 'Enabled', 'true'], ['Log', 'LogToFile', 'true'], ['Log', 'LogLevel', '2'],
    ['Spoofing', 'Dxgi', 'false'], ['Plugins', 'LoadAsiPlugins', 'false'],
    ['ProcessFilter', 'TargetProcessName', path.basename(target.exePath)]
  ]) out = ini.setIni(out, section, key, value);

  // Pre-SR mode is the performance path: run Neural Rendering on the game's
  // internal render resolution, then let the game's DLSS Super Resolution
  // produce the final output. Leave FinishedPicture off so this remains the
  // direct NR -> SR path instead of the newer experimental late-application path.
  if (release.mode === 'presr') {
    out = ini.setIni(out, 'DlssNr', 'RunBeforeSR', 'true');
    out = ini.setIni(out, 'DlssNr', 'FinishedPicture', 'false');
    out = ini.setIni(out, 'DlssNr', 'Passes', '1');
    out = ini.setIni(out, 'DlssNr', 'WorkingScale', '1.0');
  } else {
    out = ini.setIni(out, 'DlssNr', 'RunBeforeSR', 'false');
  }

  // DX11/Vulkan NR needs the documented D3D12 bridge, not native DLSS output.
  // Set defaults for all APIs: games can change renderer via launch arguments
  // without changing their executable's import table or scanner result.
  for (const field of ['Dx12Upscaler', 'Dx11Upscaler', 'VulkanUpscaler']) {
    const current = ini.getIni(out, 'Upscalers', field);
    const bridge = field !== 'Dx12Upscaler';
    if (!current || current === 'auto' || (bridge && !current.endsWith('_12'))) {
      out = ini.setIni(out, 'Upscalers', field, bridge ? 'ffx_12' : 'dlss');
    }
  }
  return out;
}

function copyPlan(root, api) {
  return [
    ['OptiScaler.dll', hookFor(api)], ['nvngx.dll_dlssnr.dll', 'nvngx.dll_dlssnr.dll'],
    ...LIBRARIES.map(f => ['OptiScaler/' + f, 'OptiScaler/' + f]),
    ...LICENSES.map(f => ['Licenses/' + f, 'OptiScaler/licenses/' + f]),
    ['OptiScaler-GPL-3.0.txt', 'OptiScaler/licenses/LICENSE.GPL-3.0.txt'],
    ['READ ME - DLSS Neural Rendering.txt', 'OptiScaler/README-DLSSNR.txt']
  ].map(([from, to]) => ({ from: safePath(root, from), to }));
}

function checkConflicts(gameDir, exePath, manifest, api) {
  // Inspect the baseline too: switching restores it before installing. Never
  // silently clobber another proxy, OptiScaler install or ASI loader.
  const { originalPath } = require('./apply');
  const exeDir = path.dirname(exePath);
  const added = new Set((manifest?.added || []).map(f => f.toLowerCase()));
  const replacements = new Map((manifest?.replaced || []).map(f => [f.rel.toLowerCase(), f]));
  const names = new Set([...fs.readdirSync(exeDir), 'dxgi.dll', 'winmm.dll', 'OptiScaler.ini']);
  const hook = hookFor(api);
  for (const name of names) {
    if (!/^(?:dxgi|winmm|version|dbghelp|dbgcore|d3d12|d3d11|d3d9|opengl32|wininet|winhttp|nvngx|nvapi64|OptiScaler)\.(?:dll|ini|asi)$/i.test(name) && !/\.asi$/i.test(name)) continue;
    const rel = path.relative(gameDir, path.join(exeDir, name));
    if (added.has(rel.toLowerCase())) continue;
    const file = replacements.has(rel.toLowerCase()) ? originalPath(gameDir, manifest, rel) : safePath(gameDir, rel);
    if (!fs.existsSync(file)) continue;
    // A pre-existing ReShade under the selected proxy name can be replaced
    // with a tracked backup. Other proxies require explicit user cleanup.
    if (name.toLowerCase() === hook && pe.versionMentions(file, 'ReShade')) continue;
    // dbghelp/dbgcore are on the list because Ultimate ASI Loader ships under
    // those names - but they are also genuine Windows components that games
    // ship for their own crash reporting. Microsoft own the real ones; loaders
    // do not claim to.
    if (/^dbg(?:help|core)\.dll$/i.test(name) && pe.versionMentions(file, 'Microsoft')) continue;
    throw fail('errOptiConflict', `Conflicting pre-existing file: ${path.join(exeDir, name)}. Restore/remove the other mod with its own installer first.`);
  }
  const pluginDir = path.join(exeDir, 'OptiScaler', 'plugins');
  if (fs.existsSync(pluginDir) && fs.readdirSync(pluginDir).some(f => /\.(dll|asi)$/i.test(f))) throw fail('errOptiConflict', 'Existing OptiScaler plugins need to be removed with their original installer first.');
  for (const name of LIBRARIES) {
    const rel = path.relative(gameDir, path.join(exeDir, 'OptiScaler', name));
    if (!added.has(rel.toLowerCase()) && fs.existsSync(safePath(gameDir, rel))) throw fail('errOptiConflict', `Pre-existing OptiScaler component: ${rel}`);
  }
}

async function install(config, log) {
  const { beginManifest, copyTracked, writeTracked, saveActiveManifest } = require('./apply');
  const { gameDir, exePath, api, optiRoot, source } = config;
  validatePayload(optiRoot);
  const release = releaseFromRoot(optiRoot);
  const nr = source.payload.find(f => f.name.toLowerCase() === 'nvngx_dlssnr.dll');
  if (!nr || pe.getBitness(nr.path) !== 64) throw fail('errNoNeuralRuntime');
  const manifest = beginManifest(gameDir, exePath, api);
  manifest.route = 'optiscaler';
  manifest.game.bitness = 64;
  manifest.game.apiLabel = config.apiLabel;
  manifest.optiscaler = { version: release.version, mode: release.mode, hook: hookFor(api) };
  const exeDir = path.dirname(exePath);
  for (const item of copyPlan(optiRoot, api)) {
    const rel = await copyTracked(manifest, gameDir, item.from, path.join(exeDir, item.to), { kind: 'optiscaler' });
    log({ code: 'added', params: { rel } });
  }

  // The model supplied by the source payload is NVIDIA's stock runtime for
  // Blackwell. Existing runtimes are left alone to avoid breaking users who
  // deliberately supplied a cross-generation compatibility build.
  const model = path.join(exeDir, nr.name);
  if (fs.existsSync(model)) {
    log({ code: 'neuralModelKept', params: { rel: path.relative(gameDir, model) } });
  } else {
    await copyTracked(manifest, gameDir, nr.path, model, { kind: 'runtime' });
  }

  const file = path.join(exeDir, 'OptiScaler.ini');
  const prior = config.profile?.[path.relative(gameDir, file)] ?? ini.readText(file);
  await writeTracked(
    manifest,
    gameDir,
    file,
    configure(prior || ini.readText(path.join(optiRoot, 'OptiScaler.ini')), config, release),
    { kind: 'config' }
  );
  await saveActiveManifest(gameDir, manifest);
  return manifest;
}

module.exports = {
  RELEASE,
  RELEASES,
  releaseFor,
  releaseFromRoot,
  LIBRARIES,
  ensureOptiScaler,
  validatePayload,
  configure,
  copyPlan,
  hookFor,
  checkConflicts,
  install
};
