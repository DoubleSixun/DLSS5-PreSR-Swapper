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

test('standalone exposes list icons, banner artwork and existing NR detection to the renderer', () => {
  const main = read('standalone/main.js');
  const ux = read('standalone/renderer/ux-fixes.js');
  const css = read('standalone/renderer/compact-ui.css');
  assert.match(main, /getFileIcon/);
  assert.match(main, /iconDataUrl/);
  assert.match(main, /bannerDataUrl/);
  assert.match(main, /existingSetup/);
  assert.match(ux, /decorateHero/);
  assert.match(ux, /bannerDataUrl/);
  assert.match(ux, /decorateGameRows/);
  assert.doesNotMatch(ux, /heroGameIcon/);
  assert.match(css, /hero-game-icon\{display:none!important\}/);
  assert.match(ux, /Existing NR detected/);
});

test('home UI keeps explanations compact and moves How it works behind an info button', () => {
  const ux = read('standalone/renderer/ux-fixes.js');
  const css = read('standalone/renderer/compact-ui.css');
  assert.match(ux, /nrInfoButton/);
  assert.match(ux, /nr-info-popover/);
  assert.match(css, /#gameDetail \.eyebrow/);
  assert.match(css, /#gameDetail \.mode-line/);
  assert.match(css, /#gameDetail \.game-hint/);
  assert.match(css, /\.badges\{display:inline-flex/);
});

test('standalone automatically discovers launcher games and also exposes a manual rescan', () => {
  const main = read('standalone/main.js');
  const preload = read('standalone/preload.js');
  const discovery = read('standalone/core/discovery.js');
  const library = read('standalone/core/derived/library.js');
  const ux = read('standalone/renderer/ux-fixes.js');
  assert.match(main, /ensureAutoDiscovery/);
  assert.match(main, /games:rescan/);
  assert.match(preload, /rescanGames/);
  assert.match(discovery, /library\.discover/);
  assert.match(library, /Steam/);
  assert.match(library, /Epic Games/);
  assert.match(library, /GOG/);
  assert.match(library, /Ubisoft/);
  assert.match(library, /Xbox/);
  assert.match(ux, /rescanGames/);
});

test('non-blocking setting updates no longer pre-render switches back to old state', () => {
  const ux = read('standalone/renderer/ux-fixes.js');
  assert.match(ux, /act\s*=\s*async function\(work, lock = true\)/);
  assert.match(ux, /if \(lock\) \{ busy = true; render\(\); \}/);
});
