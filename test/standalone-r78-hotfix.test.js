'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('manager backend revision advances and enables the documented safe input fallback', () => {
  const optiscaler = read('standalone/core/optiscaler.js');
  assert.match(optiscaler, /packageId: '0\.7\.7-dlss5mgr3'/);
  assert.match(optiscaler, /\['Hotfix', 'ManualInputPolling', 'true'\]/);
  assert.match(optiscaler, /\['Hotfix', 'CheckForUpdate', 'false'\]/);
});

test('library can refresh an older managed backend without losing original backups', () => {
  const compat = read('standalone/renderer/home-compat.js');
  assert.match(compat, /MANAGER_BACKEND_ID = '0\.7\.7-dlss5mgr3'/);
  assert.match(compat, /needsBackendUpdate/);
  assert.match(compat, /window\.nrApp\.restore\(game\.id\)/);
  assert.match(compat, /window\.nrApp\.install\(game\.id\)/);
  assert.match(compat, /Update in-game backend/);
});

test('language picker switches visible state before waiting for persistence', () => {
  const compat = read('standalone/renderer/home-compat.js');
  const optimistic = compat.indexOf('state = { ...state, language };');
  const persist = compat.indexOf('await window.nrApp.setLanguage(language)');
  assert.ok(optimistic >= 0, 'optimistic language assignment is present');
  assert.ok(persist > optimistic, 'visible language changes before IPC persistence finishes');
  assert.doesNotMatch(compat, /window\.location\.reload\(\)/);
});
