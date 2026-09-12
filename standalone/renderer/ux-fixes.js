'use strict';

(() => {
  const polish = document.createElement('link');
  polish.rel = 'stylesheet';
  polish.href = 'compact-ui.css';
  document.head.appendChild(polish);

  document.querySelector('.sidebar-foot')?.remove();

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
    master: '启用 DLSS 神经渲染',
    masterBody: '关闭后只停用神经渲染，不删除 OptiScaler 或运行库文件。',
    detected: '已检测到现有安装',
    detectedButton: '现有安装',
    info: '工作原理',
    rescan: '扫描游戏',
    scanning: '正在扫描 Steam、Epic、GOG、Xbox 和 Ubisoft…',
    scanDone: count => count ? `扫描完成，新增 ${count} 个兼容游戏。` : '扫描完成，没有发现新的兼容游戏。',
    saved: '设置已保存。'
  } : {
    master: 'Enable DLSS Neural Rendering',
    masterBody: 'Turn Neural Rendering off without removing OptiScaler or runtime files.',
    detected: 'Existing NR detected',
    detectedButton: 'Existing setup',
    info: 'How it works',
    rescan: 'Scan games',
    scanning: 'Scanning Steam, Epic, GOG, Xbox and Ubisoft…',
    scanDone: count => count ? `Scan complete. Added ${count} compatible game${count === 1 ? '' : 's'}.` : 'Scan complete. No new compatible games found.',
    saved: 'Settings saved.'
  };

  function ensureMasterRow() {
    let row = document.getElementById('nrMasterRow');
    if (row) return row;
    const placement = document.querySelector('.glass-card .main-setting');
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
    const heading = document.querySelector('#gameDetail .section-heading');
    const title = heading?.querySelector('h2');
    const details = document.querySelector('#gameDetail > .glass-card .details-card');
    const content = details?.querySelector('.details-content');
    if (!heading || !title || !details || !content) return;

    const wrap = document.createElement('span');
    wrap.className = 'nr-info-wrap';
    const button = document.createElement('button');
    button.id = 'nrInfoButton';
    button.type = 'button';
    button.className = 'nr-info-button';
    button.textContent = 'ⓘ';
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
    const hero = document.querySelector('.hero');
    if (!hero) return;
    if (game.bannerDataUrl) {
      const url = String(game.bannerDataUrl).replace(/"/g, '%22');
      hero.style.backgroundImage = `linear-gradient(90deg,rgba(7,13,18,.90) 0%,rgba(7,13,18,.58) 48%,rgba(7,13,18,.18) 100%),url("${url}")`;
      hero.classList.add('has-banner');
    } else {
      hero.style.backgroundImage = '';
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

  function ensureScanButton() {
    if (document.getElementById('rescanGamesBtn')) return;
    const add = document.getElementById('addGameBtn');
    if (!add?.parentElement) return;
    const scan = document.createElement('button');
    scan.id = 'rescanGamesBtn';
    scan.type = 'button';
    scan.className = 'ghost compact scan-button';
    add.parentElement.insertBefore(scan, add);
    scan.addEventListener('click', async () => {
      scan.disabled = true;
      toast(strings().scanning);
      try {
        const result = await window.nrApp.rescanGames();
        if (!result?.ok) throw new Error(result?.message || 'Scan failed');
        state = result.value.state;
        render();
        toast(strings().scanDone(result.value.added || 0));
      } catch (error) { toast(error.message || String(error)); }
      finally { scan.disabled = false; }
    });
  }

  const originalRenderHome = renderHome;
  renderHome = function() {
    originalRenderHome();
    ensureInfoPopover();
    const game = selectedGame();
    if (!game) return;
    const copy = strings();
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
    if (scan) scan.textContent = strings().rescan;
    decorateGameRows();
  };

  const scroller = document.querySelector('.content');
  document.querySelectorAll('.nav-item').forEach(button => button.addEventListener('click', () => { if (scroller) scroller.scrollTop = 0; }));
  render();
})();
