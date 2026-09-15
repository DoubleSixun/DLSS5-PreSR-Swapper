'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('manager backend revision enables the documented safe input fallback', () => {
  const optiscaler = read('standalone/core/optiscaler.js');
  assert.match(optiscaler, /packageId: '0\.7\.7-dlss5mgr7'/);
  assert.match(optiscaler, /\['Hotfix', 'ManualInputPolling', 'true'\]/);
  assert.match(optiscaler, /\['Hotfix', 'CheckForUpdate', 'false'\]/);
});

test('library updates a managed backend in place instead of restore then install', () => {
  const compat = read('standalone/renderer/home-compat.js');
  const preload = read('standalone/preload.js');
  const updater = read('standalone/core/backend-update.js');
  const optiscaler = read('standalone/core/optiscaler.js');
  assert.match(compat, /MANAGER_BACKEND_ID = '0\.7\.7-dlss5mgr7'/);
  assert.match(compat, /needsBackendUpdate/);
  assert.match(compat, /window\.nrApp\.updateBackend\(game\.id\)/);
  assert.doesNotMatch(compat, /window\.nrApp\.restore\(game\.id\)/);
  assert.doesNotMatch(compat, /window\.nrApp\.install\(game\.id\)/);
  assert.match(preload, /updateBackend: id => ipcRenderer\.invoke\('game:update-backend', id\)/);
  assert.doesNotMatch(preload, /r79-hotfix\.js/);
  assert.match(updater, /Update backend/);
  assert.match(updater, /original-file backup intact/);
  assert.match(optiscaler, /async function upgradeManaged/);
  assert.match(optiscaler, /update-stage-/);
  assert.match(optiscaler, /rollbackManagedTargets/);
});

test('library scan shows progress before discovery completes', () => {
  const compat = read('standalone/renderer/home-compat.js');
  assert.match(compat, /scanning: '正在扫描…'/);
  assert.match(compat, /busy \? c\.scanning : c\.scan/);
  assert.match(compat, /aria-busy/);
});

test('managed writes refuse to run while the game process is active', () => {
  const guard = read('standalone/core/game-process.js');
  const optiscaler = read('standalone/core/optiscaler.js');
  const updater = read('standalone/core/backend-update.js');
  assert.match(guard, /tasklist\.exe/);
  assert.match(guard, /gameRunning/);
  assert.match(optiscaler, /await gameProcess\.assertNotRunning\(exePath/);
  assert.match(updater, /await gameProcess\.assertNotRunning\(record\.exePath, language\)/);
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

test('language picker switches immediately and syncs the in-game overlay', () => {
  const compat = read('standalone/renderer/home-compat.js');
  const optimistic = compat.indexOf('state = { ...state, language };');
  const persist = compat.indexOf('await window.nrApp.setLanguage(language)');
  const overlaySync = compat.indexOf('await window.nrApp.setOverlayLanguage(language)');
  assert.ok(optimistic >= 0, 'optimistic language assignment is present');
  assert.ok(persist > optimistic, 'visible language changes before IPC persistence finishes');
  assert.ok(overlaySync > persist, 'in-game overlay language follows persisted desktop language');
  assert.doesNotMatch(compat, /window\.location\.reload\(\)/);
});
