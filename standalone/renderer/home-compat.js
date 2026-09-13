'use strict';

(() => {
  function ensureCounters() {
    const home = document.getElementById('page-home');
    if (!home) return;
    const host = document.getElementById('homeLibraryTitle')?.parentElement || home;
    if (!document.getElementById('homeGameCount')) {
      const count = document.createElement('span');
      count.id = 'homeGameCount';
      count.hidden = true;
      host.appendChild(count);
    }
    if (!document.getElementById('homeInstalledCount')) {
      const count = document.createElement('span');
      count.id = 'homeInstalledCount';
      count.hidden = true;
      host.appendChild(count);
    }
  }

  // ux-fixes turns the count sentence into plain localized text. app.js still owns the
  // underlying state update and expects these legacy counter anchors to exist on every render.
  // Keep invisible anchors instead of coupling the new visual layout to that implementation detail.
  ensureCounters();
  const priorRenderHome = renderHome;
  renderHome = function() {
    ensureCounters();
    priorRenderHome();
    ensureCounters();
  };
  render();
})();
