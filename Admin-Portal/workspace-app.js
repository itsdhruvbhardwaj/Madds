(() => {
  function create({ canReload, onRefresh }) {
    const $ = id => document.getElementById(id), mobile = window.matchMedia('(max-width: 760px)');
    const standalone = window.matchMedia('(display-mode: standalone)');
    const sidebar = $('workspace-sidebar'), main = document.querySelector('.main-area');
    let installPrompt = null, registration = null, applying = false, updateReady = false, lastCheck = 0;
    const installed = () => standalone.matches || navigator.standalone === true;
    function closeMenu() {
      const wasOpen = document.body.classList.contains('workspace-menu-open');
      document.body.classList.remove('workspace-menu-open'); $('workspace-menu-toggle').setAttribute('aria-expanded', 'false');
      $('workspace-menu-backdrop').hidden = true; main.inert = false;
      sidebar.inert = mobile.matches;
      if (mobile.matches) sidebar.setAttribute('aria-hidden', 'true'); else sidebar.removeAttribute('aria-hidden');
      sidebar.removeAttribute('aria-modal'); sidebar.removeAttribute('role');
      if (wasOpen) $('workspace-menu-toggle').focus();
    }
    function openMenu() {
      if (!mobile.matches) return;
      sidebar.inert = false; sidebar.removeAttribute('aria-hidden'); sidebar.setAttribute('role', 'dialog'); sidebar.setAttribute('aria-modal', 'true');
      document.body.classList.add('workspace-menu-open'); $('workspace-menu-toggle').setAttribute('aria-expanded', 'true');
      $('workspace-menu-backdrop').hidden = false; main.inert = true;
      requestAnimationFrame(() => { if (document.body.classList.contains('workspace-menu-open')) $('workspace-menu-close').focus(); });
    }
    $('workspace-menu-toggle').addEventListener('click', openMenu);
    $('workspace-menu-close').addEventListener('click', closeMenu);
    $('workspace-menu-backdrop').addEventListener('click', closeMenu);
    mobile.addEventListener('change', closeMenu); closeMenu();
    sidebar.addEventListener('keydown', event => {
      if (!document.body.classList.contains('workspace-menu-open')) return;
      if (event.key === 'Escape') { event.preventDefault(); closeMenu(); }
      if (event.key === 'Tab') {
        const items = [...sidebar.querySelectorAll('button:not([disabled]),a[href],select')].filter(el => !el.hidden && el.getClientRects().length);
        const first = items[0], last = items.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    });
    sidebar.addEventListener('click', event => {
      const selected = event.target.closest('.side-link');
      // App navigation runs first. A cancelled unsaved-change prompt keeps the menu open.
      if (selected?.classList.contains('active') || event.target.closest('#logout-button')) closeMenu();
    });
    function connectionChanged() {
      const offline = navigator.onLine === false;
      $('workspace-connection').hidden = !offline;
      document.body.classList.toggle('workspace-offline', offline);
      document.querySelector('.live-pill').textContent = offline ? 'Offline' : 'Live data';
      if (registration && !offline) void checkUpdate();
    }
    window.addEventListener('offline', connectionChanged); window.addEventListener('online', connectionChanged); connectionChanged();
    document.addEventListener('submit', event => {
      if (navigator.onLine !== false || event.target.method === 'dialog') return;
      event.preventDefault(); event.stopImmediatePropagation();
      $('workspace-connection').hidden = false; $('workspace-connection').focus();
    }, true);
    $('workspace-reconnect').addEventListener('click', () => {
      if (navigator.onLine === false) { $('workspace-connection-copy').textContent = 'Still offline. Reconnect to continue. Your edits stay in this window; nothing is queued.'; return; }
      connectionChanged(); onRefresh();
    });
    function installationChanged() {
      $('workspace-install').hidden = installed(); $('workspace-install-now').hidden = !installPrompt;
    }
    window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; installationChanged(); });
    window.addEventListener('appinstalled', () => { installPrompt = null; installationChanged(); $('workspace-install-dialog').close(); });
    standalone.addEventListener('change', installationChanged); installationChanged();
    $('workspace-install').addEventListener('click', () => { closeMenu(); $('workspace-install-dialog').showModal(); });
    $('workspace-install-close').addEventListener('click', () => $('workspace-install-dialog').close());
    $('workspace-install-now').addEventListener('click', async () => {
      const prompt = installPrompt; if (!prompt) return;
      installPrompt = null; installationChanged();
      try { await prompt.prompt(); await prompt.userChoice; } catch { /* Browser installation can be dismissed. Manual instructions remain available. */ }
    });
    function showUpdate() {
      if (registration?.waiting) updateReady = true;
      $('workspace-update').hidden = !updateReady;
    }
    async function checkUpdate() {
      if (!registration || navigator.onLine === false || Date.now() - lastCheck < 60_000) return;
      lastCheck = Date.now(); try { await registration.update(); showUpdate(); } catch { /* Network failures never end an admin session or reload an editor. */ }
    }
    async function applyUpdate() {
      if (!updateReady || applying) return false;
      if (navigator.onLine === false) { $('workspace-update-copy').textContent = 'Reconnect before updating Workspace.'; return false; }
      if (!canReload()) { $('workspace-update-copy').textContent = 'Save or discard your edits and close open editors before updating.'; return false; }
      applying = true; $('workspace-update-apply').disabled = true;
      // Only this window reloads, and only after its own explicit approval.
      if (registration?.waiting) registration.waiting.postMessage({ type: 'ACTIVATE_WORKSPACE_UPDATE' });
      else window.location.reload(); // Another window may have activated it while this editor stayed open.
      return true;
    }
    $('workspace-update-apply').addEventListener('click', () => { void applyUpdate(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) void checkUpdate(); });
    if ('serviceWorker' in navigator && window.isSecureContext) {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        updateReady = true; showUpdate();
        if (!applying) return;
        if (navigator.onLine === false || !canReload()) {
          applying = false; $('workspace-update-apply').disabled = false;
          $('workspace-update-copy').textContent = 'Update is ready. Save your work, then reopen Workspace when online.'; return;
        }
        window.location.reload();
      });
      navigator.serviceWorker.register('./workspace-sw.js', { scope: './', updateViaCache: 'none' }).then(result => {
        registration = result; showUpdate();
        result.addEventListener('updatefound', () => {
          result.installing?.addEventListener('statechange', showUpdate);
        });
        void checkUpdate();
      }).catch(() => { /* Workspace remains fully usable when installation services are unavailable. */ });
    }
    return { closeMenu, applyUpdate };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { create };
  else window.MaddsWorkspaceApp = { create };
})();
