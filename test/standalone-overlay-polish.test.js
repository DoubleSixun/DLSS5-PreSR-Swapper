'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('manager overlay uses a safe horizontal inset and compact labeled style rows', () => {
  const fix = read('scripts/fix-optiscaler-manager-overlay-compile.py');
  assert.match(fix, /horizontalMargin = 64\.0f \* scale/);
  assert.match(fix, /verticalMargin = 26\.0f \* scale/);
  assert.match(fix, /comboWidth = 176\.0f \* scale/);
  assert.match(fix, /optionalStyleCombo/);
  assert.match(fix, /baseStyle/);
  assert.match(fix, /##ManagerPass2Style/);
  assert.match(fix, /##ManagerPass3Style/);
});

test('all active advanced passes default open', () => {
  const fix = read('scripts/fix-optiscaler-manager-overlay-compile.py');
  assert.match(fix, /TreeNodeEx\(title\.c_str\(\), ImGuiTreeNodeFlags_DefaultOpen\)/);
});

test('desktop language is mirrored into managed in-game overlays with CJK glyph support', () => {
  const fix = read('scripts/fix-optiscaler-manager-overlay-compile.py');
  const settings = read('standalone/core/nr-settings.js');
  const preload = read('standalone/preload.js');
  const hotfix = read('standalone/renderer/r79-hotfix.js');

  assert.match(fix, /Dlss5ManagerLanguage/);
  assert.match(fix, /GetDlss5ManagerGlyphRanges/);
  assert.doesNotMatch(fix, /->GetGlyphRangesChinese/);
  const glyphBlock = fix.match(/static const ImWchar chineseRanges\[\] = \{([\s\S]*?)\};/);
  assert.ok(glyphBlock, 'CJK glyph ranges have static lifetime for atlas building');
  const endpoints = [...glyphBlock[1].matchAll(/0x[0-9A-F]+/gi)].map(([hex]) => Number(hex));
  assert.equal(endpoints.length % 2, 0, 'glyph ranges use inclusive start/end pairs');
  for (const character of new Set([...fix].filter(char => char.codePointAt(0) > 0x7f))) {
    const codepoint = character.codePointAt(0);
    assert.ok(endpoints.some((start, index) => index % 2 === 0 &&
      codepoint >= start && codepoint <= endpoints[index + 1]),
    `overlay glyph ranges must cover ${character} (U+${codepoint.toString(16)})`);
  }
  assert.match(fix, /神经渲染/);
  assert.match(fix, /模型分辨率/);
  assert.match(fix, /实验性/);

  assert.match(settings, /DLSS5ManagerLanguage/);
  assert.match(settings, /applyOverlayLanguageToLibrary/);
  assert.match(settings, /msyh\.ttc/);
  assert.match(preload, /setOverlayLanguage/);
  assert.match(hotfix, /setOverlayLanguage/);
  assert.match(hotfix, /syncOverlayLanguage\(state\.language\)/);
});

test('manager backend revision is mgr6 everywhere user-facing update detection relies on it', () => {
  for (const rel of [
    'standalone/core/optiscaler.js',
    'standalone/renderer/home-compat.js',
    'standalone/renderer/r79-hotfix.js'
  ]) {
    assert.match(read(rel), /0\.7\.7-dlss5mgr6/, `${rel} should use mgr6`);
  }
});
