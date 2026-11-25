(() => {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  function normalize(value, aliases = {}) {
    const tag = String(value).normalize('NFKC').toLowerCase().trim().replace(/\s+/gu, ' ');
    return Object.hasOwn(aliases, tag) ? aliases[tag] : tag;
  }
  function parse(value, config = {}) {
    const values = Array.isArray(value) ? value : String(value).split(',');
    const tags = [...new Set(values.map(tag => normalize(tag, config.aliases)).filter(Boolean))];
    if (tags.some(tag => tag.length > (config.maxTagLength || 40) || !/^[\p{L}\p{N}]+(?:[ '-][\p{L}\p{N}]+)*$/u.test(tag))) throw Error('Use tags of up to 40 characters with letters, numbers, spaces, hyphens or apostrophes.');
    if (tags.length > (config.maxTags || 10)) throw Error('Use no more than 10 tags per style.');
    return tags;
  }
  function searchable(value, aliases) {
    return String(value || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(/\s+/u).map(word => normalize(word, aliases)).join(' ');
  }
  function matches(style, query, aliases = {}) {
    const fields = searchable([style.id, style.name, style.description, style.prompt, ...(style.tags || []), ...(style.collections || [])].join(' '), aliases).split(' ');
    return searchable(query, aliases).split(' ').filter(Boolean).every(term => fields.some(word => word.startsWith(term)));
  }
  function create({ getCatalog }) {
    const $ = id => document.getElementById(id);
    let tags = [], busy = false;
    const input = $('style-tag-input'), hidden = $('style-tag-value');
    function refresh() {
      const config = getCatalog().tagging;
      input.disabled = busy || config?.version !== 1;
      $('style-tag-add').disabled = input.disabled;
      $('style-tag-count').textContent = `${tags.length} / ${config?.maxTags || 10} tags`;
      $('style-tags-availability').textContent = config?.version === 1 ? '' : 'Tag editing becomes available when the updated backend is deployed.';
      $('style-tag-chips').innerHTML = tags.map((tag, index) => `<span class="style-tag-chip">${esc(tag)}<button type="button" data-remove-tag="${index}" aria-label="Remove tag ${esc(tag)}" ${busy || !config ? 'disabled' : ''}>×</button></span>`).join('');
      $('style-tag-chips').querySelectorAll('[data-remove-tag]').forEach(button => button.onclick = () => {
        tags.splice(Number(button.dataset.removeTag), 1); hidden.value = JSON.stringify(tags); refresh(); input.focus();
      });
      const suggestions = [...new Set([...(config?.suggestions || []), ...getCatalog().styles.flatMap(style => style.tags || [])])].sort();
      $('style-tag-suggestions').innerHTML = suggestions.map(tag => `<option value="${esc(tag)}"></option>`).join('');
    }
    function commit() {
      if (!input.value.trim()) return true;
      if (busy || getCatalog().tagging?.version !== 1) return false;
      try {
        tags = parse([...tags, ...input.value.split(',')], getCatalog().tagging);
        hidden.value = JSON.stringify(tags); input.value = ''; $('style-tags-error').textContent = ''; refresh(); return true;
      } catch (error) { $('style-tags-error').textContent = error.message; return false; }
    }
    $('style-tag-add').onclick = () => { commit(); input.focus(); };
    input.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ',') { event.preventDefault(); commit(); } });
    input.addEventListener('input', () => { $('style-tags-error').textContent = ''; });
    return { refresh, commit, getValue: () => [...tags], setBusy(value) { busy = value; refresh(); },
      setValue(value) { tags = parse(value || [], getCatalog().tagging || {}); hidden.value = JSON.stringify(tags); input.value = ''; $('style-tags-error').textContent = ''; refresh(); } };
  }
  window.MaddsStyleTags = { create, parse, normalize, matches };
})();
