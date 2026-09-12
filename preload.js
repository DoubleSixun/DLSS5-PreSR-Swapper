'use strict';
const { contextBridge, ipcRenderer, webUtils } = require('electron');

// Keep the main-process state pinned to compact version identifiers while the
// UI can describe what each build actually does. This lets the existing game
// sheet keep its simple <select> contract without leaking implementation names
// like "0.7.7-presr" to people who only care about quality vs performance.
const OPTI_BUILD_LABELS = Object.freeze({
  '0.7.7-presr': 'Performance · Pre-SR · NR → SR · v0.7.7',
  '0.2.0-patch1': 'Quality · Post-SR · SR → NR · v0.2.0',
  '0.1.1.5-dlssnr': 'Legacy compatibility · Post-SR · v0.1.1.5'
});
const displayOptiBuild = (version) => OPTI_BUILD_LABELS[version] || version;
const rawOptiBuild = (value) => Object.entries(OPTI_BUILD_LABELS).find(([, label]) => label === value)?.[0] || value;

async function optiscalerBuilds(dir) {
  const result = await ipcRenderer.invoke('optiscaler-builds', dir);
  return {
    ...result,
    builds: (result.builds || []).map(displayOptiBuild),
    current: displayOptiBuild(result.current)
  };
}

// A small visual treatment turns the old "OptiScaler build" picker into a
// rendering-mode control. It is intentionally implemented in preload so the
// renderer's existing install flow, route selection and test surface stay
// untouched. The sheet is re-created whenever a game is opened, so a Mutation
// Observer decorates each fresh control.
function installPreSrUi() {
  const style = document.createElement('style');
  style.id = 'presr-ui-style';
  style.textContent = `
    .presr-mode-control select { font-weight: 650; }
    .presr-mode-card {
      grid-column: 1 / -1;
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 10px 12px;
      align-items: start;
      margin-top: -2px;
      padding: 12px 14px;
      border: 1px solid color-mix(in srgb, var(--line) 78%, transparent);
      border-radius: 14px;
      background: color-mix(in srgb, var(--panel) 82%, transparent);
      color: var(--dim);
      font-size: 12px;
      line-height: 1.45;
    }
    .presr-mode-card::before {
      content: 'NR';
      display: inline-grid;
      place-items: center;
      min-width: 34px;
      height: 24px;
      padding: 0 7px;
      border-radius: 999px;
      border: 1px solid var(--line);
      color: var(--text);
      font-weight: 800;
      letter-spacing: .04em;
    }
    .presr-mode-card b { color: var(--text); font-size: 12px; }
    .presr-mode-card.presr-active {
      border-color: color-mix(in srgb, var(--accent) 38%, var(--line));
      background: color-mix(in srgb, var(--accent) 8%, var(--panel));
    }
    .presr-mode-flow {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-top: 3px;
      color: var(--text);
      font-weight: 650;
    }
  `;
  document.head.appendChild(style);

  const decorate = () => {
    const select = document.getElementById('optiBuild');
    if (!select) return;
    const zh = String(document.documentElement.lang || '').toLowerCase().startsWith('zh');
    const label = select.closest('label');
    if (!label) return;

    if (!select.dataset.presrDecorated) {
      select.dataset.presrDecorated = '1';
      label.classList.add('presr-mode-control');
      const card = document.createElement('div');
      card.className = 'presr-mode-card';
      card.dataset.presrCard = '1';
      label.parentElement?.appendChild(card);
      select.addEventListener('change', () => queueMicrotask(decorate));
    }

    const title = label.querySelector('span');
    const wantedTitle = zh ? '神经渲染模式' : 'Neural Rendering mode';
    if (title && title.textContent !== wantedTitle) title.textContent = wantedTitle;

    const card = label.parentElement?.querySelector('[data-presr-card="1"]');
    if (!card) return;
    const pre = /Pre-SR|presr/i.test(select.value || select.options[select.selectedIndex]?.text || '');
    const mode = pre ? 'presr' : 'postsr';
    card.classList.toggle('presr-active', pre);
    if (card.dataset.mode === mode && card.dataset.lang === (zh ? 'zh' : 'en')) return;
    card.dataset.mode = mode;
    card.dataset.lang = zh ? 'zh' : 'en';
    if (zh) {
      card.innerHTML = pre
        ? '<div><b>性能模式 · Pre-SR</b><div>DLSS 5 在游戏内部渲染分辨率运行，再交给 DLSS 超分到最终分辨率。</div><div class="presr-mode-flow">NR → Super Resolution → Output</div></div>'
        : '<div><b>画质模式 · Post-SR</b><div>先由 DLSS 超分到最终分辨率，再运行 DLSS 5；GPU 开销通常更高。</div><div class="presr-mode-flow">Super Resolution → NR → Output</div></div>';
    } else {
      card.innerHTML = pre
        ? '<div><b>Performance mode · Pre-SR</b><div>DLSS 5 runs at the game render resolution, then DLSS Super Resolution produces the final output.</div><div class="presr-mode-flow">NR → Super Resolution → Output</div></div>'
        : '<div><b>Quality mode · Post-SR</b><div>DLSS Super Resolution runs first, then DLSS 5 works on the final-resolution image. GPU cost is usually higher.</div><div class="presr-mode-flow">Super Resolution → NR → Output</div></div>';
    }
  };

  const observer = new MutationObserver(decorate);
  observer.observe(document.body, { childList: true, subtree: true });
  new MutationObserver(decorate).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  decorate();
}

