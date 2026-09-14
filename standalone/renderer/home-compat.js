'use strict';

// Compatibility layer loaded after app.js and ux-fixes.js. Home and Games evolved
// into the same library surface during the standalone refactor, so keep one clear
// Library page and make every page transition reset the shared content scroller.
(() => {
  const scroller = document.querySelector('.content');
  const MANAGER_BACKEND_ID = '0.7.7-dlss5mgr6';

  if (I18N?.en) {
    I18N.en.games = 'Library';
    I18N.en.gamesBody = 'Installed games detected from your launchers. Filter to DLSS 5 compatible or configured titles.';
  }
  if (I18N?.['zh-CN']) {
    I18N['zh-CN'].games = '游戏库';
    I18N['zh-CN'].gamesBody = '显示启动器中检测到的已安装游戏；可筛选支持 DLSS 5 或已经配置的游戏。';
  }

  document.querySelector('.nav-item[data-page="home"]')?.remove();
  document.getElementById('page-home')?.remove();

  const gamesPage = document.getElementById('page-games');
  gamesPage?.classList.add('library-page');

  // Reset scroll in the navigation primitive itself instead of attaching fixes to
  // individual buttons. This covers library cards, Add game, Back, and sidebar nav.
  const previousShowPage = showPage;
  showPage = function(page) {
    const target = page === 'home' ? 'games' : page;
    if (scroller) scroller.scrollTop = 0;
    previousShowPage(target);
    if (scroller) {
      scroller.scrollTop = 0;
      requestAnimationFrame(() => { scroller.scrollTop = 0; });
    }
  };

  const isCompatible = game => Boolean(game?.compatible || (game?.chosen && game?.dlss && game.chosen.bitness === 64 && game.chosen.api));
  const isConfigured = game => Boolean(game?.installed || game?.existingSetup);
  const needsBackendUpdate = game => Boolean(
    game?.installed && game?.hasBackup && game?.optiscaler?.version && game.optiscaler.version !== MANAGER_BACKEND_ID
  );
  let libraryFilter = 'all';

  const copy = () => state.language === 'zh-CN' ? {
    scan: '扫描游戏',
    add: '添加游戏',
    all: '全部',
    compatible: '兼容 DLSS 5',
    configured: '已配置',
    compatibleTag: '兼容',
    incompatibleTag: '不兼容',
    configuredTag: '已配置',
    empty: '没有符合当前筛选条件的游戏。',
    updateBackend: '更新游戏内后端',
    updatingBackend: '正在更新…',
    backendUpdated: '游戏内后端已更新。请重新启动游戏后再测试 Overlay。',
    languageError: '语言切换失败。',
    summary: (all, compatible, configured) => `${all} 个已安装游戏 · ${compatible} 个兼容 · ${configured} 个已配置`
  } : {
    scan: 'Scan games',
    add: 'Add game',
    all: 'All',
    compatible: 'DLSS 5 compatible',
    configured: 'Configured',
    compatibleTag: 'Compatible',
    incompatibleTag: 'Not compatible',
    configuredTag: 'Configured',
    empty: 'No games match this filter.',
    updateBackend: 'Update in-game backend',
    updatingBackend: 'Updating…',
    backendUpdated: 'In-game backend updated. Restart the game before testing the overlay.',
    languageError: 'Unable to change language.',
    summary: (all, compatible, configured) => `${all} installed · ${compatible} compatible · ${configured} configured`
  };

  function ensureLibraryToolbar() {
    const heading = gamesPage?.querySelector('.page-heading');
    const add = document.getElementById('addGameBtn');
    if (!heading || !add?.parentElement) return;

    let scan = document.getElementById('rescanGamesBtn');
    if (!scan) {
      scan = document.createElement('button');
      scan.id = 'rescanGamesBtn';
      scan.type = 'button';
      scan.className = 'ghost compact scan-button';
      add.parentElement.insertBefore(scan, add);
      scan.addEventListener('click', () => scanGames());
    }

    let bar = document.getElementById('gamesFilterBar');
    if (bar) bar.remove();
    bar = document.createElement('div');
    bar.id = 'gamesFilterBar';
    bar.className = 'games-filter-bar';
    for (const filter of ['all', 'compatible', 'configured']) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.filter = filter;
      button.addEventListener('click', () => {
        libraryFilter = filter;
        renderGames();
      });
      bar.appendChild(button);
    }
    heading.after(bar);
  }

  function cardFor(game) {
    const c = copy();
    const card = document.createElement('div');
    card.className = 'home-game-card library-game-card';
    card.tabIndex = 0;
    card.setAttribute('role', 'button');

    const art = document.createElement('img');
    art.className = 'home-game-art';
    art.alt = '';
    const primary = game.coverDataUrl || game.bannerDataUrl || game.iconDataUrl || '';
    const fallback = game.bannerDataUrl || game.iconDataUrl || '';
    if (primary) art.src = primary;
    art.addEventListener('error', () => {
      if (fallback && art.src !== fallback) art.src = fallback;
      else art.classList.add('hidden-art');
    });

    const shade = document.createElement('span');
    shade.className = 'home-game-shade';
    const text = document.createElement('span');
    text.className = 'home-game-card-copy';
    const title = document.createElement('b');
    title.textContent = gameTitle(game);
    const meta = document.createElement('small');
    meta.textContent = [
      game.launcher,
      isCompatible(game) ? c.compatibleTag : c.incompatibleTag,
      isConfigured(game) ? c.configuredTag : null
    ].filter(Boolean).join(' · ');
    text.append(title, meta);
    card.append(art, shade, text);
    card.classList.toggle('not-compatible', !isCompatible(game));

    const open = async () => {
      await act(async () => {
        state = unwrap(await window.nrApp.selectGame(game.id));
        showPage('game');
      }, false);
    };
    card.addEventListener('click', open);
    card.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        open();
      }
    });
    return card;
  }

  renderGames = function() {
    const list = document.getElementById('gameList');
    if (!list) return;
    list.className = 'home-game-grid library-game-grid';
    list.replaceChildren();

    const c = copy();
    const visible = state.games.filter(game =>
      libraryFilter === 'all' ||
      (libraryFilter === 'compatible' && isCompatible(game)) ||
      (libraryFilter === 'configured' && isConfigured(game))
    );

    if (!visible.length) {
      const empty = document.createElement('div');
      empty.className = 'home-game-empty';
      empty.textContent = c.empty;
      list.appendChild(empty);
    } else {
      for (const game of visible) list.appendChild(cardFor(game));
    }

    const compatible = state.games.filter(isCompatible).length;
    const configured = state.games.filter(isConfigured).length;
    const body = gamesPage?.querySelector('.page-heading p');
    if (body) body.textContent = c.summary(state.games.length, compatible, configured);

    const scan = document.getElementById('rescanGamesBtn');
    const add = document.getElementById('addGameBtn');
    if (scan) { scan.textContent = c.scan; scan.disabled = busy; }
    if (add) { add.textContent = c.add; add.disabled = busy; }

    const labels = { all: c.all, compatible: c.compatible, configured: c.configured };
    for (const button of document.querySelectorAll('#gamesFilterBar button')) {
      button.textContent = labels[button.dataset.filter] || button.dataset.filter;
      button.classList.toggle('active', button.dataset.filter === libraryFilter);
    }
  };

  function installImmediateLanguagePicker() {
    const oldPicker = document.querySelector('.language-choice');
    if (!oldPicker?.parentElement) return () => {};

    const picker = oldPicker.cloneNode(false);
    oldPicker.replaceWith(picker);
    const english = document.createElement('button');
    const chinese = document.createElement('button');
    english.type = chinese.type = 'button';
    english.dataset.language = 'en';
    chinese.dataset.language = 'zh-CN';
    picker.append(english, chinese);

    const paint = () => {
      const zh = state.language === 'zh-CN';
      english.textContent = zh ? '英语' : 'English';
      chinese.textContent = zh ? '简体中文' : 'Chinese (Simplified)';
      english.classList.toggle('active', !zh);
      chinese.classList.toggle('active', zh);
    };

    const choose = async language => {
      if (language === state.language) return;
      const previous = state.language;
      state = { ...state, language };
      paint();
      render();
      english.disabled = chinese.disabled = true;
      try {
        const result = await window.nrApp.setLanguage(language);
        if (!result?.ok) throw new Error(result?.message || copy().languageError);
        if (result.value && typeof result.value === 'object') state = { ...state, ...result.value, language };
      } catch (error) {
        state = { ...state, language: previous };
        toast(error.message || String(error));
      } finally {
        english.disabled = chinese.disabled = false;
        paint();
        render();
      }
    };

    english.addEventListener('click', () => choose('en'));
    chinese.addEventListener('click', () => choose('zh-CN'));
    paint();
    return paint;
  }

  function ensureBackendUpdateButton() {
    let button = document.getElementById('backendUpdateBtn');
    const install = document.getElementById('installBtn');
    if (!install?.parentElement) return null;
    if (!button) {
      button = document.createElement('button');
      button.id = 'backendUpdateBtn';
      button.type = 'button';
      button.className = 'primary install-button hidden';
      install.after(button);
      button.addEventListener('click', async () => {
        const game = selectedGame();
        if (!game || !needsBackendUpdate(game) || busy) return;
        const c = copy();
        button.disabled = true;
        button.textContent = c.updatingBackend;
        await act(async () => {
          const restored = unwrap(await window.nrApp.restore(game.id));
          if (restored?.state) state = restored.state;
          const installed = unwrap(await window.nrApp.install(game.id));
          if (installed?.state) state = installed.state;
          if (!installed?.cancelled) toast(c.backendUpdated);
        });
      });
    }
    return button;
  }

  const paintBackendUpdate = () => {
    const button = ensureBackendUpdateButton();
    const install = document.getElementById('installBtn');
    if (!button || !install) return;
    const stale = needsBackendUpdate(selectedGame());
    button.classList.toggle('hidden', !stale);
    install.classList.toggle('hidden', stale);
    button.textContent = copy().updateBackend;
    button.disabled = busy || !stale;
  };

  ensureLibraryToolbar();
  const paintLanguage = installImmediateLanguagePicker();
  const baseRender = render;
  render = function() {
    baseRender();
    paintLanguage();
    paintBackendUpdate();
  };

  currentPage = currentPage === 'settings' ? 'settings' : 'games';
  if (scroller) scroller.scrollTop = 0;
  render();
})();
