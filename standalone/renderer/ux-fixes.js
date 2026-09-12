'use strict';

(() => {
  const sidebarFoot = document.querySelector('.sidebar-foot');
  if (sidebarFoot) sidebarFoot.remove();

  const languageSelect = document.getElementById('languageSelect');
  const languageField = languageSelect?.closest('.language-field');
  if (!languageSelect || !languageField) return;

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
      const toast = document.getElementById('toast');
      if (toast) {
        toast.textContent = error.message || String(error);
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 2600);
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

  const scroller = document.querySelector('.content');
  document.querySelectorAll('.nav-item').forEach(button => {
    button.addEventListener('click', () => {
      if (scroller) scroller.scrollTop = 0;
    });
  });
})();
