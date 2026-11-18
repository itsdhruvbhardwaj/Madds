(() => {
  const models = { sunburst25: 'Sunburst 2.5', sunburst26: 'Sunburst 2.6' };
  const qualities = ['auto','low','medium','high','xhigh','max'];
  function create({ api, notify }) {
    const $ = id => document.getElementById(id), form = $('image-generation-form');
    const model = form.elements.activeModel, quality = form.elements.quality, complexity = form.elements.complexity;
    const file = $('image-generation-photo'), prompt = $('image-generation-prompt'), result = $('image-generation-result');
    const base = '/api/admin/settings/image-generation';
    let epoch = 0, revision = null, draft = null, saved = '', busy = false, loading = false, canTest = false;
    let testToken = null, tested = '', expires = 0;
    const snapshot = () => JSON.stringify(draft);
    const dirty = () => draft !== null && snapshot() !== saved;
    function clearTest() {
      testToken = null; tested = ''; expires = 0; result.hidden = true; result.removeAttribute('src');
      $('image-generation-test-status').textContent = '';
    }
    function controls() {
      const locked = busy || loading || revision === null;
      for (const input of [model, quality, complexity, file, prompt]) input.disabled = locked;
      $('image-generation-complexity').hidden = model.value !== 'sunburst26';
      complexity.disabled = locked || model.value !== 'sunburst26';
      $('image-generation-refresh').disabled = busy || loading;
      $('image-generation-refresh').setAttribute('aria-busy', String(loading));
      $('image-generation-test').disabled = locked || !canTest || !file.files?.length || !prompt.value.trim();
      $('image-generation-test').setAttribute('aria-busy', String(busy));
      $('image-generation-save').disabled = locked || !dirty() || !testToken || tested !== snapshot() || Date.now() >= expires;
      $('image-generation-save').setAttribute('aria-busy', String(busy));
    }
    function paint() {
      if (draft) { model.value = draft.activeModel; quality.value = draft.profiles[draft.activeModel].quality; complexity.value = draft.profiles.sunburst26.complexity; }
      controls();
    }
    function accept(data) {
      if (!Object.hasOwn(models, data.activeModel) || !Number.isSafeInteger(data.revision) || data.revision < 0 ||
          !qualities.includes(data.profiles?.sunburst25?.quality) || !qualities.includes(data.profiles?.sunburst26?.quality) ||
          !['low','medium','high'].includes(data.profiles?.sunburst26?.complexity)) throw Error('Invalid image settings returned. Refresh and try again.');
      draft = { activeModel: data.activeModel, profiles: { sunburst25: { quality: data.profiles.sunburst25.quality },
        sunburst26: { quality: data.profiles.sunburst26.quality, complexity: data.profiles.sunburst26.complexity } } };
      revision = data.revision; saved = snapshot(); canTest = data.canTest === true; clearTest();
      const current = Object.keys(models).map(k => [k, `openai/gpt-image-${k === 'sunburst25' ? '2.5' : '2.6'}-sunburst`]).find(([, slug]) => slug === data.effective?.model)?.[0];
      $('image-generation-current').textContent = `Live configuration: ${current ? models[current] : 'Server default'}${data.effective?.quality ? ' · ' + data.effective.quality + ' quality' : ''}${data.effective?.complexity ? ' · ' + data.effective.complexity + ' complexity' : ''}`;
      $('image-generation-editor').textContent = data.updatedAt
        ? `Last applied by ${data.updatedByName || 'Owner'} · ${window.MaddsDates.dateTime(data.updatedAt)}`
        : 'Using the Render configuration. Applying here creates a Workspace override for app and Studio generations.';
      $('image-generation-availability').textContent = canTest ? '' : 'An owner must configure OpenRouter on the backend before testing or applying settings.';
      const history = $('image-generation-history'); history.replaceChildren();
      for (const change of (data.history || []).slice().reverse()) {
        const row = document.createElement('p'); row.className = 'field-hint';
        row.textContent = `${models[change.activeModel] || 'Model'} · ${change.quality}${change.complexity ? ' / ' + change.complexity : ''} — ${change.byName || 'Owner'} · ${window.MaddsDates.dateTime(change.at)}`;
        history.append(row);
      }
      $('image-generation-history-section').hidden = !(data.history || []).length;
      paint();
    }
    async function refresh() {
      if (busy || loading) return;
      if (dirty() && !window.confirm('Discard your unsaved image generation settings and refresh?')) return;
      const owner = epoch; loading = true; controls(); $('image-generation-error').textContent = '';
      try { const data = await api(base); if (owner === epoch) accept(data); }
      catch (error) { if (owner === epoch) { revision = null; clearTest(); $('image-generation-error').textContent = error.message; } }
      finally { if (owner === epoch) { loading = false; controls(); } }
    }
    async function test() {
      if (busy || loading || revision === null || !canTest || !file.files?.length || !prompt.value.trim()) return;
      const photo = file.files[0];
      if (!['image/jpeg','image/png','image/webp'].includes(photo.type) || photo.size > 10 * 1024 * 1024) {
        $('image-generation-error').textContent = 'Choose one JPG, PNG or WebP photo up to 10 MB.'; return;
      }
      const owner = epoch, testedDraft = snapshot(); busy = true; clearTest(); controls(); $('image-generation-error').textContent = '';
      const body = new FormData(); body.append('image', photo); body.append('prompt', prompt.value.trim());
      body.append('settings', JSON.stringify({ ...draft, expectedRevision: revision }));
      try {
        const data = await api(base + '/test', { method: 'POST', body });
        if (owner !== epoch || snapshot() !== testedDraft) return;
        if (typeof data.testToken !== 'string' || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(data.image || '')) throw Error('The preview response was invalid. Settings were not applied.');
        testToken = data.testToken; tested = testedDraft; expires = Date.now() + 14 * 60_000;
        result.src = data.image; result.hidden = false;
        $('image-generation-test-status').textContent = 'Preview completed. Review the image, then apply these settings within 15 minutes.';
      } catch (error) { if (owner === epoch) $('image-generation-error').textContent = error.message; }
      finally { if (owner === epoch) { busy = false; controls(); } }
    }
    async function save(event) {
      event.preventDefault();
      if (busy || loading || revision === null || !dirty()) return;
      if (!testToken || tested !== snapshot() || Date.now() >= expires) { clearTest(); controls(); $('image-generation-error').textContent = 'Test these settings before applying.'; return; }
      const owner = epoch; busy = true; controls(); $('image-generation-error').textContent = '';
      try {
        const data = await api(base, { method: 'PATCH', body: JSON.stringify({ ...draft, expectedRevision: revision, testToken }) });
        if (owner !== epoch) return;
        accept(data); notify('Image settings applied. New generations will use this configuration.');
      } catch (error) { if (owner === epoch) { clearTest(); $('image-generation-error').textContent = error.message; } }
      finally { if (owner === epoch) { busy = false; controls(); } }
    }
    model.addEventListener('change', () => { if (!draft) return; draft.activeModel = model.value; clearTest(); paint(); });
    quality.addEventListener('change', () => { if (!draft) return; draft.profiles[draft.activeModel].quality = quality.value; clearTest(); controls(); });
    complexity.addEventListener('change', () => { if (!draft || draft.activeModel !== 'sunburst26') return; draft.profiles.sunburst26.complexity = complexity.value; clearTest(); controls(); });
    for (const input of [file,prompt]) input.addEventListener('input', () => { clearTest(); controls(); });
    $('image-generation-refresh').addEventListener('click', refresh); $('image-generation-test').addEventListener('click', test); form.addEventListener('submit', save);
    function reset() {
      ++epoch; revision = null; draft = null; saved = ''; busy = false; loading = false; canTest = false; clearTest();
      file.value = ''; prompt.value = ''; model.value = 'sunburst26'; quality.value = 'medium'; complexity.value = 'high';
      for (const id of ['image-generation-current','image-generation-editor','image-generation-error','image-generation-availability']) $(id).textContent = '';
      $('image-generation-history').replaceChildren(); $('image-generation-history-section').hidden = true; controls();
    }
    reset(); return { refresh, reset, hasPendingChanges: () => busy || loading || dirty() };
  }
  window.MaddsImageGeneration = { create };
})();
