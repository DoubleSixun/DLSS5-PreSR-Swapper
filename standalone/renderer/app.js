'use strict';

const I18N = {
  en: {
    productSubtitle: 'Neural Rendering Manager', home: 'Home', games: 'Games', settings: 'Settings', standaloneCore: 'Standalone core',
    addFirstGameTitle: 'Add your first game', addFirstGameBody: "Choose the game's main executable. The app will detect DLSS and the rendering API.", addGame: 'Add game',
    gameDetected: 'Game detected', neuralRendering: 'DLSS Neural Rendering', nrDescription: 'Install once, then choose whether Neural Rendering runs before DLSS Super Resolution.',
    runBeforeSr: 'Run before DLSS Super Resolution', runBeforeSrBody: 'Enable Pre-SR. Leave it off to use the normal after-SR placement.', howItWorks: 'How it works',
    passes: 'Passes', runtime: 'Neural Runtime', install: 'Install Neural Rendering', importRuntime: 'Import runtime', openGameFolder: 'Open game folder', restore: 'Restore original', advanced: 'Advanced details',
    inGame: 'In game:', keepDlssOn: 'keep DLSS Super Resolution enabled. Quality / Balanced / Performance remains a game setting.',
    gamesBody: 'Games managed by this app.', settingsBody: 'Keep the interface in one language at a time.', language: 'Language', creditsTitle: 'Credits',
    creditsBody: "Game discovery, compatibility detection and file backup/restore include portions derived from DLSS5-Swapper by Rakan Alkhaldi under the MIT License. Neural Rendering backend integration targets wilsjo2's OptiScaler-DLSSNR-PreSR-Multipass.",
    ready: 'Ready', installed: 'Installed', missing: 'Missing', runtimeReady: 'Ready', preSr: 'Pre-SR enabled', afterSr: 'After-SR placement',
    preSrLine: "Neural Rendering runs before the game's DLSS upscaling.", afterSrLine: 'Neural Rendering runs after DLSS Super Resolution.',
    preSrPipeline: 'Render → Neural Rendering → DLSS Super Resolution → Output', afterSrPipeline: 'Render → DLSS Super Resolution → Neural Rendering → Output',
    preSrExplain: "Pre-SR usually lowers GPU cost because Neural Rendering works on the lower internal render resolution. Your in-game DLSS quality setting still controls Super Resolution.",
    afterSrExplain: 'With Pre-SR off, Neural Rendering runs after the game has already upscaled the frame and therefore processes a higher-resolution image.',
    backend: 'Backend', executable: 'Executable', notDetected: 'Not detected', noGames: 'No games yet.', remove: 'Remove', select: 'Open',
    installComplete: 'Neural Rendering installed successfully.', restoreComplete: 'Original files restored.', settingsSaved: 'Settings saved.', runtimeImported: 'Runtime imported.',
    whereWindsMeet: 'Where Winds Meet', scanFailed: 'Scan failed', working: 'Working…'
  },
  'zh-CN': {
    productSubtitle: '神经渲染管理器', home: '主页', games: '游戏', settings: '设置', standaloneCore: '独立核心',
    addFirstGameTitle: '添加你的第一个游戏', addFirstGameBody: '选择游戏主程序，应用会自动检测 DLSS 和渲染 API。', addGame: '添加游戏',
    gameDetected: '已检测到游戏', neuralRendering: 'DLSS 神经渲染', nrDescription: '只需安装一次，然后决定神经渲染是否在 DLSS 超分之前运行。',
    runBeforeSr: '在 DLSS 超分前运行', runBeforeSrBody: '开启即使用 Pre-SR；关闭则使用常规的超分后位置。', howItWorks: '工作原理',
    passes: '叠加层数', runtime: '神经渲染运行库', install: '安装神经渲染', importRuntime: '导入运行库', openGameFolder: '打开游戏目录', restore: '恢复原文件', advanced: '高级信息',
    inGame: '游戏内：', keepDlssOn: '保持 DLSS 超分开启；质量、平衡、性能等档位仍由游戏设置决定。',
    gamesBody: '由本应用管理的游戏。', settingsBody: '界面在同一时间只显示一种语言。', language: '语言', creditsTitle: '鸣谢',
    creditsBody: '游戏发现、兼容性检测以及文件备份/恢复的部分代码源自 Rakan Alkhaldi 的 DLSS5-Swapper，并依照 MIT License 使用。神经渲染后端集成面向 wilsjo2 的 OptiScaler-DLSSNR-PreSR-Multipass。',
    ready: '就绪', installed: '已安装', missing: '缺失', runtimeReady: '已就绪', preSr: 'Pre-SR 已开启', afterSr: '超分后运行',
    preSrLine: '神经渲染会在游戏的 DLSS 超分之前运行。', afterSrLine: '神经渲染会在 DLSS 超分之后运行。',
    preSrPipeline: '渲染 → 神经渲染 → DLSS 超分 → 输出', afterSrPipeline: '渲染 → DLSS 超分 → 神经渲染 → 输出',
    preSrExplain: 'Pre-SR 通常能降低 GPU 开销，因为神经渲染处理的是较低的内部渲染分辨率；游戏内的 DLSS 档位仍然控制超分。',
    afterSrExplain: '关闭 Pre-SR 后，神经渲染会处理已经完成 DLSS 超分的较高分辨率画面。',
    backend: '后端', executable: '主程序', notDetected: '未检测到', noGames: '还没有添加游戏。', remove: '移除', select: '打开',
    installComplete: '神经渲染安装成功。', restoreComplete: '已恢复原文件。', settingsSaved: '设置已保存。', runtimeImported: '运行库已导入。',
    whereWindsMeet: '燕云十六声', scanFailed: '扫描失败', working: '处理中…'
  }
};

