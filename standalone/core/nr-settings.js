'use strict';

const fs = require('fs');
const path = require('path');
const ini = require('./ini');

const STYLE_VALUES = new Set(['auto', '0', '1', '2']);

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
  return true;
}

module.exports = { configFile, read, apply, boolValue, styleValue };
