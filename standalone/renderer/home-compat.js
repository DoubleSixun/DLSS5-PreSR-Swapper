'use strict';

// Compatibility layer loaded after app.js and ux-fixes.js. Home and Games evolved
// into the same library surface during the standalone refactor, so keep one clear
// Library page and make every page transition reset the shared content scroller.
(() => {
  const scroller = document.querySelector('.content');
  const MANAGER_BACKEND_ID = '0.7.7-dlss5mgr7';

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
  let openingGame = false;
  let menuPending = false;

  const copy = () => state.language === 'zh-CN' ? {
    scan: '扫描游戏',
    scanning: '正在扫描…',
    add: '添加游戏',
    all: '全部',
    compatible: '兼容 DLSS 5',
    configured: '已配置',
    hidden: '已隐藏',
    favorites: '收藏夹',
    otherGames: '其他游戏',
    opening: '正在读取游戏状态…',
    launching: '已发送游戏启动请求。',
    hiddenNotice: '已隐藏，游戏文件和配置均保留；可在“已隐藏”中取消隐藏。',
    unhiddenNotice: '游戏已恢复显示。',
    compatibleTag: '兼容',
    incompatibleTag: '不兼容',
    configuredTag: '已配置',
    empty: '没有符合当前筛选条件的游戏。',
    updateBackend: '更新游戏内后端',
    updatingBackend: '正在更新…',
    backendUpdated: '游戏内后端已更新。原文件备份已保留，请重新启动游戏后再测试 Overlay。',
    languageError: '语言切换失败。',
    overlayLanguageError: '桌面语言已切换，但游戏内 Overlay 语言同步失败。',
    summary: (all, compatible, configured) => `${all} 个已安装游戏 · ${compatible} 个兼容 · ${configured} 个已配置`
  } : {
    scan: 'Scan games',
    scanning: 'Scanning…',
    add: 'Add game',
    all: 'All',
    compatible: 'DLSS 5 compatible',
    configured: 'Configured',
    hidden: 'Hidden',
    favorites: 'Favorites',
    otherGames: 'Other games',
    opening: 'Reading game status…',
    launching: 'Game launch requested.',
    hiddenNotice: 'Hidden. Game files and settings are untouched. Unhide it from the Hidden filter.',
    unhiddenNotice: 'Game is visible again.',
    compatibleTag: 'Compatible',
    incompatibleTag: 'Not compatible',
    configuredTag: 'Configured',
    empty: 'No games match this filter.',
    updateBackend: 'Update in-game backend',
    updatingBackend: 'Updating…',
    backendUpdated: 'In-game backend updated. The original-file backup was preserved. Restart the game before testing the overlay.',
    languageError: 'Unable to change language.',
    overlayLanguageError: 'Desktop language changed, but the in-game overlay language could not be synchronized.',
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
    for (const filter of ['all', 'compatible', 'configured', 'hidden']) {
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
    card.dataset.gameId = game.id;
    card.setAttribute('aria-label', gameTitle(game));
    card.setAttribute('aria-haspopup', 'menu');
    card.setAttribute('aria-disabled', busy ? 'true' : 'false');
    card.classList.toggle('selected', game.id === state.selectedGameId);

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
    if (game.favorite) {
      const star = document.createElement('span');
      star.className = 'library-favorite-mark';
      star.textContent = '★';
      star.title = c.favorites;
      card.appendChild(star);
    }
    card.classList.toggle('not-compatible', !isCompatible(game));

    const open = async () => {
      if (busy || openingGame) return;
      const previousId = state.selectedGameId;
      openingGame = true;
      await act(async () => {
        // Paint the cached detail immediately, then verify only this game's files.
        state = { ...state, selectedGameId: game.id };
        showPage('game');
        try {
          state = unwrap(await window.nrApp.selectGame(game.id));
        } catch (error) {
          state = { ...state, selectedGameId: previousId };
          throw error;
        } finally {
          openingGame = false;
        }
      });
    };
    card.addEventListener('click', open);
    card.addEventListener('keydown', event => {
      if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
        event.preventDefault();
        openMenu(game);
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        open();
      }
    });
    card.addEventListener('contextmenu', event => {
      event.preventDefault();
      event.stopPropagation();
      openMenu(game);
    });
    return card;
  }

  async function openMenu(game) {
    if (busy || menuPending) return;
    menuPending = true;
    try {
      const action = unwrap(await window.nrApp.showGameMenu(game.id));
      if (!action) return;
      await act(async () => {
        const current = state.games.find(item => item.id === game.id);
        if (!current) return;
        if (action === 'launch') {
          unwrap(await window.nrApp.launchGame(game.id));
          toast(copy().launching);
        } else if (action === 'folder') {
          unwrap(await window.nrApp.openGameFolder(game.id));
        } else if (action === 'favorite') {
          state = unwrap(await window.nrApp.setGameFavorite(game.id, !current.favorite));
        } else if (action === 'hidden') {
          state = unwrap(await window.nrApp.setGameHidden(game.id, !current.hidden));
          toast(current.hidden ? copy().unhiddenNotice : copy().hiddenNotice);
        }
      });
    } catch (error) { toast(error.message || String(error)); }
    finally { menuPending = false; }
    document.querySelector(`[data-game-id="${game.id}"]`)?.focus();
  }

  renderGames = function() {
    const list = document.getElementById('gameList');
    if (!list) return;
    list.className = 'home-game-grid library-game-grid';
    list.replaceChildren();

    const c = copy();
    const library = state.games.filter(game => !game.hidden);
    const visible = state.games.filter(game => libraryFilter === 'hidden' ? game.hidden : !game.hidden && (
      libraryFilter === 'all' ||
      (libraryFilter === 'compatible' && isCompatible(game)) ||
      (libraryFilter === 'configured' && isConfigured(game))
    ));

    if (!visible.length) {
      const empty = document.createElement('div');
      empty.className = 'home-game-empty';
      empty.textContent = c.empty;
      list.appendChild(empty);
    } else {
      const favorites = visible.filter(game => game.favorite);
      const otherGames = visible.filter(game => !game.favorite);
      const section = (title, games) => {
        if (!games.length) return;
        if (favorites.length) {
          const heading = document.createElement('h2');
          heading.className = 'library-section-title';
          heading.textContent = title;
          list.appendChild(heading);
        }
        for (const game of games) list.appendChild(cardFor(game));
      };
      section(c.favorites, favorites);
      section(c.otherGames, otherGames);
    }

    const compatible = library.filter(isCompatible).length;
    const configured = library.filter(isConfigured).length;
    const body = gamesPage?.querySelector('.page-heading p');
    if (body) body.textContent = c.summary(library.length, compatible, configured);

    const scan = document.getElementById('rescanGamesBtn');
    const add = document.getElementById('addGameBtn');
    if (scan) {
      scan.textContent = busy ? c.scanning : c.scan;
      scan.disabled = busy;
      scan.setAttribute('aria-busy', busy ? 'true' : 'false');
    }
    if (add) { add.textContent = c.add; add.disabled = busy; }

    const labels = { all: c.all, compatible: c.compatible, configured: c.configured, hidden: `${c.hidden} (${state.games.length - library.length})` };
    for (const button of document.querySelectorAll('#gamesFilterBar button')) {
      button.textContent = labels[button.dataset.filter] || button.dataset.filter;
      button.classList.toggle('active', button.dataset.filter === libraryFilter);
      button.setAttribute('aria-pressed', button.dataset.filter === libraryFilter ? 'true' : 'false');
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
        try {
          const overlay = await window.nrApp.setOverlayLanguage(language);
          if (!overlay?.ok) toast(overlay?.message || copy().overlayLanguageError);
        } catch {
          toast(copy().overlayLanguageError);
        }
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
          const updated = unwrap(await window.nrApp.updateBackend(game.id));
          state = unwrap(await window.nrApp.getState());
          if (!updated?.cancelled && !updated?.unchanged) toast(c.backendUpdated);
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
    button.textContent = busy && stale ? copy().updatingBackend : copy().updateBackend;
    button.disabled = busy || !stale;
    button.setAttribute('aria-busy', busy && stale ? 'true' : 'false');
  };

  ensureLibraryToolbar();
  const paintLanguage = installImmediateLanguagePicker();
  const baseRender = render;
  render = function() {
    baseRender();
    const detail = document.getElementById('gameDetail');
    if (detail) { detail.inert = openingGame; detail.setAttribute('aria-busy', String(openingGame)); }
    if (openingGame && currentPage === 'game') {
      const status = document.getElementById('inlineStatus');
      if (status) { status.textContent = copy().opening; status.setAttribute('role', 'status'); }
    }
    paintLanguage();
    paintBackendUpdate();
  };

  currentPage = currentPage === 'settings' ? 'settings' : 'games';
  if (scroller) scroller.scrollTop = 0;
  render();
})();
