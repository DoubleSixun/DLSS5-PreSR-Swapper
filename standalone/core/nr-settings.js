'use strict';

const fs = require('fs');
const path = require('path');
const ini = require('./ini');

const STYLE_VALUES = new Set(['auto', '0', '1', '2']);
const OVERLAY_KEYS = Object.freeze({
  insert: 0x2d,
  f8: 0x77,
  f9: 0x78,
  f10: 0x79,
  home: 0x24
});
const DEFAULT_OVERLAY = Object.freeze({
  enabled: true,
  hotkey: OVERLAY_KEYS.insert,
  scale: 1,
  opacity: 0.82,
  position: 1
});

function configFile(exePath) {
  return path.join(path.dirname(path.resolve(exePath)), 'OptiScaler.ini');
}

function boolValue(raw, fallback) {
  if (raw === null || raw === undefined || String(raw).trim() === '') return fallback;
  const value = String(raw).trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(value)) return true;
  if (['false', '0', 'no', 'off'].includes(value)) return false;
  return fallback;
}

function styleValue(raw, fallback = 'auto') {
  const value = String(raw ?? fallback).trim().toLowerCase();
  return STYLE_VALUES.has(value) ? value : fallback;
}

function normalizeOverlay(value = {}) {
  const hotkey = Number(value.hotkey);
  const scale = Number(value.scale);
  const opacity = Number(value.opacity);
  const position = Number(value.position);
  return {
    enabled: value.enabled !== false,
    hotkey: Object.values(OVERLAY_KEYS).includes(hotkey) ? hotkey : DEFAULT_OVERLAY.hotkey,
    scale: Number.isFinite(scale) ? Math.min(1.5, Math.max(0.75, scale)) : DEFAULT_OVERLAY.scale,
    opacity: Number.isFinite(opacity) ? Math.min(0.95, Math.max(0.5, opacity)) : DEFAULT_OVERLAY.opacity,
    position: Number.isInteger(position) && position >= 0 && position <= 3 ? position : DEFAULT_OVERLAY.position
  };
}

function overlayPrefsFile(userData) {
  return path.join(userData, 'overlay-preferences.json');
}

function readOverlayPrefs(userData) {
  try {
    const parsed = JSON.parse(fs.readFileSync(overlayPrefsFile(userData), 'utf8'));
    return normalizeOverlay(parsed);
  } catch {
    return { ...DEFAULT_OVERLAY };
  }
}

function writeOverlayPrefs(userData, value) {
  const next = normalizeOverlay(value);
  fs.mkdirSync(userData, { recursive: true });
  const file = overlayPrefsFile(userData);
  const temp = file + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(next, null, 2), 'utf8');
  fs.renameSync(temp, file);
  return next;
}

function read(exePath, fallback = {}) {
  const base = {
    enabled: fallback.enabled !== false,
    runBeforeSR: fallback.runBeforeSR !== false,
    passes: Number.isInteger(Number(fallback.passes)) ? Number(fallback.passes) : 1,
    pass1Style: styleValue(fallback.pass1Style),
    pass2Style: styleValue(fallback.pass2Style),
    pass3Style: styleValue(fallback.pass3Style)
  };
  const file = configFile(exePath);
  if (!fs.existsSync(file)) return base;

  const text = ini.read(file) || '';
  const parsedPasses = Number(ini.get(text, 'DlssNr', 'Passes'));
  return {
    enabled: boolValue(ini.get(text, 'DlssNr', 'Enabled'), base.enabled),
    runBeforeSR: boolValue(ini.get(text, 'DlssNr', 'RunBeforeSR'), base.runBeforeSR),
    passes: Number.isInteger(parsedPasses) && parsedPasses >= 1 && parsedPasses <= 3 ? parsedPasses : base.passes,
    pass1Style: styleValue(ini.get(text, 'DlssNr', 'Style'), base.pass1Style),
    pass2Style: styleValue(ini.get(text, 'DlssNr', 'Pass2Style'), base.pass2Style),
    pass3Style: styleValue(ini.get(text, 'DlssNr', 'Pass3Style'), base.pass3Style)
  };
}

function applyOverlay(exePath, preferences = DEFAULT_OVERLAY) {
  const file = configFile(exePath);
  if (!fs.existsSync(file)) return false;
  const overlay = normalizeOverlay(preferences);
  let text = ini.read(file) || '';
  const values = [
    ['ShortcutKey', overlay.enabled ? String(overlay.hotkey) : '-1'],
    ['Scale', overlay.scale.toFixed(2)],
    ['FpsOverlayAlpha', overlay.opacity.toFixed(2)],
    ['FpsOverlayPos', String(overlay.position)],
    ['DisableSplash', 'true'],
    ['OverlayMenu', 'true']
  ];
  for (const [key, value] of values) text = ini.set(text, 'Menu', key, value);
  fs.writeFileSync(file, text, 'utf8');
  return true;
}

function apply(exePath, settings = {}) {
  const file = configFile(exePath);
  if (!fs.existsSync(file)) return false;
  const passes = Number(settings.passes || 1);
  if (!Number.isInteger(passes) || passes < 1 || passes > 3) throw new Error('Passes must be 1, 2, or 3');

  let text = ini.read(file) || '';
  const values = [
    ['Enabled', settings.enabled === false ? 'false' : 'true'],
    ['RunBeforeSR', settings.runBeforeSR === false ? 'false' : 'true'],
    ['Passes', String(passes)],
    ['Style', styleValue(settings.pass1Style)],
    ['Pass2Style', styleValue(settings.pass2Style)],
    ['Pass3Style', styleValue(settings.pass3Style)]
  ];
  for (const [key, value] of values) text = ini.set(text, 'DlssNr', key, value);
  fs.writeFileSync(file, text, 'utf8');

  // The Electron app stores overlay preferences separately so they remain global.
  // Apply them whenever NR settings are written, including immediately after a fresh install.
  try {
    const electron = require('electron');
    if (electron?.app?.getPath) applyOverlay(exePath, readOverlayPrefs(electron.app.getPath('userData')));
  } catch {}
  return true;
}

function applyOverlayToLibrary(userData, preferences) {
  const library = path.join(userData, 'standalone-library.json');
  let games = [];
  try { games = JSON.parse(fs.readFileSync(library, 'utf8'))?.games || []; } catch {}
  let updated = 0;
  for (const game of games) {
    try { if (applyOverlay(game.exePath, preferences)) updated += 1; } catch {}
  }
  return updated;
}

// Register the tiny global-preferences IPC here because this module is already loaded by
// standalone/main.js. Guard it so node-only unit tests can require this file safely.
try {
  const electron = require('electron');
  if (electron?.ipcMain?.handle && electron?.app?.getPath) {
    electron.ipcMain.handle('app:get-overlay-preferences', () => ({
      ok: true,
      value: readOverlayPrefs(electron.app.getPath('userData'))
    }));
    electron.ipcMain.handle('app:set-overlay-preferences', (_event, value) => {
      try {
        const userData = electron.app.getPath('userData');
        const next = writeOverlayPrefs(userData, value);
        const updated = applyOverlayToLibrary(userData, next);
        return { ok: true, value: { ...next, updated } };
      } catch (error) {
        return { ok: false, code: error.code || 'overlayPreferencesError', message: error.message || String(error) };
      }
    });
  }
} catch {}

module.exports = {
  configFile,
  read,
  apply,
  boolValue,
  styleValue,
  DEFAULT_OVERLAY,
  OVERLAY_KEYS,
  normalizeOverlay,
  readOverlayPrefs,
  writeOverlayPrefs,
  applyOverlay,
  applyOverlayToLibrary
};
