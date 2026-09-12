'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const scan = require('../src/core/scan');
const pe = require('../src/core/pe');
const ini = require('../src/core/feeder-config');
const apply = require('../src/core/apply');
const optiscaler = require('../src/core/optiscaler');
const presr = require('../src/core/presr-bootstrap');

presr.attachRuntimeImport(optiscaler, { app, dialog });

const PROFILE_BY_EXE = Object.freeze({
  'yysls.exe': Object.freeze({
    id: 'where-winds-meet',
    api: 'dxgi',
    apiLabel: 'DirectX 12',
    bitness: 64,
    onlineRisk: true
  })
});

let win = null;
let liveState = null;

const stateFile = () => path.join(app.getPath('userData'), 'standalone-library.json');
const idFor = (exePath) => crypto.createHash('sha1').update(path.resolve(exePath).toLowerCase()).digest('hex').slice(0, 16);

function defaultState() {
  return { language: 'en', selectedGameId: null, games: [] };
}

function loadState() {
  if (liveState) return liveState;
  try {
    const parsed = JSON.parse(fs.readFileSync(stateFile(), 'utf8'));
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.games)) {
      liveState = { ...defaultState(), ...parsed };
      return liveState;
    }
  } catch {}
  liveState = defaultState();
  return liveState;
}

