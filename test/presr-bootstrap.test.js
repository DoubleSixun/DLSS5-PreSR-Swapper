'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const presr = require('../src/core/presr-bootstrap');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dlss5-presr-'));
}

test('thin payload marker turns an empty payload into a safe OptiScaler source', () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, presr.THIN_MARKER), 'thin', 'utf8');
  const result = presr.scanThinPayload(dir, () => ({ ok: false, reason: 'sourceEmpty' }));
  assert.equal(result.ok, true);
  assert.equal(result.thinPresr, true);
  assert.deepEqual(result.payload, []);
  assert.equal(result.feeder.ok64, false);
  assert.equal(path.basename(result.addon), presr.THIN_MARKER);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a normal payload always wins over the thin marker', () => {
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, presr.THIN_MARKER), 'thin', 'utf8');
  const normal = { ok: true, payload: [{ name: 'nvngx_dlssnr.dll' }] };
  assert.equal(presr.scanThinPayload(dir, () => normal), normal);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('Pre-SR fork exposes only OptiScaler when the detailed target supports it', () => {
  const routes = {
    nativeDlssPresent: () => true,
    routesFor: (target) => target.hasNativeDlss ? ['native', 'feeder', 'optiscaler'] : ['native', 'feeder'],
    recommendedRoute: () => 'native'
  };
  presr.restrictRoutesToPreSr(routes);
  const detailed = { bitness: 64, api: 'dxgi', apiLabel: 'DirectX 12', hasNativeDlss: true };
  assert.deepEqual(routes.routesFor(detailed), ['optiscaler']);
  // The fast card scan has not attached hasNativeDlss yet, so it retains the
  // upstream coarse answer instead of being incorrectly marked unsupported.
  assert.deepEqual(routes.routesFor({ bitness: 64, api: 'dxgi', apiLabel: 'DirectX 12' }), ['native', 'feeder']);
  assert.equal(routes.recommendedRoute({ chosen: detailed }), 'optiscaler');
});

test('runtime cache path stays inside Electron userData', () => {
  const fakeApp = { getPath: (name) => name === 'userData' ? 'C:\\Users\\Test\\AppData\\Roaming\\DLSS5-PreSR' : '' };
  assert.match(presr.runtimeCacheFile(fakeApp).replace(/\\/g, '/'), /DLSS5-PreSR\/runtime\/nvngx_dlssnr\.dll$/);
});
