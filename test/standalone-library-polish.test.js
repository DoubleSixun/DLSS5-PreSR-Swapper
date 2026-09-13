'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('launcher discovery keeps installed games even when DLSS is not present', () => {
  const discovery = read('standalone/core/discovery.js');
  assert.doesNotMatch(discovery, /if \(!dlss\.length \|\| !exes\.length\) return null/);
  assert.match(discovery, /coverPath/);
  assert.match(discovery, /library_600x900\.jpg/);
  assert.match(discovery, /library_hero\.jpg/);
});

test('Steam-like library UI uses portrait covers and can filter compatibility', () => {
  const ux = read('standalone/renderer/ux-fixes.js');
  const css = read('standalone/renderer/compact-ui.css');
  assert.match(ux, /coverDataUrl/);
  assert.match(ux, /gamesFilterBar/);
  assert.match(ux, /compatibleFilter/);
  assert.match(css, /aspect-ratio:2\/3/);
  assert.match(css, /home-scan-button/);
  assert.match(css, /border:0!important/);
});

test('game detail exposes Play and viewport-safe popovers and toasts', () => {
  const main = read('standalone/main.js');
  const preload = read('standalone/preload.js');
  const ux = read('standalone/renderer/ux-fixes.js');
  const css = read('standalone/renderer/compact-ui.css');
  assert.match(main, /game:launch/);
  assert.match(preload, /launchGame/);
  assert.match(ux, /launchGameBtn/);
  assert.match(ux, /document\.body\.appendChild\(popover\)/);
  assert.match(css, /\.nr-info-popover\{position:fixed!important/);
  assert.match(css, /\.toast\{position:fixed!important/);
});

test('existing OptiScaler setup can migrate through managed backup and restore', () => {
  const main = read('standalone/main.js');
  const optiscaler = read('standalone/core/optiscaler.js');
  assert.match(main, /confirmExistingMigration/);
  assert.match(main, /replaceExisting/);
  assert.match(optiscaler, /replaceExisting = false/);
  assert.match(optiscaler, /if \(!replaceExisting\) checkConflicts/);
  assert.match(optiscaler, /migratedExisting/);
});

test('compact native overlay preserves OptiScaler menu visibility and input lifecycle', () => {
  const patch = read('scripts/patch-optiscaler-compact-overlay.py');
  assert.match(patch, /TABLE_SIGNATURE = "void MenuCommon::RenderMainMenuTable/);
  assert.match(patch, /Preserve RenderMainMenuWindow/);
  assert.doesNotMatch(patch, /REPLACEMENT\s*=\s*r'''void MenuCommon::RenderMainMenuWindow/);
  assert.match(patch, /io\.WantCaptureKeyboard = false/);
  assert.match(patch, /io\.WantCaptureMouse = false/);
  assert.match(patch, /DoubleSixunCompactOverlay/);
  assert.match(patch, /DoubleSixunCompactHost/);
});

test('Settings removes the redundant one-language description', () => {
  const ux = read('standalone/renderer/ux-fixes.js');
  assert.match(ux, /#page-settings \.page-heading p/);
  assert.match(ux, /\.remove\(\)/);
});
