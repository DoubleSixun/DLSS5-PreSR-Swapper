'use strict';

// Runtime-free Windows entry point for the Pre-SR fork. The original Swapper
// main process stays intact; this file only changes three things before it is
// loaded:
//   1) recognise the thin payload marker used by our GitHub build,
//   2) expose only OptiScaler Pre-SR on the game sheet,
//   3) ask for a user-supplied NVIDIA nvngx_dlssnr.dll on first install.
//
// Keeping the changes here makes it much easier to rebase future upstream
// Swapper releases without maintaining a giant fork of main.js.
const { app, dialog } = require('electron');
const scan = require('./src/core/scan');
const routes = require('./src/shared/install-routes');
const optiscaler = require('./src/core/optiscaler');
const presr = require('./src/core/presr-bootstrap');

const originalScanSource = scan.scanSource;
scan.scanSource = (sourceDir) => presr.scanThinPayload(sourceDir, originalScanSource);
presr.restrictRoutesToPreSr(routes);
presr.attachRuntimeImport(optiscaler, { app, dialog });

require('./main.js');
