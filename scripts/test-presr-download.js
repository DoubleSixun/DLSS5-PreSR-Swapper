'use strict';

// Network integration check for the exact public release this fork installs.
// It deliberately uses the production downloader, checksum and payload validator.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const opti = require('../src/core/optiscaler');

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dlss5-presr-download-'));
  try {
    const component = await opti.ensureOptiScaler(root, '0.7.7-presr');
    opti.validatePayload(component, opti.releaseFor('0.7.7-presr'));
    assert.equal(path.basename(component), 'OptiScaler-0.7.7-presr');
    assert.ok(fs.existsSync(path.join(component, 'OptiScaler.dll')));
    assert.ok(fs.existsSync(path.join(component, 'nvngx.dll_dlssnr.dll')));
    assert.ok(fs.existsSync(path.join(component, 'INSTALL-DLSSNR.md')));
    console.log('Pre-SR v0.7.7 archive downloaded, SHA-256 verified, extracted and validated.');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