let state = { language: 'en', selectedGameId: null, games: [] };
let currentPage = 'home';
let busy = false;

const $ = id => document.getElementById(id);
const t = key => (I18N[state.language] || I18N.en)[key] || key;

function gameTitle(game) {
  if (game.profileId === 'where-winds-meet') return t('whereWindsMeet');
  return game.displayName || (game.chosen?.name || 'Game').replace(/\.exe$/i, '');
}

function selectedGame() {
  return state.games.find(game => game.id === state.selectedGameId) || state.games[0] || null;
}

function unwrap(response) {
  if (!response || response.ok !== true) throw new Error(response?.message || response?.code || 'Operation failed');
  return response.value;
}

function applyLanguage() {
  document.documentElement.lang = state.language;
  document.querySelectorAll('[data-i18n]').forEach(node => {
    const key = node.dataset.i18n;
    node.textContent = t(key);
  });
  $('languageSelect').value = state.language;
}

function badge(text, good = false) {
  const node = document.createElement('span');
  node.className = 'badge' + (good ? ' good' : '');
  node.textContent = text;
  return node;
}

function techItem(label, value) {
  const node = document.createElement('div');
  node.className = 'tech-item';
  const b = document.createElement('b');
  b.textContent = label;
  const p = document.createElement('p');
  p.textContent = value || '—';
  node.append(b, p);
  return node;
}

function renderMode(game) {
  const pre = game.settings?.runBeforeSR !== false;
  $('modeBadge').textContent = pre ? t('preSr') : t('afterSr');
  $('modeText').textContent = pre ? t('preSrLine') : t('afterSrLine');
  $('pipeline').textContent = pre ? t('preSrPipeline') : t('afterSrPipeline');
  $('pipelineExplain').textContent = pre ? t('preSrExplain') : t('afterSrExplain');
  $('presrToggle').checked = pre;
  $('passesSelect').value = String(game.settings?.passes || 1);
}

function renderHome() {
  const game = selectedGame();
  $('emptyState').classList.toggle('hidden', Boolean(game));
  $('gameDetail').classList.toggle('hidden', !game);
  if (!game) {
    $('crumb').textContent = 'DLSS NR';
    return;
  }

  $('gameTitle').textContent = gameTitle(game);
  $('crumb').textContent = gameTitle(game);
  const badges = $('badges');
  badges.replaceChildren();
  if (game.chosen?.apiLabel) badges.appendChild(badge(game.chosen.apiLabel));
  if (game.chosen?.bitness) badges.appendChild(badge(`${game.chosen.bitness}-bit`));
  if (game.dlss?.version) badges.appendChild(badge(`DLSS ${game.dlss.version}`));
  badges.appendChild(badge(game.installed ? t('installed') : t('ready'), true));

  $('installState').textContent = game.installed ? t('installed') : t('ready');
  renderMode(game);

  $('runtimeStatus').textContent = game.runtime
    ? `${t('runtimeReady')}${game.runtime.version ? ` · ${game.runtime.version}` : ''}`
    : t('missing');

  $('installBtn').textContent = game.installed ? t('installed') : t('install');
  $('installBtn').disabled = busy || game.installed || !game.chosen || !game.dlss;
  $('restoreBtn').disabled = busy || !game.hasBackup;
  $('runtimeBtn').disabled = busy;
  $('passesSelect').disabled = busy;
  $('presrToggle').disabled = busy;

  const statusBits = [];
  if (!game.chosen) statusBits.push(t('notDetected'));
  if (game.scanError) statusBits.push(t('scanFailed'));
  $('inlineStatus').textContent = busy ? t('working') : statusBits.join(' · ');

  const tech = $('techGrid');
  tech.replaceChildren(
    techItem(t('backend'), game.optiscaler?.version || 'OptiScaler DLSS-NR 0.7.7-preSR'),
    techItem(t('runtime'), game.runtime?.path || t('missing')),
    techItem(t('executable'), game.exePath)
  );
}

