'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const opti = require('../src/core/optiscaler');
const ini = require('../src/core/feeder-config');

test('Pre-SR backend is pinned and hash-verified', () => {
  const release = opti.releaseFor('0.7.7-presr');
  assert.equal(release.mode, 'presr');
  assert.equal(release.upstreamVersion, '0.7.7');
  assert.equal(release.readme, 'INSTALL-DLSSNR.md');
  assert.match(release.url, /wilsjo2\/OptiScaler-DLSSNR-PreSR-Multipass/);
  assert.equal(release.sha256, '4a315a3b3ee495631bd7cb1f562f609af577443602e507bfc7a7e6749c296258');
});

test('Pre-SR configuration enables NR before Super Resolution', () => {
  const release = opti.releaseFor('0.7.7-presr');
  const out = opti.configure('', { exePath: path.join('C:', 'Games', 'Example', 'game.exe') }, release);
  assert.equal(ini.getIni(out, 'DlssNr', 'Enabled'), 'true');
  assert.equal(ini.getIni(out, 'DlssNr', 'RunBeforeSR'), 'true');
  assert.equal(ini.getIni(out, 'DlssNr', 'FinishedPicture'), 'false');
  assert.equal(ini.getIni(out, 'DlssNr', 'Passes'), '1');
  assert.equal(ini.getIni(out, 'DlssNr', 'WorkingScale'), '1.0');
  assert.equal(ini.getIni(out, 'ProcessFilter', 'TargetProcessName'), 'game.exe');
});

test('standard OptiScaler remains Post-SR', () => {
  const out = opti.configure('[DlssNr]\nRunBeforeSR=true\n', { exePath: 'game.exe' }, opti.RELEASE);
  assert.equal(ini.getIni(out, 'DlssNr', 'RunBeforeSR'), 'false');
});

test('release is recovered from verified component cache folder', () => {
  assert.equal(opti.releaseFromRoot(path.join('cache', 'components', 'OptiScaler-0.7.7-presr')).mode, 'presr');
  assert.equal(opti.releaseFromRoot(path.join('cache', 'components', 'OptiScaler-0.2.0-patch1')).mode, 'standard');
});
