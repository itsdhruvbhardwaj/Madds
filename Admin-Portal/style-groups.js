(() => {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  function move(members, from, to) {
    if (from < 0 || to < 0 || from >= members.length || to >= members.length) return members;
    const result = members.slice(); result.splice(to, 0, result.splice(from, 1)[0]); return result;
  }
  function create({ api, notify, getCatalog, onChange = () => {}, selectStyles, onSaved = () => {} }) {
    const $ = id => document.getElementById(id);
    let groups = [], available = false, editing = null, members = [], cover = '', busy = false, baseline = '', revision = 0, dragged = -1;
    const dialog = $('style-group-dialog'), form = $('style-group-form');
    const style = id => getCatalog().styles.find(item => item.id === id);
    const owner = id => groups.find(group => group.members.some(member => member.styleId === id));
    const snapshot = () => JSON.stringify({ name: $('style-group-name').value, published: $('style-group-published').checked, members, cover });
    function tab(show) {
      $('style-list-view').hidden = show; $('style-groups-view').hidden = !show;
      $('styles-tab').setAttribute('aria-pressed', String(!show)); $('groups-tab').setAttribute('aria-pressed', String(show));
      $('add-style').hidden = show;
      $('create-style-group').hidden = show;
    }
    function render() {
      $('new-style-group').disabled = !available || busy;
      $('style-groups-status').textContent = !available ? 'Groups require the updated backend. Individual styles remain available.' : `${groups.length} groups · ${getCatalog().styles.length} individual styles. Publishing groups does not verify their members.`;
      $('style-groups-list').innerHTML = groups.map(group => `<article class="studio-group-card"><img src="${esc(style(group.coverStyleId)?.thumbnail || '')}" alt=""><div><h3>${esc(group.name)}</h3><p>${group.members.length} variants · ${group.published ? 'Published' : 'Draft'}</p><button type="button" class="button secondary" data-edit-group="${esc(group.id)}">Edit group</button></div></article>`).join('') || '<p class="muted">Group closely related looks so customers browse one card and choose a variant.</p>';
      $('style-groups-list').querySelectorAll('[data-edit-group]').forEach(button => button.onclick = () => open(groups.find(group => group.id === button.dataset.editGroup)));
      getCatalog().groups = groups; getCatalog().groupsAvailable = available;
    }
    async function refresh() {
      const ticket = ++revision;
      try { const data = await api('/api/admin/catalog/groups'); if (ticket !== revision) return; groups = data.groups || []; available = true; }
      catch { if (ticket !== revision) return; available = false; }
      render(); onChange();
    }
    function renderEditor() {
      $('group-member-count').textContent = `${members.length} / 8 variants · drag or use arrows to reorder`;
      $('group-member-list').innerHTML = members.map((member, index) => {
        const entry = style(member.styleId);
        return `<div class="group-member-row" draggable="true" data-member-index="${index}"><span aria-hidden="true">⠿</span><img src="${esc(entry?.thumbnail || '')}" alt=""><div class="group-member-main"><strong>${esc(entry?.name || 'Unavailable style')}</strong><small>${entry ? entry.verified ? 'Verified' : 'Unverified — hidden from customers' : 'Remove or replace this missing member'}</small><input data-member-label="${index}" aria-label="Variant label for ${esc(entry?.name || member.styleId)}" maxlength="40" placeholder="Short label (optional)" value="${esc(member.label)}"></div><div class="group-member-actions"><label><input type="radio" name="groupCover" data-cover="${esc(member.styleId)}" ${cover === member.styleId ? 'checked' : ''}>Cover</label><button type="button" data-move-up="${index}" aria-label="Move ${esc(entry?.name)} up" ${index === 0 ? 'disabled' : ''}>↑</button><button type="button" data-move-down="${index}" aria-label="Move ${esc(entry?.name)} down" ${index === members.length - 1 ? 'disabled' : ''}>↓</button><button type="button" data-remove-member="${index}">Remove from group</button></div></div>`;
      }).join('');
      $('group-member-list').querySelectorAll('[data-member-label]').forEach(input => input.oninput = () => { members[Number(input.dataset.memberLabel)].label = input.value; });
      $('group-member-list').querySelectorAll('[data-cover]').forEach(input => input.onchange = () => { cover = input.dataset.cover; preview(); });
      for (const [attribute, offset] of [['data-move-up', -1], ['data-move-down', 1]]) $('group-member-list').querySelectorAll(`[${attribute}]`).forEach(button => button.onclick = () => { const index = Number(button.getAttribute(attribute)); members = move(members, index, index + offset); renderEditor(); });
      $('group-member-list').querySelectorAll('[data-remove-member]').forEach(button => button.onclick = () => { const [removed] = members.splice(Number(button.dataset.removeMember), 1); if (cover === removed.styleId) cover = members[0]?.styleId || ''; renderEditor(); });
      $('group-member-list').querySelectorAll('[data-member-index]').forEach(row => {
        row.ondragstart = event => { if (event.target.closest('input,button')) { event.preventDefault(); return; } dragged = Number(row.dataset.memberIndex); };
        row.ondragover = event => event.preventDefault(); row.ondrop = event => { event.preventDefault(); members = move(members, dragged, Number(row.dataset.memberIndex)); dragged = -1; renderEditor(); };
      });
      candidates(); preview();
    }
    function candidates() {
      const query = $('group-member-search').value.trim().toLowerCase();
      const found = getCatalog().styles.filter(entry => !members.some(member => member.styleId === entry.id) && (!query || `${entry.name} ${(entry.tags || []).join(' ')}`.toLowerCase().includes(query))).slice(0, 20);
      $('group-member-candidates').innerHTML = found.map(entry => { const assigned = owner(entry.id); const blocked = assigned && assigned.id !== editing?.id;
        return `<button type="button" class="group-candidate" data-add-member="${esc(entry.id)}" ${blocked || members.length >= 8 ? 'disabled' : ''}><img src="${esc(entry.thumbnail || '')}" alt="" loading="lazy"><span>${esc(entry.name)}<small>${blocked ? `Already in ${esc(assigned.name)}` : entry.verified ? 'Verified · Add' : 'Unverified · Add'}</small></span></button>`;
      }).join('');
      $('group-member-candidates').querySelectorAll('[data-add-member]').forEach(button => button.onclick = () => { members.push({ styleId: button.dataset.addMember, label: '' }); cover ||= button.dataset.addMember; renderEditor(); });
    }
    function preview() {
      const entry = style(cover);
      $('group-card-preview').innerHTML = `<p class="field-hint">Customer card preview</p><div class="group-cover-preview">${entry?.thumbnail ? `<img src="${esc(entry.thumbnail)}" alt="Group cover">` : ''}<strong>${esc($('style-group-name').value || 'Group name')}<small>${members.filter(member => style(member.styleId)?.verified).length} verified looks</small></strong></div>`;
    }
    function open(group = null, ids = []) {
      if (!available || busy) return;
      if (!group && ids.some(id => owner(id))) { notify('Some selected styles already belong to a group. Edit that group from the Groups tab.', true); return; }
      editing = group; members = group ? group.members.map(member => ({ ...member })) : ids.map(id => ({ styleId: id, label: '' }));
      cover = group?.coverStyleId || members[0]?.styleId || '';
      $('style-group-name').value = group?.name || ''; $('style-group-published').checked = group?.published || false;
      $('group-member-search').value = ''; $('style-group-error').textContent = '';
      $('ungroup-styles').hidden = !group; renderEditor(); baseline = snapshot(); dialog.showModal();
    }
    function close() { if (busy) return; if (baseline !== snapshot() && !window.confirm('Discard the unsaved group changes?')) return; dialog.close(); }
    function setBusy(value) { busy = value; form.querySelectorAll('input,button').forEach(input => input.disabled = value); render(); if (!value) renderEditor(); }
    $('styles-tab').onclick = () => tab(false); $('groups-tab').onclick = () => { tab(true); void refresh(); };
    $('new-style-group').onclick = () => { if (selectStyles) { tab(false); selectStyles(); } else open(); }; $('close-style-group').onclick = close; $('cancel-style-group').onclick = close;
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    $('style-group-name').oninput = preview; $('group-member-search').oninput = candidates;
    form.onsubmit = async event => {
      event.preventDefault(); if (busy) return;
      if (members.length < 2 || members.length > 8 || !members.some(member => member.styleId === cover)) { $('style-group-error').textContent = 'Choose 2–8 variants and a cover from those variants.'; return; }
      const body = { name: $('style-group-name').value, published: $('style-group-published').checked, members, coverStyleId: cover, ...(editing ? { expectedUpdatedAt: editing.updatedAt } : {}) };
      setBusy(true); $('style-group-error').textContent = '';
      try { await api(`/api/admin/catalog/groups${editing ? `/${encodeURIComponent(editing.id)}` : ''}`, { method: editing ? 'PUT' : 'POST', body: JSON.stringify(body) }); dialog.close(); onSaved(); await refresh(); notify('Group saved. Each variant keeps its original prompt and style ID.'); }
      catch (error) { $('style-group-error').textContent = error.message; }
      finally { setBusy(false); }
    };
    $('ungroup-styles').onclick = async () => {
      if (!editing || busy) return;
      setBusy(true);
      try { await api(`/api/admin/catalog/groups/${encodeURIComponent(editing.id)}`, { method: 'DELETE', body: JSON.stringify({ expectedUpdatedAt: editing.updatedAt }) }); dialog.close(); await refresh(); notify('Group archived. All original styles and photos are kept.'); }
      catch (error) { $('style-group-error').textContent = error.message; }
      finally { setBusy(false); }
    };
    return { refresh, render, openNew: ids => open(null, ids), membership: id => owner(id)?.name || '', reset() { ++revision; groups = []; available = false; dialog.close(); tab(false); render(); } };
  }
  window.MaddsStyleGroups = { create, move };
})();
