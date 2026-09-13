'use strict';

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const gameScan = require('./core/game-scan');
const fileState = require('./core/file-state');
const runtime = require('./core/runtime');
const optiscaler = require('./core/optiscaler');
const nrSettings = require('./core/nr-settings');
const discovery = require('./core/discovery');

const PROFILE_BY_EXE = Object.freeze({
  'yysls.exe': Object.freeze({
    id: 'where-winds-meet',
    names: Object.freeze({ en: 'Where Winds Meet', 'zh-CN': '燕云十六声' }),
    api: 'dxgi',
    apiLabel: 'DirectX 12',
    bitness: 64,
    onlineRisk: true,
    bannerUrl: 'https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/3564740/library_hero.jpg',
    coverUrl: 'https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/3564740/library_600x900.jpg'
  })
});

const STYLE_VALUES = new Set(['auto', '0', '1', '2']);
const DEFAULT_GAME_SETTINGS = Object.freeze({
  enabled: true,
  runBeforeSR: true,
  passes: 1,
  pass1Style: 'auto',
  pass2Style: 'auto',
  pass3Style: 'auto'
});

let win = null;
let liveState = null;
let discoveryPromise = null;
const iconCache = new Map();
const artworkCache = new Map();

const stateFile = () => path.join(app.getPath('userData'), 'standalone-library.json');
const idFor = exePath => crypto.createHash('sha1').update(path.resolve(exePath).toLowerCase()).digest('hex').slice(0, 16);
const settingsFor = value => ({ ...DEFAULT_GAME_SETTINGS, ...(value || {}) });

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
  const temp = file + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(loadState(), null, 2), 'utf8');
  fs.renameSync(temp, file);
}

function profileFor(exePath) {
  return PROFILE_BY_EXE[path.basename(String(exePath || '')).toLowerCase()] || null;
}

function normalizeRecord(exePath, meta = {}) {
  const resolved = path.resolve(exePath);
  const profile = profileFor(resolved);
  return {
    id: idFor(resolved),
    dir: path.dirname(resolved),
    exePath: resolved,
    profileId: profile?.id || null,
    displayName: meta.displayName || path.basename(resolved, path.extname(resolved)),
    launcher: meta.launcher || 'Manual',
    storeId: meta.storeId || null,
    libraryDir: meta.libraryDir || path.dirname(resolved),
    bannerPath: meta.bannerPath || null,
    bannerUrl: meta.bannerUrl || null,
    coverPath: meta.coverPath || null,
    coverUrl: meta.coverUrl || null,
    settings: settingsFor(meta.settings)
  };
}

async function iconFor(exePath) {
  const key = path.resolve(exePath).toLowerCase();
  if (iconCache.has(key)) return iconCache.get(key);
  try {
    const image = await app.getFileIcon(exePath, { size: 'large' });
    const value = image && !image.isEmpty() ? image.toDataURL() : null;
    iconCache.set(key, value);
    return value;
  } catch {
    iconCache.set(key, null);
    return null;
  }
}