function renderGames() {
  const list = $('gameList');
  list.replaceChildren();
  if (!state.games.length) {
    const empty = document.createElement('div');
    empty.className = 'game-row';
    empty.textContent = t('noGames');
    list.appendChild(empty);
    return;
  }

  for (const game of state.games) {
    const row = document.createElement('div');
    row.className = 'game-row' + (game.id === state.selectedGameId ? ' active' : '');
    const avatar = document.createElement('div');
    avatar.className = 'game-avatar';
    avatar.textContent = gameTitle(game).slice(0, 1).toUpperCase();
    const meta = document.createElement('div');
    meta.className = 'game-meta';
    const name = document.createElement('b');
    name.textContent = gameTitle(game);
    const details = document.createElement('p');
    const bits = [game.chosen?.apiLabel, game.chosen?.bitness ? `${game.chosen.bitness}-bit` : null, game.dlss?.version ? `DLSS ${game.dlss.version}` : null].filter(Boolean);
    details.textContent = bits.join(' · ') || t('notDetected');
    meta.append(name, details);
    const actions = document.createElement('div');
    actions.className = 'row-actions';
    const remove = document.createElement('button');
    remove.textContent = t('remove');
    remove.addEventListener('click', async event => {
      event.stopPropagation();
      await act(async () => { state = unwrap(await window.nrApp.removeGame(game.id)); });
    });
    actions.appendChild(remove);
    row.append(avatar, meta, actions);
    row.addEventListener('click', async () => {
      await act(async () => {
        state = unwrap(await window.nrApp.selectGame(game.id));
        showPage('home');
      }, false);
    });
    list.appendChild(row);
  }
}

function render() {
  applyLanguage();
  renderHome();
  renderGames();
  document.querySelectorAll('.page').forEach(page => page.classList.toggle('active', page.id === `page-${currentPage}`));
  document.querySelectorAll('.nav-item').forEach(btn => btn.classList.toggle('active', btn.dataset.page === currentPage));
}

function showPage(page) {
  currentPage = page;
  render();
}

let toastTimer = null;
function toast(message) {
  const node = $('toast');
  node.textContent = message;
  node.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('show'), 2600);
}

async function act(work, lock = true) {
  if (lock && busy) return;
  if (lock) busy = true;
  render();
  try { await work(); }
  catch (error) { toast(error.message || String(error)); }
  finally {
    if (lock) busy = false;
    render();
  }
}

async function refresh() {
  state = unwrap(await window.nrApp.getState());
  render();
}

document.querySelectorAll('.nav-item').forEach(btn => btn.addEventListener('click', () => showPage(btn.dataset.page)));
$('minBtn').addEventListener('click', () => window.nrApp.minimize());
$('maxBtn').addEventListener('click', () => window.nrApp.maximize());
$('closeBtn').addEventListener('click', () => window.nrApp.close());

async function addGame() {
  await act(async () => { state = unwrap(await window.nrApp.addGame()); showPage('home'); });
}
$('emptyAddBtn').addEventListener('click', addGame);
$('addGameBtn').addEventListener('click', addGame);

$('languageSelect').addEventListener('change', async event => {
  await act(async () => { state = unwrap(await window.nrApp.setLanguage(event.target.value)); }, false);
});

$('presrToggle').addEventListener('change', async event => {
  const game = selectedGame();
  if (!game) return;
  await act(async () => {
    state = unwrap(await window.nrApp.setGameSettings(game.id, { runBeforeSR: event.target.checked }));
    toast(t('settingsSaved'));
  }, false);
});

$('passesSelect').addEventListener('change', async event => {
  const game = selectedGame();
  if (!game) return;
  await act(async () => {
    state = unwrap(await window.nrApp.setGameSettings(game.id, { passes: Number(event.target.value) }));
    toast(t('settingsSaved'));
  }, false);
});

$('runtimeBtn').addEventListener('click', async () => {
  const game = selectedGame();
  if (!game) return;
  await act(async () => {
    state = unwrap(await window.nrApp.importRuntime(game.id));
    toast(t('runtimeImported'));
  });
});

$('folderBtn').addEventListener('click', async () => {
  const game = selectedGame();
  if (game) await window.nrApp.openGameFolder(game.id);
});

$('installBtn').addEventListener('click', async () => {
  const game = selectedGame();
  if (!game) return;
  await act(async () => {
    const result = unwrap(await window.nrApp.install(game.id));
    if (result.cancelled) return;
    state = result.state;
    toast(t('installComplete'));
  });
});

$('restoreBtn').addEventListener('click', async () => {
  const game = selectedGame();
  if (!game) return;
  await act(async () => {
    const result = unwrap(await window.nrApp.restore(game.id));
    state = result.state;
    toast(t('restoreComplete'));
  });
});

refresh().catch(error => toast(error.message || String(error)));