function saveState() {
  const file = stateFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(loadState(), null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function profileFor(exePath) {
  return PROFILE_BY_EXE[path.basename(String(exePath || '')).toLowerCase()] || null;
}

function normalizeRecord(exePath) {
  const resolved = path.resolve(exePath);
  const profile = profileFor(resolved);
  return {
    id: idFor(resolved),
    dir: path.dirname(resolved),
    exePath: resolved,
    profileId: profile?.id || null,
    displayName: path.basename(resolved, path.extname(resolved)),
    settings: { runBeforeSR: true, passes: 1 }
  };
}

function selectedCandidate(result, record) {
  const wanted = path.resolve(record.exePath).toLowerCase();
  let chosen = (result.exeCandidates || []).find(row => path.resolve(String(row.path || '')).toLowerCase() === wanted) || null;
  const profile = profileFor(record.exePath);

  if (!chosen && profile && fs.existsSync(record.exePath)) {
    let size = 0;
    try { size = fs.statSync(record.exePath).size; } catch {}
    chosen = {
      path: record.exePath,
      rel: path.basename(record.exePath),
      name: path.basename(record.exePath),
      size,
      depth: 0,
      api: profile.api,
      apiLabel: profile.apiLabel,
      via: 'standalone-profile',
      dynamic: true,
      bitness: profile.bitness,
      dx12: profile.apiLabel === 'DirectX 12',
      emulator: null,
      apiChoices: [{ api: profile.api, label: profile.apiLabel }]
    };
  }

  if (chosen && profile) {
    Object.assign(chosen, {
      api: profile.api,
      apiLabel: profile.apiLabel,
      bitness: profile.bitness,
      dx12: profile.apiLabel === 'DirectX 12',
      emulator: null,
      apiChoices: [{ api: profile.api, label: profile.apiLabel }]
    });
  }

  return chosen || result.chosen || null;
}

async function inspectRecord(record) {
  const result = await scan.scanGame(record.dir);
  const chosen = selectedCandidate(result, record);
  if (chosen) {
    result.chosen = chosen;
    result.emptyReason = null;
    if (!result.primaryDlss && typeof scan.selectPrimaryDlss === 'function') {
      result.primaryDlss = scan.selectPrimaryDlss(result.dlssFiles || [], chosen);
    }
  }

  const profile = profileFor(record.exePath);
  const cachedRuntime = presr.runtimeCacheFile(app);
  const localRuntime = path.join(path.dirname(record.exePath), presr.RUNTIME_NAME);
  let runtime = null;
  if (presr.runtimeLooksValid(localRuntime)) runtime = { source: 'game', path: localRuntime };
  else if (presr.runtimeLooksValid(cachedRuntime)) runtime = { source: 'cache', path: cachedRuntime };
  if (runtime) runtime.version = pe.getFileVersion(runtime.path);

  const installed = Boolean(result.install?.optiscaler?.installed);
  return {
    id: record.id,
    dir: record.dir,
    exePath: record.exePath,
    profileId: record.profileId,
    displayName: record.displayName,
    settings: { runBeforeSR: true, passes: 1, ...(record.settings || {}) },
    onlineRisk: Boolean(profile?.onlineRisk),
    chosen: chosen ? {
      path: chosen.path,
      name: chosen.name || path.basename(chosen.path),
      api: chosen.api,
      apiLabel: chosen.apiLabel || chosen.api,
      bitness: chosen.bitness || pe.getBitness(chosen.path)
    } : null,
    dlss: result.primaryDlss ? {
      path: result.primaryDlss.path,
      version: result.primaryDlss.version || pe.getFileVersion(result.primaryDlss.path)
    } : null,
    installed,
    hasBackup: Boolean(result.hasBackup),
    optiscaler: result.install?.optiscaler || null,
    runtime
  };
}

async function viewState() {
  const state = loadState();
  const games = [];
  for (const record of state.games) {
    try { games.push(await inspectRecord(record)); }
    catch (error) {
      games.push({
        ...record,
        settings: { runBeforeSR: true, passes: 1, ...(record.settings || {}) },
        scanError: error.message || String(error),
        chosen: null,
        dlss: null,
        installed: false,
        hasBackup: false,
        runtime: null
      });
    }
  }
  if (!state.selectedGameId && games[0]) {
    state.selectedGameId = games[0].id;
    saveState();
  }
  return { language: state.language, selectedGameId: state.selectedGameId, games };
}

function recordFor(id) {
  return loadState().games.find(game => game.id === id) || null;
}

function nrIniPath(record) {
  return path.join(path.dirname(record.exePath), 'OptiScaler.ini');
}

function writeNrSettings(record) {
  const file = nrIniPath(record);
  if (!fs.existsSync(file)) return false;
  const settings = { runBeforeSR: true, passes: 1, ...(record.settings || {}) };
  let text = ini.readText(file);
  text = ini.setIni(text, 'DlssNr', 'Enabled', 'true');
  text = ini.setIni(text, 'DlssNr', 'RunBeforeSR', settings.runBeforeSR ? 'true' : 'false');
  text = ini.setIni(text, 'DlssNr', 'FinishedPicture', 'false');
  text = ini.setIni(text, 'DlssNr', 'Passes', String(settings.passes));
  fs.writeFileSync(file, text, 'utf8');
  return true;
}

function safeResult(work) {
  return Promise.resolve()
    .then(work)
    .then(value => ({ ok: true, value }))
    .catch(error => ({ ok: false, code: error.code || 'error', message: error.message || String(error) }));
}

async function confirmOnlineRisk(record) {
  const profile = profileFor(record.exePath);
  if (!profile?.onlineRisk) return true;
  const zh = loadState().language === 'zh-CN';
  const result = await dialog.showMessageBox(win, {
    type: 'warning',
    title: zh ? '在线游戏提示' : 'Online game notice',
    message: zh
      ? '该游戏包含在线功能。注入式图形模组可能导致崩溃或触发反作弊风险。此应用不会绕过或关闭反作弊。'
      : 'This game includes online functionality. Injection-based graphics mods can crash or trigger anti-cheat risk. This app does not bypass or disable anti-cheat.',
    detail: zh
      ? '仅在你理解风险并愿意继续时安装。'
      : 'Install only if you understand the risk and want to continue.',
    buttons: zh ? ['取消', '继续'] : ['Cancel', 'Continue'],
    defaultId: 0,
    cancelId: 0,
    noLink: true
  });
  return result.response === 1;
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    frame: false,
    show: false,
    backgroundColor: '#0b1117',
    ...(process.platform === 'win32' ? { backgroundMaterial: 'mica' } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());
}

ipcMain.handle('app:get-state', () => safeResult(viewState));
ipcMain.handle('app:set-language', (_event, language) => safeResult(async () => {
  if (!['en', 'zh-CN'].includes(language)) throw new Error('Unsupported language');
  loadState().language = language;
  saveState();
  return viewState();
}));

ipcMain.handle('games:add', () => safeResult(async () => {
  const picked = await dialog.showOpenDialog(win, {
    title: loadState().language === 'zh-CN' ? '选择游戏主程序' : 'Choose the game executable',
    properties: ['openFile'],
    filters: [{ name: 'Windows executable', extensions: ['exe'] }]
  });
  if (picked.canceled || !picked.filePaths[0]) return viewState();
  const record = normalizeRecord(picked.filePaths[0]);
  const state = loadState();
  const existing = state.games.findIndex(game => game.id === record.id);
  if (existing >= 0) state.games[existing] = { ...state.games[existing], ...record, settings: state.games[existing].settings || record.settings };
  else state.games.push(record);
  state.selectedGameId = record.id;
  saveState();
  return viewState();
}));

ipcMain.handle('games:select', (_event, id) => safeResult(async () => {
  if (!recordFor(id)) throw new Error('Unknown game');
  loadState().selectedGameId = id;
  saveState();
  return viewState();
}));

ipcMain.handle('games:remove', (_event, id) => safeResult(async () => {
  const state = loadState();
  state.games = state.games.filter(game => game.id !== id);
  if (state.selectedGameId === id) state.selectedGameId = state.games[0]?.id || null;
  saveState();
  return viewState();
}));

ipcMain.handle('game:open-folder', (_event, id) => safeResult(async () => {
  const record = recordFor(id);
  if (!record) throw new Error('Unknown game');
  await shell.openPath(path.dirname(record.exePath));
  return true;
}));

ipcMain.handle('game:set-settings', (_event, id, settings) => safeResult(async () => {
  const record = recordFor(id);
  if (!record) throw new Error('Unknown game');
  const next = { ...record.settings };
  if (Object.prototype.hasOwnProperty.call(settings || {}, 'runBeforeSR')) next.runBeforeSR = Boolean(settings.runBeforeSR);
  if (Object.prototype.hasOwnProperty.call(settings || {}, 'passes')) {
    const passes = Number(settings.passes);
    if (!Number.isInteger(passes) || passes < 1 || passes > 3) throw new Error('Passes must be 1, 2, or 3');
    next.passes = passes;
  }
  record.settings = next;
  saveState();
  writeNrSettings(record);
  return viewState();
}));

ipcMain.handle('runtime:import', (_event, id) => safeResult(async () => {
  const record = recordFor(id);
  if (!record) throw new Error('Unknown game');
  const picked = await dialog.showOpenDialog(win, {
    title: loadState().language === 'zh-CN' ? '选择 NVIDIA Neural Rendering Runtime' : 'Select NVIDIA Neural Rendering Runtime',
    defaultPath: path.dirname(record.exePath),
    properties: ['openFile'],
    filters: [{ name: 'nvngx_dlssnr.dll', extensions: ['dll'] }]
  });
  if (picked.canceled || !picked.filePaths[0]) return viewState();
  presr.cacheRuntime(app, picked.filePaths[0]);
  return viewState();
}));

ipcMain.handle('game:install', (_event, id) => safeResult(async () => {
  const record = recordFor(id);
  if (!record) throw new Error('Unknown game');
  if (!(await confirmOnlineRisk(record))) return { cancelled: true, state: await viewState() };

  const inspected = await inspectRecord(record);
  if (!inspected.chosen) throw Object.assign(new Error('No supported game executable was detected.'), { code: 'noExecutable' });
  if (inspected.chosen.bitness !== 64) throw Object.assign(new Error('This Neural Rendering route requires a 64-bit game.'), { code: 'unsupportedArchitecture' });
  if (!inspected.dlss) throw Object.assign(new Error('Native DLSS was not detected for this game.'), { code: 'noDlss' });
  if (inspected.hasBackup) throw Object.assign(new Error('This game already has a managed installation. Restore originals before reinstalling.'), { code: 'alreadyInstalled' });

  optiscaler.checkConflicts(record.dir, record.exePath, null, inspected.chosen.api);
  const optiRoot = await optiscaler.ensureOptiScaler(app.getPath('userData'), '0.7.7-presr');
  const logs = [];
  await optiscaler.install({
    gameDir: record.dir,
    exePath: record.exePath,
    api: inspected.chosen.api,
    apiLabel: inspected.chosen.apiLabel,
    optiRoot,
    source: { payload: [] }
  }, entry => logs.push(entry));
  writeNrSettings(record);
  return { logs, state: await viewState() };
}));

ipcMain.handle('game:restore', (_event, id) => safeResult(async () => {
  const record = recordFor(id);
  if (!record) throw new Error('Unknown game');
  const logs = [];
  await apply.restore(record.dir, entry => logs.push(entry));
  return { logs, state: await viewState() };
}));

ipcMain.on('window:minimize', () => win?.minimize());
ipcMain.on('window:maximize', () => {
  if (!win) return;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
});
ipcMain.on('window:close', () => win?.close());

app.whenReady().then(createWindow);
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
