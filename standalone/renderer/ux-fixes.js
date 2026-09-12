'use strict';

(() => {
  const sidebarFoot = document.querySelector('.sidebar-foot');
  if (sidebarFoot) sidebarFoot.remove();

  // Non-blocking setting changes should not be re-rendered before their IPC call.
  // The old helper did that and visually snapped switches back before the update landed.
  act = async function(work, lock = true) {
    if (lock && busy) return;
    if (lock) {
      busy = true;
      render();
    }
    try { await work(); }
    catch (error) { toast(error.message || String(error)); }
    finally {
      if (lock) busy = false;
      render();
    }
  };

  const languageSelect = document.getElementById('languageSelect');
  const languageField = languageSelect?.closest('.language-field');
  if (languageSelect && languageField) {
    const picker = document.createElement('div');
    picker.className = 'language-choice';
    picker.setAttribute('role', 'group');
    picker.setAttribute('aria-label', 'Language');

    const english = document.createElement('button');
    english.type = 'button';
    english.dataset.language = 'en';

    const chinese = document.createElement('button');
    chinese.type = 'button';
    chinese.dataset.language = 'zh-CN';

    picker.append(english, chinese);
    languageField.appendChild(picker);

    function paint(language) {
      const zh = language === 'zh-CN';
      english.textContent = zh ? '英语' : 'English';
      chinese.textContent = zh ? '简体中文' : 'Chinese (Simplified)';
      english.classList.toggle('active', !zh);
      chinese.classList.toggle('active', zh);
      english.setAttribute('aria-pressed', String(!zh));
      chinese.setAttribute('aria-pressed', String(zh));
    }

    async function choose(language) {
      if (!['en', 'zh-CN'].includes(language)) return;
      english.disabled = true;
      chinese.disabled = true;
      try {
        const result = await window.nrApp.setLanguage(language);
        if (!result?.ok) throw new Error(result?.message || 'Unable to change language');
        paint(language);
        window.location.reload();
      } catch (error) {
        const toastNode = document.getElementById('toast');
        if (toastNode) {
          toastNode.textContent = error.message || String(error);
          toastNode.classList.add('show');
          setTimeout(() => toastNode.classList.remove('show'), 2600);
        }
        english.disabled = false;
        chinese.disabled = false;
      }
    }

    english.addEventListener('click', () => choose('en'));
    chinese.addEventListener('click', () => choose('zh-CN'));

    window.nrApp.getState().then(result => {
      if (result?.ok) paint(result.value?.language || 'en');
      else paint('en');
    }).catch(() => paint('en'));
  }

  function copy() {
    const zh = state.language === 'zh-CN';
    return zh ? {
      master: '启用 DLSS 神经渲染',
      masterBody: '关闭后只停用神经渲染，不会删除 OptiScaler 或运行库文件。',
      detected: '已检测到现有安装',
      detectedButton: '现有安装',
      settingsSaved: '设置已保存。'
    } : {
      master: 'Enable DLSS Neural Rendering',
      masterBody: 'Turn Neural Rendering off without removing OptiScaler or runtime files.',
      detected: 'Existing NR detected',
      detectedButton: 'Existing setup',
      settingsSaved: 'Settings saved.'
    };
  }

  function ensureMasterRow() {
    let row = document.getElementById('nrMasterRow');
    if (row) return row;
    const runBeforeRow = document.querySelector('.glass-card .main-setting');
    if (!runBeforeRow?.parentElement) return null;

    row = document.createElement('div');
    row.id = 'nrMasterRow';
    row.className = 'setting-row main-setting nr-master-setting';

    const text = document.createElement('div');
    const title = document.createElement('strong');
    title.id = 'nrMasterTitle';
    const body = document.createElement('p');
    body.id = 'nrMasterBody';
    text.append(title, body);

    const label = document.createElement('label');
    label.className = 'switch';
    label.setAttribute('aria-label', 'DLSS Neural Rendering');
    const input = document.createElement('input');
    input.id = 'nrEnabledToggle';
    input.type = 'checkbox';
    const thumb = document.createElement('span');
    label.append(input, thumb);
    row.append(text, label);
    runBeforeRow.parentElement.insertBefore(row, runBeforeRow);

    input.addEventListener('change', async event => {
      const game = selectedGame();
      if (!game) return;
      await act(async () => {
        state = unwrap(await window.nrApp.setGameSettings(game.id, { enabled: event.target.checked }));
        toast(copy().settingsSaved);
      }, false);
    });
    return row;
  }

  function decorateHero(game) {
    const hero = document.querySelector('.hero');
    if (!hero) return;
    let icon = document.getElementById('heroGameIcon');
    if (!icon) {
      icon = document.createElement('div');
      icon.id = 'heroGameIcon';
      icon.className = 'hero-game-icon';
      hero.insertBefore(icon, hero.firstChild);
    }
    if (game.iconDataUrl) {
      icon.textContent = '';
      icon.style.backgroundImage = `url(${game.iconDataUrl})`;
      icon.classList.add('has-art');
    } else {
      icon.style.backgroundImage = '';
      icon.textContent = gameTitle(game).slice(0, 1).toUpperCase();
      icon.classList.remove('has-art');
    }
  }

  function decorateGameRows() {
    const rows = [...document.querySelectorAll('#gameList .game-row')];
    if (!state.games.length) return;
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

  const originalRenderHome = renderHome;
  renderHome = function() {
    originalRenderHome();
    const game = selectedGame();
    if (!game) return;

    const row = ensureMasterRow();
    const strings = copy();
    if (row) {
      document.getElementById('nrMasterTitle').textContent = strings.master;
      document.getElementById('nrMasterBody').textContent = strings.masterBody;
      const enabled = document.getElementById('nrEnabledToggle');
      enabled.checked = game.settings?.enabled !== false;
      enabled.disabled = busy;
    }

    // Pre-SR is a placement setting, not the master NR switch. Keep it independently usable.
    const pre = document.getElementById('presrToggle');
    if (pre) pre.disabled = busy;

    if (game.existingSetup && !game.installed) {
      const chip = document.getElementById('installState');
      const install = document.getElementById('installBtn');
      if (chip) chip.textContent = strings.detected;
      if (install) {
        install.textContent = strings.detectedButton;
        install.disabled = true;
      }
    }
    decorateHero(game);
  };

  const originalRenderGames = renderGames;
  renderGames = function() {
    originalRenderGames();
    decorateGameRows();
  };

  const scroller = document.querySelector('.content');
  document.querySelectorAll('.nav-item').forEach(button => {
    button.addEventListener('click', () => {
      if (scroller) scroller.scrollTop = 0;
    });
  });

  render();
})();