function localArtwork(file) {
  if (!file || !fs.existsSync(file)) return null;
  const key = path.resolve(file).toLowerCase();
  if (artworkCache.has(key)) return artworkCache.get(key);
  try {
    const ext = path.extname(file).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    const value = `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
    artworkCache.set(key, value);
    return value;
  } catch {
    artworkCache.set(key, null);
    return null;
  }
}

function bannerFor(record) {
  const profile = profileFor(record.exePath);
  return localArtwork(record.bannerPath) || record.bannerUrl || profile?.bannerUrl || null;
}

function coverFor(record) {
  const profile = profileFor(record.exePath);
  return localArtwork(record.coverPath) || record.coverUrl || profile?.coverUrl || null;
}

function existingNrSetup(exePath, chosen) {
  if (!chosen) return false;
  const exeDir = path.dirname(exePath);
  const hook = chosen.api === 'vulkan' ? 'winmm.dll' : 'dxgi.dll';
  return [path.join(exeDir, hook), path.join(exeDir, 'OptiScaler.ini'), path.join(exeDir, 'nvngx.dll_dlssnr.dll')]
    .every(file => fs.existsSync(file));
}

async function inspectRecord(record) {
  const profile = profileFor(record.exePath);
  const result = await gameScan.inspect(record.exePath, profile);
  const compatible = Boolean(result.chosen && result.chosen.bitness === 64 && result.chosen.api && result.dlss);
  return {
    id: record.id,
    dir: record.dir,
    exePath: record.exePath,
    profileId: record.profileId,
    displayName: profile?.names?.[loadState().language] || record.displayName,
    launcher: record.launcher || 'Manual',
    storeId: record.storeId || null,
    settings: nrSettings.read(record.exePath, settingsFor(record.settings)),
    onlineRisk: Boolean(profile?.onlineRisk),
    chosen: result.chosen,
    dlss: result.dlss,
    compatible,
    installed: Boolean(result.installed),
    existingSetup: existingNrSetup(record.exePath, result.chosen) && !result.hasBackup,
    hasBackup: Boolean(result.hasBackup),
    optiscaler: result.optiscaler,
    runtime: runtime.detect(app, record.exePath),
    iconDataUrl: await iconFor(record.exePath),
    bannerDataUrl: bannerFor(record),
    coverDataUrl: coverFor(record)
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
        settings: nrSettings.read(record.exePath, settingsFor(record.settings)),
        scanError: error.message || String(error),
        chosen: null,
        dlss: null,
        compatible: false,
        installed: false,
        existingSetup: false,
        hasBackup: fileState.hasBackup(record.dir),
        runtime: runtime.detect(app, record.exePath),
        iconDataUrl: await iconFor(record.exePath),
        bannerDataUrl: bannerFor(record),
        coverDataUrl: coverFor(record)
      });
    }
  }
  if (!state.selectedGameId && games[0]) {
    state.selectedGameId = games[0].id;
    saveState();
  }
  return { language: state.language, selectedGameId: state.selectedGameId, games };
}

async function discoverAndMerge() {
  const found = await discovery.discoverGames();
  const state = loadState();
  let added = 0;
  for (const game of found) {
    const candidate = normalizeRecord(game.exePath, game);
    const existing = state.games.find(record => path.resolve(record.exePath).toLowerCase() === path.resolve(candidate.exePath).toLowerCase());
    if (existing) {
      existing.displayName = game.displayName || existing.displayName;
      existing.launcher = game.launcher || existing.launcher;
      existing.storeId = game.storeId || existing.storeId;
      existing.libraryDir = game.libraryDir || existing.libraryDir;
      existing.bannerPath = game.bannerPath || existing.bannerPath;
      existing.bannerUrl = game.bannerUrl || existing.bannerUrl;
      existing.coverPath = game.coverPath || existing.coverPath;
      existing.coverUrl = game.coverUrl || existing.coverUrl;
      continue;
    }
    state.games.push(candidate);
    added += 1;
  }
  if (!state.selectedGameId && state.games[0]) state.selectedGameId = state.games[0].id;
  saveState();
  return { added, state: await viewState() };
}

async function ensureAutoDiscovery() {
  if (!discoveryPromise) discoveryPromise = discoverAndMerge().catch(() => ({ added: 0 }));
  await discoveryPromise;
}

function recordFor(id) {
  return loadState().games.find(game => game.id === id) || null;
}

function safeResult(work) {
  return Promise.resolve().then(work).then(value => ({ ok: true, value }))
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
    detail: zh ? '仅在你理解风险并愿意继续时安装。' : 'Install only if you understand the risk and want to continue.',
    buttons: zh ? ['取消', '继续'] : ['Cancel', 'Continue'],
    defaultId: 0,
    cancelId: 0,
    noLink: true
  });
  return result.response === 1;
}

async function confirmExistingMigration() {
  const zh = loadState().language === 'zh-CN';
  const result = await dialog.showMessageBox(win, {
    type: 'warning',
    title: zh ? '检测到现有 OptiScaler 安装' : 'Existing OptiScaler setup detected',
    message: zh
      ? '可以把现有安装迁移到本应用的 DLSS 5 后端。将被替换的文件会先备份，可通过“恢复原文件”还原。'
      : 'The existing setup can be migrated to this app’s DLSS 5 backend. Files that are replaced will be backed up first and can be restored with Restore original.',
    detail: zh
      ? '这不会绕过或关闭任何反作弊功能。请先退出游戏再继续。'
      : 'This does not bypass or disable anti-cheat. Close the game before continuing.',
    buttons: zh ? ['取消', '迁移并安装'] : ['Cancel', 'Migrate and install'],
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

ipcMain.handle('app:get-state', () => safeResult(async () => {
  await ensureAutoDiscovery();
  return viewState();
}));
ipcMain.handle('app:set-language', (_event, language) => safeResult(async () => {
  if (!['en', 'zh-CN'].includes(language)) throw new Error('Unsupported language');
  loadState().language = language;
  saveState();
  return viewState();
}));
ipcMain.handle('games:rescan', () => safeResult(async () => {
  discoveryPromise = discoverAndMerge();
  return discoveryPromise;
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
  if (existing >= 0) state.games[existing] = { ...state.games[existing], ...record, settings: settingsFor(state.games[existing].settings) };
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
ipcMain.handle('game:launch', (_event, id) => safeResult(async () => {
  const record = recordFor(id);
  if (!record) throw new Error('Unknown game');
  if (record.launcher === 'Steam' && record.storeId) {
    await shell.openExternal(`steam://rungameid/${encodeURIComponent(String(record.storeId))}`);
    return true;
  }
  const result = await shell.openPath(record.exePath);
  if (result) throw new Error(result);
  return true;
}));
ipcMain.handle('game:set-settings', (_event, id, settings) => safeResult(async () => {
  const record = recordFor(id);
  if (!record) throw new Error('Unknown game');
  const next = nrSettings.read(record.exePath, settingsFor(record.settings));
  if (Object.prototype.hasOwnProperty.call(settings || {}, 'enabled')) next.enabled = Boolean(settings.enabled);
  if (Object.prototype.hasOwnProperty.call(settings || {}, 'runBeforeSR')) next.runBeforeSR = Boolean(settings.runBeforeSR);
  if (Object.prototype.hasOwnProperty.call(settings || {}, 'passes')) {
    const passes = Number(settings.passes);
    if (!Number.isInteger(passes) || passes < 1 || passes > 3) throw new Error('Passes must be 1, 2, or 3');
    next.passes = passes;
  }
  for (const key of ['pass1Style', 'pass2Style', 'pass3Style']) {
    if (!Object.prototype.hasOwnProperty.call(settings || {}, key)) continue;
    const value = String(settings[key]).toLowerCase();
    if (!STYLE_VALUES.has(value)) throw new Error('Style must be Default, Standard, Natural, or Cinematic');
    next[key] = value;
  }
  record.settings = next;
  saveState();
  nrSettings.apply(record.exePath, next);
  return viewState();
}));
ipcMain.handle('runtime:import', (_event, id) => safeResult(async () => {
  const record = recordFor(id);
  if (!record) throw new Error('Unknown game');
  await runtime.pickAndCache(app, dialog, record.exePath, loadState().language);
  return viewState();
}));
ipcMain.handle('game:install', (_event, id) => safeResult(async () => {
  const record = recordFor(id);
  if (!record) throw new Error('Unknown game');
  if (!(await confirmOnlineRisk(record))) return { cancelled: true, state: await viewState() };
  const inspected = await inspectRecord(record);
  if (!inspected.chosen) throw Object.assign(new Error('No supported game executable was detected.'), { code: 'noExecutable' });
  if (inspected.chosen.bitness !== 64) throw Object.assign(new Error('This Neural Rendering route requires a 64-bit game.'), { code: 'unsupportedArchitecture' });
  if (!inspected.chosen.api) throw Object.assign(new Error('The rendering API could not be detected.'), { code: 'noRenderingApi' });
  if (!inspected.dlss) throw Object.assign(new Error('Native DLSS was not detected for this game.'), { code: 'noDlss' });
  if (inspected.hasBackup) throw Object.assign(new Error('This game already has a managed installation. Restore originals before reinstalling.'), { code: 'alreadyInstalled' });

  let replaceExisting = false;
  if (inspected.existingSetup) {
    replaceExisting = await confirmExistingMigration();
    if (!replaceExisting) return { cancelled: true, state: await viewState() };
  }

  const runtimePath = await runtime.resolve(app, dialog, record.exePath, loadState().language);
  const packageRoot = await optiscaler.ensurePackage(app.getPath('userData'));
  const logs = [];
  await optiscaler.install({
    gameDir: record.dir,
    exePath: record.exePath,
    api: inspected.chosen.api,
    apiLabel: inspected.chosen.apiLabel,
    packageRoot,
    runtimePath,
    settings: settingsFor(record.settings),
    replaceExisting
  }, entry => logs.push(entry));
  nrSettings.apply(record.exePath, settingsFor(record.settings));
  nrSettings.applyOverlay(record.exePath, nrSettings.readOverlayPrefs(app.getPath('userData')));
  return { logs, migrated: replaceExisting, state: await viewState() };
}));
ipcMain.handle('game:restore', (_event, id) => safeResult(async () => {
  const record = recordFor(id);
  if (!record) throw new Error('Unknown game');
  const logs = [];
  await fileState.restore(record.dir, entry => logs.push(entry));
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
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
