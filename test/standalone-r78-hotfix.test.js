'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('manager backend revision advances and enables the documented safe input fallback', () => {
  const optiscaler = read('standalone/core/optiscaler.js');
  assert.match(optiscaler, /packageId: '0\.7\.7-dlss5mgr5'/);
  assert.match(optiscaler, /\['Hotfix', 'ManualInputPolling', 'true'\]/);
  assert.match(optiscaler, /\['Hotfix', 'CheckForUpdate', 'false'\]/);
});

test('library can refresh an older managed backend without losing original backups', () => {
  const compat = read('standalone/renderer/home-compat.js');
  const hotfix = read('standalone/renderer/r79-hotfix.js');
  assert.match(compat, /needsBackendUpdate/);
  assert.match(hotfix, /CURRENT_BACKEND_ID = '0\.7\.7-dlss5mgr5'/);
  assert.match(hotfix, /window\.nrApp\.restore\(game\.id\)/);
  assert.match(hotfix, /window\.nrApp\.install\(game\.id\)/);
  assert.match(hotfix, /Update in-game backend/);
  assert.doesNotThrow(() => new Function(hotfix));
});

test('library scan shows progress before discovery completes', () => {
  const hotfix = read('standalone/renderer/r79-hotfix.js');
  assert.match(hotfix, /scanning: '正在扫描…'/);
  assert.match(hotfix, /busy \? text\(\)\.scanning : text\(\)\.scan/);
  assert.match(hotfix, /aria-busy/);
});

test('independent manager overlay owns visibility and pass controls', () => {
  const patch = read('scripts/patch-optiscaler-compact-overlay.py');
  assert.match(patch, /static bool dlss5ManagerOverlayVisible = false/);
  assert.match(patch, /RenderDlss5ManagerOverlay/);
  assert.match(patch, /DoubleSixunManagerOverlay/);
  assert.match(patch, /_isVisible = false;/);
  assert.match(patch, /for \(int pass = 1; pass <= 3; \+\+pass\)/);
  assert.match(patch, /ImGuiWindowFlags_NoTitleBar/);
  assert.doesNotMatch(patch, /DoubleSixunCompactHost/);
});

test('language picker switches visible state before waiting for persistence', () => {
  const compat = read('standalone/renderer/home-compat.js');
  const optimistic = compat.indexOf('state = { ...state, language };');
  const persist = compat.indexOf('await window.nrApp.setLanguage(language)');
  assert.ok(optimistic >= 0, 'optimistic language assignment is present');
  assert.ok(persist > optimistic, 'visible language changes before IPC persistence finishes');
  assert.doesNotMatch(compat, /window\.location\.reload\(\)/);
});
