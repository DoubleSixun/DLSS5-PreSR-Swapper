'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('standalone app does not load the upstream main process', () => {
  const main = read('standalone/main.js');
  assert.doesNotMatch(main, /require\s*\(\s*['"]\.\.\/main\.js['"]\s*\)/);
  assert.doesNotMatch(main, /community-client|admin-vault|feeder-config\.js.*route|RenoDX/i);
});

test('standalone renderer has no Community or Chat product surfaces', () => {
  const html = read('standalone/renderer/index.html');
  assert.doesNotMatch(html, /data-page=["'](?:community|chat)["']/i);
});

test('standalone launcher is explicit and separate from the legacy app', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts['start:standalone'], 'electron standalone');
  assert.equal(pkg.main, 'presr-main.js');
});

test('standalone app keeps English and Simplified Chinese as exclusive UI locales', () => {
  const renderer = read('standalone/renderer/app.js');
  assert.match(renderer, /\ben:\s*\{/);
  assert.match(renderer, /['"]zh-CN['"]:\s*\{/);
  assert.match(renderer, /whereWindsMeet:\s*'Where Winds Meet'/);
  assert.match(renderer, /whereWindsMeet:\s*'燕云十六声'/);
});
