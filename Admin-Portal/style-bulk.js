(() => {
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  function create({ api, notify, getCatalog, reload, groupSelected }) {
    const $ = id => document.getElementById(id);
    let selected = new Set(), filteredIds = new Set(), busy = false, active = false, grouping = false;
    const assigned = id => (getCatalog().groups || []).find(group => group.members.some(member => member.styleId === id));
    function toggle(id) {
      if (!active || busy) return false;
      if (!getCatalog().styles.some(style => style.id === id)) return true;
      if (grouping && assigned(id)) { notify('This style already belongs to a group. Edit that group to change its members.', true); return true; }
      if (selected.has(id)) selected.delete(id);
      else {
        if (grouping && selected.size >= 8) { notify('A group can contain up to 8 styles. Deselect a style first.', true); return true; }
        selected.add(id);
      }
      update(); return true;
    }
    function update() {
      $("style-bulk-controls").setAttribute("aria-busy", String(busy));
      $("style-bulk-panel").hidden = !active || grouping;
      $("style-bulk-toggle").disabled = busy;
      $("style-bulk-toggle").setAttribute("aria-expanded", String(active && !grouping));
      $("style-bulk-toggle-hint").textContent = grouping ? "Switch to bulk actions ⌄" : active ? "Selection mode on · Collapse ⌃" : "Expand to select styles ⌄";
      $("styles-grid").querySelectorAll(".style-select-label").forEach(label => label.hidden = !active);
      $("style-selection-count").textContent = `${selected.size} of ${filteredIds.size} filtered styles selected`;
      $('create-style-group').disabled = busy || !getCatalog().groupsAvailable;
      $('create-style-group').textContent = grouping ? 'Cancel grouping' : 'Create group';
      $('create-style-group').setAttribute('aria-pressed', String(grouping));
      $('style-group-selection').hidden = !grouping;
      $('style-group-selection-count').textContent = `${selected.size} / 8 styles selected`;
      $('style-group-selection-create').disabled = busy || selected.size < 2 || selected.size > 8 || !getCatalog().groupsAvailable;
      $('style-group-selection-hint').textContent = selected.size < 2 ? 'Select at least 2 similar styles by clicking their cards.' : 'Ready to group. Your selections stay selected when you filter or search.';
      $('styles-grid').classList.toggle('is-selecting-styles', active);
      $('styles-grid').classList.toggle('is-grouping-styles', grouping);
      $('style-group-selection-preview').innerHTML = [...selected].map(id => {
        const style = getCatalog().styles.find(s => s.id === id);
        return `<button type="button" data-unselect-style="${esc(id)}" aria-label="Remove ${esc(style?.name || 'style')} from selection" title="${esc(style?.name || '')}"><img src="${esc(style?.thumbnail || '')}" alt=""><span aria-hidden="true">×</span></button>`;
      }).join('');
      $('style-group-selection-preview').querySelectorAll('[data-unselect-style]').forEach(button => button.onclick = () => toggle(button.dataset.unselectStyle));
      for (const id of ["style-bulk-verify", "style-bulk-unverify"]) {
        $(id).disabled = busy || !selected.size;
        $(id).title = !selected.size ? "Select styles first" : "";
      }
      for (const id of ["style-select-all", "style-select-clear"]) $(id).disabled = busy;
      if ($('style-bulk-tags')) $('style-bulk-tags').disabled = busy || !selected.size || getCatalog().tagging?.version !== 1;
      if ($('bulk-style-tags')) $('bulk-style-tags').disabled = busy || getCatalog().tagging?.version !== 1;
      if ($('style-bulk-group')) $('style-bulk-group').disabled = busy || selected.size < 2 || selected.size > 8 || !getCatalog().groupsAvailable;
      $("styles-grid").querySelectorAll("[data-bulk-style]").forEach(input => {
        const group = grouping && assigned(input.dataset.bulkStyle);
        input.checked = selected.has(input.dataset.bulkStyle); input.disabled = busy || !!group;
        const card = input.closest('article'); card.classList.toggle('is-bulk-selected', input.checked); card.classList.toggle('is-group-unavailable', !!group);
        input.closest('label').querySelector('span').textContent = group ? 'Already grouped' : input.checked ? 'Selected' : 'Select';
        card.querySelectorAll('[data-edit], [data-delete]').forEach(button => button.disabled = grouping || busy);
      });
    }
    function catalogChanged(filtered) {
      if (filtered) filteredIds = new Set(filtered.map(style => style.id));
      selected = new Set([...selected].filter(id => grouping
        ? getCatalog().styles.some(style => style.id === id) && !assigned(id)
        : filteredIds.has(id)));
      update();
    }
    function decorateCards() {
      $("styles-grid").querySelectorAll("article[data-style-open]").forEach(card => {
        const label = document.createElement("label"); label.className = "style-select-label";
        label.innerHTML = `<input type="checkbox" data-bulk-style="${esc(card.dataset.styleOpen)}" aria-label="Select ${esc(getCatalog().styles.find(s => s.id === card.dataset.styleOpen)?.name || "style")}"><span>Select</span>`;
        card.prepend(label);
      }); update();
    }
    async function save(verified) {
      if (busy || !active || !selected.size) return;
      const ids = [...selected].filter(id => filteredIds.has(id));
      if (!ids.length) return;
      if (!window.confirm(`Mark ${ids.length} selected styles as ${verified ? "verified" : "unverified"}?\n${verified ? "They will become visible in the app and website." : "They will be hidden from the app and website."}`)) return;
      busy = true; update();
      try {
        const result = await api("/api/admin/catalog/styles/verification", { method: "PATCH", body: JSON.stringify({ ids, verified }) });
        selected.clear();
        notify(`${result.changed} styles marked ${verified ? "verified" : "unverified"}.`);
        await reload();
      } catch (error) { notify(error.message, true); }
      finally { busy = false; update(); }
    }
    $("style-bulk-toggle").onclick = () => {
      if (busy) return;
      if (grouping) { grouping = false; selected.clear(); active = false; }
      active = !active;
      if (!active) selected.clear();
      catalogChanged();
    };
    $("style-select-all").onclick = () => { if (!busy && active) { selected = new Set(filteredIds); update(); } };
    $("style-select-clear").onclick = () => { if (!busy) { selected.clear(); update(); } };
    $("styles-grid").addEventListener("change", e => {
      const id = e.target.dataset.bulkStyle; if (!id || busy) return;
      toggle(id);
    });
    $("style-bulk-verify").onclick = () => save(true); $("style-bulk-unverify").onclick = () => save(false);
    if ($('style-bulk-group')) $('style-bulk-group').onclick = () => { if (!busy && selected.size >= 2 && selected.size <= 8 && getCatalog().groupsAvailable) groupSelected([...selected]); };
    function startGrouping() {
      if (busy || !getCatalog().groupsAvailable) return;
      grouping = true; active = true; selected = new Set([...selected].filter(id => !assigned(id)).slice(0,8));
      catalogChanged();
    }
    function finishGrouping() { grouping = false; active = false; selected.clear(); update(); }
    $('create-style-group').onclick = () => grouping ? finishGrouping() : startGrouping();
    $('style-group-selection-cancel').onclick = finishGrouping;
    $('style-group-selection-create').onclick = () => {
      if (!busy && grouping && selected.size >= 2 && selected.size <= 8 && getCatalog().groupsAvailable) groupSelected([...selected]);
    };
    if ($('style-bulk-tags')) $('style-bulk-tags').onclick = async () => {
      if (busy || !active || !selected.size || getCatalog().tagging?.version !== 1) return;
      let tags;
      try { tags = window.MaddsStyleTags.parse($('bulk-style-tags').value, getCatalog().tagging); }
      catch (error) { notify(error.message, true); return; }
      if (!tags.length) { notify('Enter at least one tag to add.', true); return; }
      busy = true; update();
      try {
        const result = await api('/api/admin/catalog/styles/tags', { method: 'PATCH', body: JSON.stringify({ ids: [...selected].filter(id => filteredIds.has(id)), tags }) });
        selected.clear(); $('bulk-style-tags').value = '';
        notify(`Tags added to ${result.changed} styles. Existing tags were kept.`);
        await reload();
      } catch (error) { notify(error.message, true); }
      finally { busy = false; update(); }
    };
    update();
    return { catalogChanged, decorateCards, handleCardClick: toggle, startGrouping, finishGrouping,
      reset() { active = false; grouping = false; selected.clear(); filteredIds.clear(); update(); } };
  }
  window.MaddsStyleBulk = { create };
})();
