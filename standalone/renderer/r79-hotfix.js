'use strict';

(() => {
  const CURRENT_BACKEND_ID = '0.7.7-dlss5mgr5';
  const text = () => state.language === 'zh-CN' ? {
    scan: '扫描游戏', scanning: '正在扫描…',
    update: '更新游戏内后端', updating: '正在更新…',
    updated: '游戏内后端已更新。请重新启动游戏后再测试 Overlay。'
  } : {
    scan: 'Scan games', scanning: 'Scanning…',
    update: 'Update in-game backend', updating: 'Updating…',
    updated: 'In-game backend updated. Restart the game before testing the overlay.'
  };

  const originalRenderGames = renderGames;
  renderGames = function() {
    originalRenderGames();
    const scan = document.getElementById('rescanGamesBtn');
    if (scan) {
      scan.textContent = busy ? text().scanning : text().scan;
      scan.disabled = busy;
      scan.setAttribute('aria-busy', busy ? 'true' : 'false');
      scan.classList.toggle('is-scanning', busy);
    }
  };

  const needsUpdate = game => Boolean(
    game?.installed && game?.hasBackup && game?.optiscaler?.version && game.optiscaler.version !== CURRENT_BACKEND_ID
  );

  function ensureUpdateButton() {
    const oldButton = document.getElementById('backendUpdateBtn');
    if (oldButton) oldButton.classList.add('hidden');

    let button = document.getElementById('backendUpdateR79Btn');
    const install = document.getElementById('installBtn');
    if (!install?.parentElement) return null;

    if (!button) {
      button = document.createElement('button');
      button.id = 'backendUpdateR79Btn';
      button.type = 'button';
      button.className = 'primary install-button hidden';
      install.after(button);
      button.addEventListener('click', async () => {
        const game = selectedGame();
        if (!game || !needsUpdate(game) || busy) return;
        button.disabled = true;
        button.textContent = text().updating;
        await act(async () => {
          const restored = unwrap(await window.nrApp.restore(game.id));
          if (restored?.state) state = restored.state;
          const installed = unwrap(await window.nrApp.install(game.id));
          if (installed?.state) state = installed.state;
          if (!installed?.cancelled) toast(text().updated);
        });
      });
    }
    return button;
  }

  function paintBackendUpdate() {
    const button = ensureUpdateButton();
    const install = document.getElementById('installBtn');
    if (!button || !install) return;
    const stale = needsUpdate(selectedGame());
    button.classList.toggle('hidden', !stale);
    install.classList.toggle('hidden', stale);
    button.textContent = text().update;
    button.disabled = busy || !stale;
  }

  const previousRender = render;
  render = function() {
    previousRender();
    paintBackendUpdate();
  };

  renderGames();
  paintBackendUpdate();
})();
