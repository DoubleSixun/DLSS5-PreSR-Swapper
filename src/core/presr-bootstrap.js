'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pe = require('./pe');

const THIN_MARKER = 'THIN-PRESR.txt';
const RUNTIME_NAME = 'nvngx_dlssnr.dll';

function fail(code, message = code) {
  return Object.assign(new Error(message), { code });
}

function scanThinPayload(sourceDir, fallback) {
  const normal = fallback(sourceDir);
  if (normal && normal.ok) return normal;

  const marker = path.join(sourceDir, THIN_MARKER);
  if (!fs.existsSync(marker)) return normal;

  return {
    ok: true,
    reason: null,
    dir: sourceDir,
    // main.js uses the basename of the base add-on even when a route does not
    // need one. The marker is deliberately not an .addon64, so it never shows
    // up in the add-on library and can never be copied into a game.
    addon: marker,
    payload: [],
    hasNeuralRendering: false,
    feeder: {
      version: null,
      ok: false,
      ok32: false,
      ok64: false,
      vulkanOk: false
    },
    dlssVersion: null,
    thinPresr: true
  };
}

function restrictRoutesToPreSr(routes) {
  if (!routes || routes.__preSrRestricted) return routes;
  const originalRoutesFor = routes.routesFor.bind(routes);
  const nativeDlssPresent = routes.nativeDlssPresent.bind(routes);

  routes.routesFor = (target, api = target && target.api) => {
    const all = originalRoutesFor(target, api);
    // The quick library scan does not attach hasNativeDlss yet, so leave its
    // coarse installable/not-installable answer alone. The game sheet and the
    // installer do attach it; there this fork exposes only the verified
    // OptiScaler Pre-SR route and cannot accidentally fall back to a payload
    // route that is intentionally absent from the thin Windows build.
    if (!target || !Object.prototype.hasOwnProperty.call(target, 'hasNativeDlss')) return all;
    return all.includes('optiscaler') ? ['optiscaler'] : [];
  };

  routes.recommendedRoute = (scan, target = scan && scan.chosen) => {
    if (!scan || !target) return null;
    const decorated = { ...target, hasNativeDlss: nativeDlssPresent(scan) };
    return routes.routesFor(decorated, decorated.api).includes('optiscaler') ? 'optiscaler' : null;
  };

  Object.defineProperty(routes, '__preSrRestricted', { value: true });
  return routes;
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function runtimeLooksValid(file) {
  try {
    if (!file || !fs.statSync(file).isFile()) return false;
    if (path.basename(file).toLowerCase() !== RUNTIME_NAME) return false;
    if (fs.statSync(file).size < 1024 * 1024) return false;
    if (pe.getBitness(file) !== 64) return false;
    if (pe.versionMentions(file, 'NVIDIA')) return true;
    const markers = pe.findMarkers(file, ['NVIDIA', 'nvngx_dlssnr']);
    return markers.has('NVIDIA') || markers.has('nvngx_dlssnr');
  } catch {
    return false;
  }
}

function runtimeCacheFile(app) {
  return path.join(app.getPath('userData'), 'runtime', RUNTIME_NAME);
}

function cacheRuntime(app, source) {
  if (!runtimeLooksValid(source)) {
    throw fail('errNoNeuralRuntime', 'That file is not a valid 64-bit NVIDIA nvngx_dlssnr.dll runtime.');
  }

  const dest = runtimeCacheFile(app);
  const dir = path.dirname(dest);
  fs.mkdirSync(dir, { recursive: true });
  const temp = dest + '.tmp';
  fs.copyFileSync(source, temp);
  if (!runtimeLooksValid(temp)) {
    fs.rmSync(temp, { force: true });
    throw fail('errNoNeuralRuntime', 'The selected NVIDIA runtime could not be validated after copying.');
  }

  fs.rmSync(dest, { force: true });
  fs.renameSync(temp, dest);
  const metadata = {
    file: RUNTIME_NAME,
    sha256: sha256(dest),
    version: pe.getFileVersion(dest),
    importedAt: new Date().toISOString()
  };
  fs.writeFileSync(path.join(dir, 'runtime.json'), JSON.stringify(metadata, null, 2), 'utf8');
  return dest;
}

function payloadRuntime(source) {
  const row = (source && Array.isArray(source.payload) ? source.payload : [])
    .find(item => item && String(item.name || '').toLowerCase() === RUNTIME_NAME);
  return row && runtimeLooksValid(row.path) ? row.path : null;
}

async function resolveRuntime({ app, dialog, source, exePath }) {
  const bundled = payloadRuntime(source);
  if (bundled) return bundled;

  const cached = runtimeCacheFile(app);
  if (runtimeLooksValid(cached)) return cached;

  const local = path.join(path.dirname(exePath), RUNTIME_NAME);
  const defaultPath = runtimeLooksValid(local) ? local : path.dirname(exePath);
  const chosen = await dialog.showOpenDialog({
    title: 'Select NVIDIA DLSS 5 Neural Rendering runtime',
    message: 'Choose a trusted copy of nvngx_dlssnr.dll. It will be cached locally and is not uploaded.',
    defaultPath,
    properties: ['openFile'],
    filters: [{ name: 'NVIDIA DLSS Neural Rendering runtime', extensions: ['dll'] }]
  });
  if (chosen.canceled || !chosen.filePaths || !chosen.filePaths[0]) {
    throw fail('errNoNeuralRuntime', 'A trusted nvngx_dlssnr.dll is required for Pre-SR installation.');
  }
  return cacheRuntime(app, chosen.filePaths[0]);
}

function attachRuntimeImport(optiscaler, { app, dialog }) {
  if (!optiscaler || optiscaler.__preSrRuntimeWrapped) return optiscaler;
  const originalInstall = optiscaler.install.bind(optiscaler);

  optiscaler.install = async (config, log) => {
    const runtime = await resolveRuntime({
      app,
      dialog,
      source: config.source,
      exePath: config.exePath
    });
    const current = config.source && Array.isArray(config.source.payload) ? config.source.payload : [];
    const source = {
      ...(config.source || {}),
      payload: [
        ...current.filter(item => String(item && item.name || '').toLowerCase() !== RUNTIME_NAME),
        { name: RUNTIME_NAME, path: runtime, version: pe.getFileVersion(runtime) }
      ],
      hasNeuralRendering: true
    };
    return originalInstall({ ...config, source }, log);
  };

  Object.defineProperty(optiscaler, '__preSrRuntimeWrapped', { value: true });
  return optiscaler;
}

module.exports = {
  THIN_MARKER,
  RUNTIME_NAME,
  scanThinPayload,
  restrictRoutesToPreSr,
  runtimeLooksValid,
  runtimeCacheFile,
  cacheRuntime,
  resolveRuntime,
  attachRuntimeImport
};
