'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('standalone supports a master Neural Rendering enabled switch', () => {
  const main = read('standalone/main.js');
  const ux = read('standalone/renderer/ux-fixes.js');
  assert.match(main, /enabled:\s*true/);
  assert.match(main, /settings\.enabled/);
  assert.match(ux, /nrEnabledToggle/);
  assert.match(ux, /Enable DLSS Neural Rendering/);
});

test('NR settings bridge reads and writes existing OptiScaler config', (t) => {
  const nrSettings = require(path.join(root, 'standalone/core/nr-settings'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dlssnr-settings-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const exe = path.join(dir, 'Game.exe');
  fs.writeFileSync(exe, 'x');
  fs.writeFileSync(path.join(dir, 'OptiScaler.ini'), '[DlssNr]\r\nEnabled=true\r\nRunBeforeSR=true\r\nPasses=2\r\nStyle=1\r\n', 'utf8');

  const before = nrSettings.read(exe, {});
  assert.equal(before.enabled, true);
  assert.equal(before.runBeforeSR, true);
  assert.equal(before.passes, 2);
  assert.equal(before.pass1Style, '1');

  nrSettings.apply(exe, { ...before, enabled: false, runBeforeSR: false });
  const after = nrSettings.read(exe, {});
  assert.equal(after.enabled, false);
  assert.equal(after.runBeforeSR, false);
});

test('standalone exposes executable artwork and existing NR detection to the renderer', () => {
  const main = read('standalone/main.js');
  const ux = read('standalone/renderer/ux-fixes.js');
  assert.match(main, /getFileIcon/);
  assert.match(main, /iconDataUrl/);
  assert.match(main, /existingSetup/);
  assert.match(ux, /heroGameIcon/);
  assert.match(ux, /Existing NR detected/);
});

test('non-blocking setting updates no longer pre-render switches back to old state', () => {
  const ux = read('standalone/renderer/ux-fixes.js');
  assert.match(ux, /act\s*=\s*async function\(work, lock = true\)/);
  assert.match(ux, /if \(lock\) \{\s*busy = true;\s*render\(\);/s);
});
