'use strict';

// Runtime-free Windows entry point for the Pre-SR fork. The original Swapper
// main process stays intact; this file layers the Pre-SR-specific behaviour on
// top so future upstream rebases stay small and reviewable.
const fs = require('fs');
const path = require('path');
const { app, dialog, BrowserWindow, ipcMain } = require('electron');
const scan = require('./src/core/scan');
const routes = require('./src/shared/install-routes');
const optiscaler = require('./src/core/optiscaler');
const presr = require('./src/core/presr-bootstrap');

// ---------- thin payload / runtime-free Pre-SR ----------
const originalScanSource = scan.scanSource;
scan.scanSource = (sourceDir) => presr.scanThinPayload(sourceDir, originalScanSource);
presr.restrictRoutesToPreSr(routes);
presr.attachRuntimeImport(optiscaler, { app, dialog });

// ---------- Where Winds Meet / yysls profile ----------
// yysls.exe can be hard for generic PE/import inspection to classify on some
// builds. If the exact game executable is present, prefer it over launchers and
// report the renderer the game uses here: 64-bit DirectX 12. This is detection
// only; it does not change or bypass any anti-cheat handling in the installer.
const originalScanGame = scan.scanGame;
scan.scanGame = async (gameDir) => {
  const result = await originalScanGame(gameDir);
  const wanted = path.join(gameDir, 'yysls.exe');
  if (!fs.existsSync(wanted)) return result;

  let candidate = (result.exeCandidates || []).find((row) =>
    path.basename(String(row.path || '')).toLowerCase() === 'yysls.exe');

  if (!candidate) {
    let size = 0;
    try { size = fs.statSync(wanted).size; } catch {}
    candidate = {
      path: wanted,
      rel: 'yysls.exe',
      name: 'yysls.exe',
      size,
      depth: 0,
      api: 'dxgi',
      apiLabel: 'DirectX 12',
      via: 'presr-known-profile',
      dynamic: true,
      bitness: 64,
      dx12: true,
      emulator: null,
      apiChoices: [{ api: 'dxgi', label: 'DirectX 12' }]
    };
    result.exeCandidates = [candidate, ...(result.exeCandidates || [])];
  } else {
    Object.assign(candidate, {
      api: 'dxgi',
      apiLabel: 'DirectX 12',
      via: candidate.via || 'presr-known-profile',
      bitness: 64,
      dx12: true,
      apiChoices: [{ api: 'dxgi', label: 'DirectX 12' }]
    });
    result.exeCandidates = [candidate, ...(result.exeCandidates || []).filter((row) => row !== candidate)];
  }

  result.chosen = candidate;
  result.emptyReason = null;
  result.emulator = null;
  if (!result.primaryDlss && typeof scan.selectPrimaryDlss === 'function') {
    result.primaryDlss = scan.selectPrimaryDlss(result.dlssFiles || [], candidate);
  }
  return result;
};

// ---------- "Add a game" should mean choosing the game EXE ----------
// Upstream currently presents a folder picker even though the button says Add
// a game. That made it very easy to add the wrong level of an Unreal install,
// and adding an .exe path by hand produced a permanent "No executable" card.
// Capture the private add-game-path handler while main.js registers it, then
// replace only the picker after main.js has finished loading. The original
// handler still updates main.js's live in-memory library state, so the new card
// appears immediately without restarting the app.
const realHandle = ipcMain.handle.bind(ipcMain);
let addGamePathHandler = null;
ipcMain.handle = (channel, listener) => {
  if (channel === 'add-game-path') addGamePathHandler = listener;
  return realHandle(channel, listener);
};

require('./main.js');

// Restore Electron's normal registration method before adding our replacement.
ipcMain.handle = realHandle;
if (addGamePathHandler) {
  ipcMain.removeHandler('add-game');
  realHandle('add-game', async (event) => {
    const owner = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(owner, {
      title: 'Add one game executable',
      properties: ['openFile'],
      filters: [{ name: 'Windows game executable', extensions: ['exe'] }]
    });
    if (result.canceled || !result.filePaths.length) return null;
    const exe = result.filePaths[0];
    const dir = path.dirname(exe);
    return addGamePathHandler(event, dir);
  });
}
