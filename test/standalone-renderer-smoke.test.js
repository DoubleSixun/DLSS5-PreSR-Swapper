'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { execFileSync } = require('child_process');

test('real Electron renderer exercises library actions and EXE candidate choice', { skip: process.platform !== 'win32' }, () => {
  const output = execFileSync(require('electron'), [path.resolve(__dirname, '../scripts/test-standalone-library-ui.js')], {
    encoding: 'utf8', timeout: 30000, windowsHide: true
  });
  assert.match(output, /PASS: favorites, hide\/unhide/);
});