window.addEventListener('DOMContentLoaded', installPreSrUi, { once: true });

contextBridge.exposeInMainWorld('lab', {
  // ---- in-game overlay ----
  overlays: () => ipcRenderer.invoke('overlay-list'),
  overlayPreferences: () => ipcRenderer.invoke('overlay-preferences'),
  saveOverlayPreferences: (patch) => ipcRenderer.invoke('overlay-save-preferences', patch),
  overlayAdd: () => ipcRenderer.invoke('overlay-add'),
  overlayRemove: (id) => ipcRenderer.invoke('overlay-remove', id),
  overlayInstall: (id) => ipcRenderer.invoke('overlay-install', id),
  overlayUninstall: (id) => ipcRenderer.invoke('overlay-uninstall', id),
  overlaySource: () => ipcRenderer.invoke('overlay-source'),
  overlayBridge: () => ipcRenderer.invoke('overlay-bridge'),
  checkUpdate: () => ipcRenderer.invoke('update-check'),
  unhide: (dir) => ipcRenderer.invoke('unhide', dir),
  boot: () => ipcRenderer.invoke('boot'),
  setLang: (lang) => ipcRenderer.invoke('set-lang', lang),
  setTheme: (theme) => ipcRenderer.invoke('set-theme', theme),
  window: (action) => ipcRenderer.invoke('window', action),
  library: () => ipcRenderer.invoke('library'),
  scan: (dir) => ipcRenderer.invoke('scan', dir),
  history: () => ipcRenderer.invoke('history'),
  copyText: (text) => ipcRenderer.invoke('copy-text', text),
  saveDiagnostics: (dir, activity) => ipcRenderer.invoke('save-diagnostics', dir, activity),
  gameMenu: (dir, options) => ipcRenderer.invoke('game-menu', dir, options),
  communityProfile: () => ipcRenderer.invoke('community-profile'),
  communitySaveProfile: (profile) => ipcRenderer.invoke('community-profile-save', profile),
  communityAdminLogout: () => ipcRenderer.invoke('community-admin-logout'),
  communityDeleteMe: () => ipcRenderer.invoke('community-delete-me'),
  communityCards: (filters) => ipcRenderer.invoke('community-cards', filters),
  communityMyReports: () => ipcRenderer.invoke('community-my-reports'),
  communityCard: (key, etag, fresh) => ipcRenderer.invoke('community-card', key, etag, fresh),
  communityUpdates: (key, since, etag) => ipcRenderer.invoke('community-updates', key, since, etag),
  communityPrefill: (dir) => ipcRenderer.invoke('community-prefill', dir),
  communityReport: (report) => ipcRenderer.invoke('community-report', report),
  communityWithdraw: (id) => ipcRenderer.invoke('community-withdraw', id),
  communityWithdrawReply: (id) => ipcRenderer.invoke('community-withdraw-reply', id),
  communityReaction: (id, emoji, on) => ipcRenderer.invoke('community-reaction', id, emoji, on),
  communityAdminModerate: (kind, id, action) => ipcRenderer.invoke('community-admin-moderate', kind, id, action),
  communityChatFeed: (options) => ipcRenderer.invoke('community-chat-feed', options),
  communityChatPeople: () => ipcRenderer.invoke('community-chat-people'),
  communityChatMe: () => ipcRenderer.invoke('community-chat-me'),
  communityChatUpload: (meta, bytes) => ipcRenderer.invoke('community-chat-upload', meta, bytes),
  communityChatPost: (input) => ipcRenderer.invoke('community-chat-post', input),
  communityChatEdit: (id, body) => ipcRenderer.invoke('community-chat-edit', id, body),
  communityChatDelete: (id) => ipcRenderer.invoke('community-chat-delete', id),
  communityChatReaction: (id, emoji, on) => ipcRenderer.invoke('community-chat-reaction', id, emoji, on),
  communityChatModerate: (id, action) => ipcRenderer.invoke('community-chat-moderate', id, action),
  communityChatSaveImage: (url, name) => ipcRenderer.invoke('community-chat-save-image', url, name),
  settings: () => ipcRenderer.invoke('settings'),
  setGroupGamesByStore: (enabled) => ipcRenderer.invoke('set-group-games-by-store', enabled),
  setCloseToTray: (enabled) => ipcRenderer.invoke('set-close-to-tray', enabled),
  driverNeuralFault: () => ipcRenderer.invoke('driver-neural-fault'),
  optiscalerBuilds,
  setOptiscalerBuild: (dir, version) => ipcRenderer.invoke('set-optiscaler-build', dir, rawOptiBuild(version)),
  acknowledgeDriver: (names) => ipcRenderer.invoke('acknowledge-driver', names),
  setTrayLabels: (labels) => ipcRenderer.invoke('set-tray-labels', labels),
  setAutoScanDrives: (enabled) => ipcRenderer.invoke('set-auto-scan-drives', enabled),
  addFolder: () => ipcRenderer.invoke('add-folder'),
  removeFolder: (dir) => ipcRenderer.invoke('remove-folder', dir),
  excludeRoot: (dir) => ipcRenderer.invoke('exclude-root', dir),
  addGame: () => ipcRenderer.invoke('add-game'),
  addGameByPath: (dir) => ipcRenderer.invoke('add-game-path', dir),
  setPoster: (dir) => ipcRenderer.invoke('set-poster', dir),
  hide: (dir) => ipcRenderer.invoke('hide', dir),
  reset: () => ipcRenderer.invoke('reset'),
  open: (dir) => ipcRenderer.invoke('open', dir),
  openProject: (destination) => ipcRenderer.invoke('open-project', destination),
  setApiOverride: (dir, exePath, value) => ipcRenderer.invoke('set-api-override', dir, exePath, value),
  artStatus: () => ipcRenderer.invoke('art-status'),
  artFetch: (dir, name, appid) => ipcRenderer.invoke('art-fetch', dir, name, appid),
  communityArt: (key, title) => ipcRenderer.invoke('community-art', key, title),
  // The renderer reuses pixels from the image it has already displayed. Only
  // a 12×12 RGBA thumbnail crosses this boundary; there is no second download.
  communityPalette: (pixels) => ipcRenderer.invoke('community-palette', pixels),
  communityMergePalettes: (palettes) => ipcRenderer.invoke('community-palette-merge', palettes),
  communityReplies: (id, fresh) => ipcRenderer.invoke('community-replies', id, fresh),
  communityReply: (id, body, mentions) => ipcRenderer.invoke('community-reply', id, body, mentions),
  communityEditReply: (id, body) => ipcRenderer.invoke('community-edit-reply', id, body),
  communityFollow: (key, on) => ipcRenderer.invoke('community-follow', key, on),
  communityNotices: () => ipcRenderer.invoke('community-notices'),
  communityNotify: (items) => ipcRenderer.invoke('community-notify', items),
  communityNoticesRead: () => ipcRenderer.invoke('community-notices-read'),
  communityNoticeSettings: (on) => ipcRenderer.invoke('community-notice-settings', on),
  onCommunityNotices: (fn) => ipcRenderer.on('community-notices', (_e, list) => fn(list)),
  onCommunityOpen: (fn) => ipcRenderer.on('community-open', (_e, notice) => fn(notice)),
  touch: (dir) => ipcRenderer.invoke('touch', dir),
  recents: () => ipcRenderer.invoke('recents'),
  details: (dir) => ipcRenderer.invoke('details', dir),
  install: (dir, exePath, route, api) => ipcRenderer.invoke('install', dir, exePath, route, api),
  addons: () => ipcRenderer.invoke('addons'),
  addonToggle: (file, on) => ipcRenderer.invoke('addon-toggle', file, on),
  addonPick: () => ipcRenderer.invoke('addon-pick'),
  addonSave: (entry) => ipcRenderer.invoke('addon-save', entry),
  addonRemove: (file) => ipcRenderer.invoke('addon-remove', file),
  restoreGame: (dir) => ipcRenderer.invoke('restore', dir),
  onJob: (handler) => ipcRenderer.on('job', (_e, event) => handler(event)),
  pathForFile: (file) => { try { return webUtils.getPathForFile(file); } catch { return null; } }
});
