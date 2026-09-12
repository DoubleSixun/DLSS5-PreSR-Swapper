'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('standalone app does not load the upstream product shell', () => {
  const main = read('standalone/main.js');
  assert.doesNotMatch(main, /require\s*\(\s*['"]\.\.\/main\.js['"]\s*\)/);
  assert.doesNotMatch(main, /\.\.\/src\/core\/(?:scan|apply|feeder-config|optiscaler|presr-bootstrap)/);
  assert.doesNotMatch(main, /community-client|admin-vault|RenoDX/i);
});

test('standalone core has no Feeder, RenoDX, emulator or Community dependencies', () => {
  const files = [
    'standalone/core/game-scan.js',
    'standalone/core/file-state.js',
    'standalone/core/runtime.js',
    'standalone/core/optiscaler.js',
    'standalone/core/ini.js',
    'standalone/core/download.js'
  ];
  const source = files.map(read).join('\n');
  assert.doesNotMatch(source, /src\/core\/(?:scan|apply|feeder-config|runtime-components|presr-bootstrap)/);
  assert.doesNotMatch(source, /community-client|admin-vault|emulators\.js|feeder-release|RenoDX/i);
});

test('retained upstream-derived code is isolated behind an attributed boundary', () => {
  const pe = read('standalone/core/derived/pe.js');
  assert.match(pe, /DLSS5-Swapper by Rakan Alkhaldi/);
  assert.match(pe, /MIT License/);
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

test('standalone INI editor updates one section without requiring Feeder config', () => {
  const ini = require(path.join(root, 'standalone/core/ini'));
  let text = '[DlssNr]\r\nEnabled=false\r\n\r\n[Other]\r\nValue=1';
  text = ini.set(text, 'DlssNr', 'RunBeforeSR', 'true');
  text = ini.set(text, 'DlssNr', 'Enabled', 'true');
  assert.equal(ini.get(text, 'DlssNr', 'Enabled'), 'true');
  assert.equal(ini.get(text, 'DlssNr', 'RunBeforeSR'), 'true');
  assert.equal(ini.get(text, 'Other', 'Value'), '1');
});

test('standalone file state rejects paths outside the managed game root', () => {
  const fileState = require(path.join(root, 'standalone/core/file-state'));
  const game = path.join(root, 'tmp-game');
  assert.throws(() => fileState.safePath(game, path.join('..', 'outside.dll')), /escapes managed root/);
  assert.equal(fileState.safePath(game, path.join('bin', 'inside.dll')), path.join(game, 'bin', 'inside.dll'));
});