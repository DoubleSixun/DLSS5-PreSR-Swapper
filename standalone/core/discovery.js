'use strict';

const fs = require('fs');
const path = require('path');
const library = require('./derived/library');
const gameScan = require('./game-scan');

const NOT_A_GAME_EXE = /^(unins|setup|install|vcredist|vc_redist|dxsetup|dxwebsetup|oalinst|uninstall|crashreport|crashhandler|easyanticheat|eac|battleye|be_service|launcher|activation|patch|update|dotnetfx|touchup|helper|service|cleanup|benchmark)/i;

function firstExisting(files) {
  return files.find(file => {
    try { return fs.statSync(file).isFile(); } catch { return false; }
  }) || null;
}

function steamBanner(entry) {
  if (entry.launcher !== 'Steam' || !entry.steamRoot || !entry.id) return null;
  const root = path.join(entry.steamRoot, 'appcache', 'librarycache');
  const appDir = path.join(root, String(entry.id));
  const preferredNames = ['library_hero.jpg', 'library_header.jpg', 'header.jpg', 'library_capsule.jpg', 'library_hero_blur.jpg'];

  // Steam currently keeps artwork in several layouts at the same time. Prefer
  // a wide hero/header, but support the newer appid/content-hash directories
  // as well as the older flat cache names.
  const direct = firstExisting(preferredNames.map(name => path.join(appDir, name)));
  if (direct) return direct;

  try {
    for (const entryDir of fs.readdirSync(appDir, { withFileTypes: true })) {
      if (!entryDir.isDirectory()) continue;
      const nested = firstExisting(preferredNames.map(name => path.join(appDir, entryDir.name, name)));
      if (nested) return nested;
    }
  } catch {}

  return firstExisting([
    path.join(root, `${entry.id}_library_hero.jpg`),
    path.join(root, `${entry.id}_header.jpg`),
    path.join(root, `${entry.id}_library_header.jpg`),
    path.join(root, `${entry.id}_library_capsule.jpg`)
  ]);
}

function steamBannerUrl(entry) {
  if (entry.launcher !== 'Steam' || !entry.id) return null;
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${encodeURIComponent(String(entry.id))}/header.jpg`;
}

function pathDistance(a, b) {
  const aa = path.resolve(a).toLowerCase().split(path.sep).filter(Boolean);
  const bb = path.resolve(b).toLowerCase().split(path.sep).filter(Boolean);
  let common = 0;
  while (common < aa.length && common < bb.length && aa[common] === bb[common]) common += 1;
  return (aa.length - common) + (bb.length - common);
}

async function candidateFor(entry) {
  const exes = [];
  const dlss = [];
  await gameScan.walkFiles(entry.dir, async (full, name, depth) => {
    if (/^nvngx_dlss\.dll$/i.test(name)) dlss.push(full);
    if (!/\.exe$/i.test(name) || NOT_A_GAME_EXE.test(name)) return;
    exes.push({ path: full, name, depth });
  }, 8);

  if (!dlss.length || !exes.length) return null;

  const yysls = exes.find(item => /^yysls\.exe$/i.test(item.name));
  if (yysls) return yysls.path;

  const inspected = [];
  for (const item of exes.slice(0, 120)) {
    let info = null;
    try { info = gameScan.inspectExecutable(item.path); } catch {}
    if (!info || info.bitness !== 64 || !info.api) continue;
    const nearest = Math.min(...dlss.map(file => pathDistance(path.dirname(item.path), path.dirname(file))));
    const name = path.basename(item.path, '.exe').toLowerCase();
    const folder = path.basename(entry.dir).toLowerCase();
    let score = nearest * 20 + item.depth * 2;
    if (name === folder || folder.includes(name) || name.includes(folder)) score -= 8;
    inspected.push({ path: item.path, score });
  }
  inspected.sort((a, b) => a.score - b.score || a.path.length - b.path.length);
  return inspected[0]?.path || null;
}

async function inspectEntry(entry) {
  const exePath = await candidateFor(entry);
  if (!exePath) return null;
  return {
    exePath,
    displayName: entry.name || path.basename(exePath, path.extname(exePath)),
    launcher: entry.launcher || 'Detected',
    storeId: entry.id || null,
    libraryDir: entry.dir,
    bannerPath: steamBanner(entry) || (entry.poster && entry.poster.tall === false ? entry.poster.file : null),
    bannerUrl: steamBannerUrl(entry)
  };
}

async function discoverGames() {
  const result = library.discover([], false);
  const entries = result.games || [];
  const found = [];
  const batchSize = 4;
  for (let index = 0; index < entries.length; index += batchSize) {
    const batch = await Promise.all(entries.slice(index, index + batchSize).map(inspectEntry));
    found.push(...batch.filter(Boolean));
  }
  const seen = new Set();
  return found.filter(item => {
    const key = path.resolve(item.exePath).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

module.exports = { discoverGames, candidateFor, inspectEntry, steamBanner, steamBannerUrl, pathDistance };
