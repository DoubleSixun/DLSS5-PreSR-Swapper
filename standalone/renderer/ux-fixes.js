'use strict';

(() => {
  const polish = document.createElement('link');
  polish.rel = 'stylesheet';
  polish.href = 'compact-ui.css';
  document.head.appendChild(polish);

  document.querySelector('.sidebar-foot')?.remove();
  document.title = 'DLSS 5 Neural Rendering Manager';

  const brandLogo = document.querySelector('.brand .logo');
  const brandTitle = document.querySelector('.brand strong');
  if (brandLogo) brandLogo.textContent = '5';
  if (brandTitle) brandTitle.textContent = 'DLSS 5';

  // Rebuild Home as a small library landing page rather than a dashboard.
  const homePage = document.getElementById('page-home');
  if (homePage) {
    homePage.innerHTML = `
      <section class="home-library-head glass-card">
        <div class="home-library-copy">
          <span class="home-kicker">DLSS 5</span>
          <h1 id="homeHeadline">Find compatible games</h1>
          <p id="homeDescription">Scan installed game libraries for native DLSS titles that can use Neural Rendering.</p>
        </div>
        <div class="home-actions">
          <button class="primary" id="homeScanBtn">Scan games</button>
          <button class="ghost" id="homeAddBtn">Add game</button>
        </div>
        <span class="home-scan-status" id="homeScanStatus"></span>
      </section>

      <section class="home-library-section">
        <div class="home-library-title">
          <div>
            <h2 id="homeLibraryTitle">Compatible games</h2>
            <p id="homeLibraryMeta"><strong id="homeGameCount">0</strong> compatible · <strong id="homeInstalledCount">0</strong> configured</p>
          </div>
          <button class="home-view-all" id="homeOpenGamesBtn">View all <span>→</span></button>
        </div>
        <div class="home-game-grid" id="homeGameGrid"></div>
      </section>`;

    document.getElementById('homeScanBtn')?.addEventListener('click', () => scanGames());
    document.getElementById('homeAddBtn')?.addEventListener('click', () => addGame());
    document.getElementById('homeOpenGamesBtn')?.addEventListener('click', () => showPage('games'));
  }

  // Do not redraw a switch from stale state before a non-blocking IPC update lands.
  act = async function(work, lock = true) {
    if (lock && busy) return;
    if (lock) { busy = true; render(); }
    try { await work(); }
    catch (error) { toast(error.message || String(error)); }
    finally { if (lock) busy = false; render(); }
  };

  const languageSelect = document.getElementById('languageSelect');
  const languageField = languageSelect?.closest('.language-field');
  if (languageSelect && languageField) {
    const picker = document.createElement('div');
    picker.className = 'language-choice';
    picker.setAttribute('role', 'group');
    const english = document.createElement('button');
    english.type = 'button';
    english.dataset.language = 'en';
    const chinese = document.createElement('button');
    chinese.type = 'button';
    chinese.dataset.language = 'zh-CN';
    picker.append(english, chinese);
    languageField.appendChild(picker);

    const paint = language => {
      const zh = language === 'zh-CN';
      english.textContent = zh ? '英语' : 'English';
      chinese.textContent = zh ? '简体中文' : 'Chinese (Simplified)';
      english.classList.toggle('active', !zh);
      chinese.classList.toggle('active', zh);
    };
    const choose = async language => {
      english.disabled = chinese.disabled = true;
      try {
        const result = await window.nrApp.setLanguage(language);
        if (!result?.ok) throw new Error(result?.message || 'Unable to change language');
        window.location.reload();
      } catch (error) {
        toast(error.message || String(error));
        english.disabled = chinese.disabled = false;
      }
    };
    english.addEventListener('click', () => choose('en'));
    chinese.addEventListener('click', () => choose('zh-CN'));
    window.nrApp.getState().then(result => paint(result?.value?.language || 'en')).catch(() => paint('en'));
  }

  const strings = () => state.language === 'zh-CN' ? {
    subtitle: '神经渲染管理器',
    homeHeadline: '扫描支持 DLSS 5 的游戏',
    homeDescription: '扫描已安装的游戏库，查找可使用 DLSS 5 神经渲染的原生 DLSS 游戏。',
    library: '兼容游戏',
    viewAll: '查看全部',
    compatibleMeta: (games, configured) => `${games} 个兼容游戏 · ${configured} 个已配置`,
    emptyLibrary: '还没有兼容游戏，先扫描或手动添加。',
    master: '启用神经渲染',
    masterBody: '关闭后只停用神经渲染，不删除 OptiScaler 或运行库文件。',
    sectionTitle: 'DLSS 5 神经渲染',
    detected: '已检测到现有安装',
    detectedButton: '现有安装',
    info: 'Pre-SR 工作原理',
    rescan: '扫描游戏',
    saved: '设置已保存。',
    overlayTitle: '游戏内 Overlay',
    overlayBody: '使用精简的 DLSS 5 游戏内面板，而不是完整的 OptiScaler 菜单。',
    overlayEnabled: '启用精简 Overlay',
    hotkey: '打开快捷键',
    scale: '大小',
    opacity: '透明度',
    position: '位置',
    positions: ['左上', '右上', '左下', '右下'],
    overlayNote: '设置会写入已安装游戏的 OptiScaler 配置。第三方已有安装需要换成此应用的自定义后端后，才会显示新的精简样式。'
  } : {
    subtitle: 'Neural Rendering Manager',
    homeHeadline: 'Find DLSS 5 compatible games',
    homeDescription: 'Scan installed game libraries for native DLSS titles that can use DLSS 5 Neural Rendering.',
    library: 'Compatible games',
    viewAll: 'View all',
    compatibleMeta: (games, configured) => `${games} compatible · ${configured} configured`,
    emptyLibrary: 'No compatible games yet. Scan or add one manually.',
    master: 'Enable Neural Rendering',
    masterBody: 'Turn Neural Rendering off without removing OptiScaler or runtime files.',
    sectionTitle: 'DLSS 5 Neural Rendering',
    detected: 'Existing NR detected',
    detectedButton: 'Existing setup',
    info: 'How Pre-SR works',
    rescan: 'Scan games',
    saved: 'Settings saved.',
    overlayTitle: 'In-game overlay',
    overlayBody: 'Use the compact DLSS 5 panel instead of the full OptiScaler menu.',
    overlayEnabled: 'Enable compact overlay',
    hotkey: 'Open shortcut',
    scale: 'Scale',
    opacity: 'Opacity',
    position: 'Position',
    positions: ['Top left', 'Top right', 'Bottom left', 'Bottom right'],
    overlayNote: 'Preferences are written to installed OptiScaler configs. Existing third-party setups need this app’s custom backend before the new compact visual style can appear.'
  };

  function paintBrand() {
    const copy = strings();
    const subtitle = document.querySelector('.brand small');
    if (subtitle) subtitle.textContent = copy.subtitle;
  }

  function ensureMasterRow() {
    let row = document.getElementById('nrMasterRow');
    if (row) return row;
    const placement = document.getElementById('presrToggle')?.closest('.setting-row');
    if (!placement?.parentElement) return null;
    row = document.createElement('div');
    row.id = 'nrMasterRow';
    row.className = 'setting-row main-setting nr-master-setting';
    const text = document.createElement('div');
    const title = document.createElement('strong'); title.id = 'nrMasterTitle';
    const body = document.createElement('p'); body.id = 'nrMasterBody';
    text.append(title, body);
    const label = document.createElement('label'); label.className = 'switch';
    const input = document.createElement('input'); input.id = 'nrEnabledToggle'; input.type = 'checkbox';
    label.append(input, document.createElement('span'));
    row.append(text, label);
    placement.parentElement.insertBefore(row, placement);
    input.addEventListener('change', async event => {
      const game = selectedGame();
      if (!game) return;
      await act(async () => {
        state = unwrap(await window.nrApp.setGameSettings(game.id, { enabled: event.target.checked }));
        toast(strings().saved);
      }, false);
    });
    return row;
  }

  function ensureInfoPopover() {
    if (document.getElementById('nrInfoButton')) return;
    const placement = document.getElementById('presrToggle')?.closest('.setting-row');
    const title = placement?.querySelector('strong');
    const details = document.querySelector('#gameDetail > .glass-card .details-card');
    const content = details?.querySelector('.details-content');
    if (!placement || !title || !details || !content) return;

    const wrap = document.createElement('span');
    wrap.className = 'nr-info-wrap presr-info-wrap';
    const button = document.createElement('button');
    button.id = 'nrInfoButton';
    button.type = 'button';
    button.className = 'nr-info-button';
    button.textContent = 'i';
    const popover = document.createElement('div');
    popover.className = 'nr-info-popover hidden';
    popover.appendChild(content);
    wrap.append(button, popover);
    title.after(wrap);
    details.remove();
    button.addEventListener('click', event => {
      event.stopPropagation();
      popover.classList.toggle('hidden');
    });
    document.addEventListener('click', event => {
      if (!wrap.contains(event.target)) popover.classList.add('hidden');
    });
  }

  function decorateHero(game) {
    const hero = document.querySelector('#gameDetail .hero');
    if (!hero) return;
    if (game.bannerDataUrl) {
      const url = String(game.bannerDataUrl).replace(/"/g, '%22');
      hero.style.setProperty('background-image', `linear-gradient(90deg,rgba(7,13,18,.90) 0%,rgba(7,13,18,.50) 46%,rgba(7,13,18,.10) 100%),url("${url}")`, 'important');
      hero.classList.add('has-banner');
    } else {
      hero.style.removeProperty('background-image');
      hero.classList.remove('has-banner');
    }
  }

  function decorateGameRows() {
    const rows = [...document.querySelectorAll('#gameList .game-row')];
    state.games.forEach((game, index) => {
      const avatar = rows[index]?.querySelector('.game-avatar');
      if (!avatar) return;
      if (game.iconDataUrl) {
        avatar.textContent = '';
        avatar.style.backgroundImage = `url(${game.iconDataUrl})`;
        avatar.classList.add('has-art');
      } else {
        avatar.style.backgroundImage = '';
        avatar.textContent = gameTitle(game).slice(0, 1).toUpperCase();
        avatar.classList.remove('has-art');
      }
    });
  }

  function openGame(game) {
    act(async () => {
      state = unwrap(await window.nrApp.selectGame(game.id));
      showPage('game');
    }, false);
  }

  function renderHomeCards() {
    const grid = document.getElementById('homeGameGrid');
    if (!grid) return;
    grid.replaceChildren();
    const copy = strings();
    const visible = state.games.slice(0, 6);
    if (!visible.length) {
      const empty = document.createElement('div');
      empty.className = 'home-game-empty';
      empty.textContent = copy.emptyLibrary;
      grid.appendChild(empty);
      return;
    }

    for (const game of visible) {
      const card = document.createElement('button');
      card.className = 'home-game-card';
      card.type = 'button';
      if (game.bannerDataUrl) card.style.backgroundImage = `linear-gradient(180deg,rgba(4,8,12,.04),rgba(4,8,12,.88)),url("${String(game.bannerDataUrl).replace(/"/g, '%22')}")`;
      const text = document.createElement('span');
      text.className = 'home-game-card-copy';
      const title = document.createElement('b');
      title.textContent = gameTitle(game);
      const meta = document.createElement('small');
      meta.textContent = [game.chosen?.apiLabel, game.installed || game.existingSetup ? (state.language === 'zh-CN' ? '已配置' : 'Configured') : null].filter(Boolean).join(' · ');
      text.append(title, meta);
      card.appendChild(text);
      if (!game.bannerDataUrl && game.iconDataUrl) {
        const icon = document.createElement('img');
        icon.src = game.iconDataUrl;
        icon.alt = '';
        card.prepend(icon);
        card.classList.add('no-banner');
      }
      card.addEventListener('click', () => openGame(game));
      grid.appendChild(card);
    }
  }

  function paintHomeCopy() {
    const copy = strings();
    const headline = document.getElementById('homeHeadline');
    const description = document.getElementById('homeDescription');
    const title = document.getElementById('homeLibraryTitle');
    const meta = document.getElementById('homeLibraryMeta');
    const viewAll = document.getElementById('homeOpenGamesBtn');
    const scan = document.getElementById('homeScanBtn');
    const add = document.getElementById('homeAddBtn');
    if (headline) headline.textContent = copy.homeHeadline;
    if (description) description.textContent = copy.homeDescription;
    if (title) title.textContent = copy.library;
    if (meta) meta.textContent = copy.compatibleMeta(state.games.length, state.games.filter(game => game.installed || game.existingSetup).length);
    if (viewAll) viewAll.innerHTML = `${copy.viewAll} <span>→</span>`;
    if (scan) scan.textContent = copy.rescan;
    if (add) add.textContent = state.language === 'zh-CN' ? '添加游戏' : 'Add game';
  }

  function ensureScanButton() {
    if (document.getElementById('rescanGamesBtn')) return;
    const add = document.getElementById('addGameBtn');
    if (!add?.parentElement) return;
    const scan = document.createElement('button');
    scan.id = 'rescanGamesBtn';
    scan.type = 'button';
    scan.className = 'ghost compact scan-button';
    add.parentElement.insertBefore(scan, add);
    scan.addEventListener('click', () => scanGames());
  }

  let overlayPrefs = { enabled: true, hotkey: 45, scale: 1, opacity: 0.82, position: 1 };

  function ensureOverlaySettings() {
    if (document.getElementById('overlaySettingsCard')) return;
    const settingsCard = document.querySelector('#page-settings .settings-page-card');
    const about = settingsCard?.querySelector('.about-copy');
    if (!settingsCard) return;

    const card = document.createElement('section');
    card.id = 'overlaySettingsCard';
    card.className = 'overlay-settings-card';
    card.innerHTML = `
      <div class="overlay-settings-head">
        <div><strong id="overlayTitle"></strong><p id="overlayBody"></p></div>
        <label class="switch"><input id="overlayEnabled" type="checkbox"><span></span></label>
      </div>
      <div class="overlay-settings-grid">
        <label class="field"><span id="overlayHotkeyLabel"></span><select id="overlayHotkey">
          <option value="45">Insert</option><option value="119">F8</option><option value="120">F9</option><option value="121">F10</option><option value="36">Home</option>
        </select></label>
        <label class="field"><span id="overlayScaleLabel"></span><select id="overlayScale">
          <option value="0.75">75%</option><option value="1">100%</option><option value="1.25">125%</option><option value="1.5">150%</option>
        </select></label>
        <label class="field overlay-opacity-field"><span><span id="overlayOpacityLabel"></span><b id="overlayOpacityValue">82%</b></span><input id="overlayOpacity" type="range" min="0.5" max="0.95" step="0.05"></label>
        <label class="field"><span id="overlayPositionLabel"></span><select id="overlayPosition"></select></label>
      </div>
      <p class="overlay-settings-note" id="overlayNote"></p>`;
    if (about) settingsCard.insertBefore(card, about); else settingsCard.appendChild(card);

    const save = async patch => {
      overlayPrefs = { ...overlayPrefs, ...patch };
      const response = await window.nrApp.setOverlayPreferences(overlayPrefs);
      if (!response?.ok) throw new Error(response?.message || 'Unable to save overlay preferences');
      overlayPrefs = { ...overlayPrefs, ...response.value };
      paintOverlaySettings();
      toast(strings().saved);
    };

    document.getElementById('overlayEnabled').addEventListener('change', event => act(() => save({ enabled: event.target.checked }), false));
    document.getElementById('overlayHotkey').addEventListener('change', event => act(() => save({ hotkey: Number(event.target.value) }), false));
    document.getElementById('overlayScale').addEventListener('change', event => act(() => save({ scale: Number(event.target.value) }), false));
    document.getElementById('overlayPosition').addEventListener('change', event => act(() => save({ position: Number(event.target.value) }), false));
    document.getElementById('overlayOpacity').addEventListener('input', event => {
      document.getElementById('overlayOpacityValue').textContent = `${Math.round(Number(event.target.value) * 100)}%`;
    });
    document.getElementById('overlayOpacity').addEventListener('change', event => act(() => save({ opacity: Number(event.target.value) }), false));
  }

  function paintOverlaySettings() {
    const card = document.getElementById('overlaySettingsCard');
    if (!card) return;
    const copy = strings();
    document.getElementById('overlayTitle').textContent = copy.overlayTitle;
    document.getElementById('overlayBody').textContent = copy.overlayBody;
    document.getElementById('overlayHotkeyLabel').textContent = copy.hotkey;
    document.getElementById('overlayScaleLabel').textContent = copy.scale;
    document.getElementById('overlayOpacityLabel').textContent = copy.opacity;
    document.getElementById('overlayPositionLabel').textContent = copy.position;
    document.getElementById('overlayNote').textContent = copy.overlayNote;
    document.getElementById('overlayEnabled').checked = overlayPrefs.enabled !== false;
    document.getElementById('overlayHotkey').value = String(overlayPrefs.hotkey || 45);
    document.getElementById('overlayScale').value = String(overlayPrefs.scale || 1);
    document.getElementById('overlayOpacity').value = String(overlayPrefs.opacity ?? 0.82);
    document.getElementById('overlayOpacityValue').textContent = `${Math.round((overlayPrefs.opacity ?? 0.82) * 100)}%`;
    const position = document.getElementById('overlayPosition');
    position.replaceChildren(...copy.positions.map((label, index) => {
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = label;
      return option;
    }));
    position.value = String(overlayPrefs.position ?? 1);
    const disabled = overlayPrefs.enabled === false;
    for (const control of card.querySelectorAll('select,input[type="range"]')) control.disabled = disabled;
  }

  const originalRenderHome = renderHome;
  renderHome = function() {
    originalRenderHome();
    paintHomeCopy();
    renderHomeCards();
  };

  const originalRenderGame = renderGame;
  renderGame = function() {
    originalRenderGame();
    ensureInfoPopover();
    const game = selectedGame();
    if (!game) return;
    const copy = strings();
    const heading = document.querySelector('#gameDetail .section-heading h2');
    if (heading) heading.textContent = copy.sectionTitle;
    const row = ensureMasterRow();
    if (row) {
      document.getElementById('nrMasterTitle').textContent = copy.master;
      document.getElementById('nrMasterBody').textContent = copy.masterBody;
      const enabled = document.getElementById('nrEnabledToggle');
      enabled.checked = game.settings?.enabled !== false;
      enabled.disabled = busy;
    }
    const info = document.getElementById('nrInfoButton');
    if (info) info.title = copy.info;
    const pre = document.getElementById('presrToggle');
    if (pre) pre.disabled = busy;
    if (game.existingSetup && !game.installed) {
      const chip = document.getElementById('installState');
      const install = document.getElementById('installBtn');
      if (chip) chip.textContent = copy.detected;
      if (install) { install.textContent = copy.detectedButton; install.disabled = true; }
    }
    decorateHero(game);
  };

  const originalRenderGames = renderGames;
  renderGames = function() {
    originalRenderGames();
    ensureScanButton();
    const scan = document.getElementById('rescanGamesBtn');
    if (scan) {
      scan.textContent = strings().rescan;
      scan.disabled = busy;
    }
    decorateGameRows();
  };

  const originalRender = render;
  render = function() {
    originalRender();
    paintBrand();
    ensureOverlaySettings();
    paintOverlaySettings();
  };

  const scroller = document.querySelector('.content');
  document.querySelectorAll('.nav-item').forEach(button => button.addEventListener('click', () => { if (scroller) scroller.scrollTop = 0; }));
  document.getElementById('gameBackBtn')?.addEventListener('click', () => { if (scroller) scroller.scrollTop = 0; });

  window.nrApp.getOverlayPreferences?.().then(response => {
    if (response?.ok) overlayPrefs = { ...overlayPrefs, ...response.value };
    render();
  }).catch(() => {});

  render();
})();
