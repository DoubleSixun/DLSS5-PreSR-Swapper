'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const preload = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf8');

test('desktop UI presents Pre-SR and Post-SR as explicit rendering modes', () => {
  assert.match(preload, /Performance · Pre-SR · NR → SR · v0\.7\.7/);
  assert.match(preload, /Quality · Post-SR · SR → NR · v0\.2\.0/);
  assert.match(preload, /Neural Rendering mode/);
  assert.match(preload, /神经渲染模式/);
  assert.match(preload, /NR → Super Resolution → Output/);
  assert.match(preload, /Super Resolution → NR → Output/);
});

test('friendly labels round-trip back to raw build ids before IPC', () => {
  assert.match(preload, /rawOptiBuild\(version\)/);
  assert.match(preload, /ipcRenderer\.invoke\('set-optiscaler-build', dir, rawOptiBuild\(version\)\)/);
});

test('Pre-SR explanation card reacts when the existing game sheet is recreated', () => {
  assert.match(preload, /MutationObserver\(decorate\)/);
  assert.match(preload, /presr-mode-card/);
  assert.match(preload, /presr-active/);
});
