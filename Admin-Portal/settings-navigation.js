(() => {
  const topics = ['generation', 'welcome', 'daily', 'rewarded', 'ads', 'watermark'];
  function create({ controllers, onReminders }) {
    const $ = id => document.getElementById(id), search = $('settings-search');
    const buttons = topics.map(id => $(`settings-tab-${id}`));
    const panels = topics.map(id => $(`settings-section-${id}`));
    const groups = [...$('settings-topic-list').querySelectorAll('.settings-topic-group')];
    const loaded = new Set(); let active = 'welcome';
    const words = () => search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const matches = (button, tokens) => tokens.every(word => `${button.textContent} ${button.dataset.settingsKeywords}`.toLowerCase().includes(word));
    function render() {
      const tokens = words();
      for (const button of buttons) button.hidden = !matches(button, tokens);
      for (const group of groups) group.hidden = ![...group.querySelectorAll('[data-settings-topic]')].some(button => !button.hidden);
      const visible = buttons.filter(button => !button.hidden);
      const none = visible.length === 0;
      if (!none && !visible.some(button => button.dataset.settingsTopic === active)) active = visible[0].dataset.settingsTopic;
      $('settings-no-results').hidden = !none; $('settings-search-empty').hidden = !none;
      for (let i = 0; i < buttons.length; i++) {
        const selected = !none && topics[i] === active;
        buttons[i].setAttribute('aria-selected', String(selected)); buttons[i].tabIndex = selected ? 0 : -1;
        panels[i].hidden = !selected;
      }
      if (!none && tokens.length) {
        for (const detail of $(`settings-section-${active}`).querySelectorAll('[data-settings-keywords]')) {
          if (tokens.some(word => detail.dataset.settingsKeywords.includes(word))) detail.open = true;
        }
      }
      return !none;
    }
    async function load() {
      if (loaded.has(active)) return;
      const id = active; loaded.add(id);
      // Existing controllers retain revisions, busy guards, errors and save behavior.
      // Never refresh a previously opened form just because the team switches categories.
      try { await controllers[id].refresh(); } catch { loaded.delete(id); }
    }
    async function select(id, { clearSearch = false, detail } = {}) {
      if (!topics.includes(id)) return;
      if (clearSearch) search.value = '';
      active = id;
      if (!render()) return;
      if (detail) { const target = $(detail); if (target && panels[topics.indexOf(id)].contains(target)) target.open = true; }
      await load();
    }
    async function open() { if (render()) await load(); }
    async function refresh() { if (render()) { loaded.add(active); await controllers[active].refresh(); } }
    function reset() { active = 'welcome'; loaded.clear(); search.value = ''; render(); }
    search.addEventListener('input', () => { void open(); });
    $('settings-clear-search').addEventListener('click', () => { search.value = ''; void open(); search.focus(); });
    for (const button of buttons) {
      button.addEventListener('click', () => { void select(button.dataset.settingsTopic); });
      button.addEventListener('keydown', event => {
        if (!['ArrowDown','ArrowUp','ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
        const visible = buttons.filter(item => !item.hidden); if (!visible.length) return;
        event.preventDefault(); const current = visible.indexOf(button);
        const index = event.key === 'Home' ? 0 : event.key === 'End' ? visible.length - 1 :
          (current + (['ArrowDown','ArrowRight'].includes(event.key) ? 1 : -1) + visible.length) % visible.length;
        visible[index].focus(); void select(visible[index].dataset.settingsTopic);
      });
    }
    for (const link of $('app-settings-panel').querySelectorAll('[data-settings-open]'))
      link.addEventListener('click', () => { void select(link.dataset.settingsOpen, { clearSearch: true, detail: link.dataset.settingsDetail }); });
    for (const link of $('app-settings-panel').querySelectorAll('[data-settings-reminders]')) link.addEventListener('click', onReminders);
    $('app-settings-panel').addEventListener('invalid', event => {
      // Native form validation must be able to reveal and focus an invalid field.
      const detail = event.target.closest('details'); if (detail) detail.open = true;
    }, true);
    render(); return { open, refresh, reset, select };
  }
  window.MaddsSettingsNavigation = { create };
})();
