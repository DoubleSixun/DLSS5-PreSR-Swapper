'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const renderingApi = require('../src/shared/rendering-api');
const compatibility = require('../src/core/compatibility');
const { projectUrl } = require('../src/core/project-links');

function pe(machine, text = '') {
  const data = Buffer.alloc(1024, 0);
  data.writeUInt16LE(0x5a4d, 0);
  data.writeUInt32LE(0x80, 0x3c);
  data.writeUInt32LE(0x00004550, 0x80);
  data.writeUInt16LE(machine === 64 ? 0x8664 : 0x14c, 0x84);
  data.write(text, 0x100, 'ascii');
  return data;
}
function writePe(file, options = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, pe(options.bitness || 64, options.text || ''));
}

test('automatic uses detection, not the first advertised API or an installed backend', () => {
  const pick = { api: 'vulkan', apiLabel: 'Vulkan', apiChoices: [{ api: 'dxgi', label: 'DirectX 12' }, { api: 'vulkan', label: 'Vulkan' }] };
  assert.deepEqual(renderingApi.resolve(pick, 'auto'), { api: 'vulkan', label: 'Vulkan' });
  assert.deepEqual(renderingApi.effective(pick, 'auto'), { api: 'vulkan', label: 'Vulkan' });
});

test('manual DX11/DX12 use dxgi but route eligibility follows the selected label', () => {
  const pick = { api: 'dxgi', apiLabel: 'DirectX 12', bitness: 64, hasNativeDlss: true };
  assert.deepEqual(renderingApi.resolve(pick, 'dx11'), { api: 'dxgi', label: 'DirectX 11' });
  assert.deepEqual(renderingApi.resolve(pick, 'dx12'), { api: 'dxgi', label: 'DirectX 12' });
});

test('selection is an allowlist; all displayed choices resolve and unknown values fail', () => {
  for (const item of renderingApi.choices) assert.ok(renderingApi.resolve({ api: 'dxgi', apiLabel: 'DirectX 12' }, item.value));
  assert.equal(renderingApi.resolve({ api: 'dxgi', apiLabel: 'DirectX 12' }, 'bogus'), null);
  assert.equal(renderingApi.valid('bogus'), false);
  assert.equal(renderingApi.valid('__proto__'), false);
});

test('Vulkan keeps identified DXVK proxies while unknown, wrong-bitness and DirectX conflicts remain blocked', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dlss5-rendering-api-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const exe = path.join(dir, 'game.exe');
  writePe(exe, { bitness: 64 });
  const wrappers = [path.join(dir, 'dxgi.dll'), path.join(dir, 'd3d11.dll')];
  const config = { gameDir: dir, exePath: exe, api: 'vulkan', bitness: 64 };

  for (const file of wrappers) writePe(file, { bitness: 64, text: 'DXVK vkGetInstanceProcAddr' });
  assert.doesNotThrow(() => compatibility.assertLoaderCompatible(config));

  for (const bitness of [64, 32]) {
    for (const options of [{ bitness, text: 'unknown wrapper' }, { bitness: bitness === 64 ? 32 : 64, text: 'DXVK vkGetInstanceProcAddr' }, { bitness, text: 'ReShade DXVK vkGetInstanceProcAddr' }]) {
      writePe(wrappers[0], options);
      assert.throws(() => compatibility.assertLoaderCompatible(config), { code: 'errLoaderConflict' });
    }
  }
});

test('About links only open the Pre-SR fork and its latest releases', () => {
  assert.equal(projectUrl('github'), 'https://github.com/DoubleSixun/DLSS5-PreSR-Swapper');
  assert.equal(projectUrl('releases'), 'https://github.com/DoubleSixun/DLSS5-PreSR-Swapper/releases/latest');
  for (const key of ['__proto__', 'constructor', 'file:///C:/Windows', 'javascript:alert(1)', 'https://example.com', null, {}]) assert.equal(projectUrl(key), null);
});
