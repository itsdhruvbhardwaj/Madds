(() => {
  function create({ api, notify }) {
    const $ = id => document.getElementById(id);
    const base = '/api/admin/settings/rewarded-credits';
    const form = $('rewarded-credits-form'), input = form.elements.credits;
    let epoch = 0, revision = null, saved = null, busy = false, loading = false;
    function controls() {
      input.disabled = busy || loading || revision === null;
      $('rewarded-credits-save').disabled = busy || loading || revision === null || !input.value.trim() || Number(input.value) === saved;
      $('rewarded-credits-save').ariaBusy = String(busy);
      $('rewarded-credits-refresh').disabled = busy || loading;
      $('rewarded-credits-refresh').ariaBusy = String(loading);
    }
    function accept(data) {
      if (!Number.isSafeInteger(data.revision) || data.revision < 0 || (data.credits !== null && (!Number.isSafeInteger(data.credits) || data.credits < 1 || data.credits > 100000))) throw Error('The server returned an invalid ad reward. Refresh and try again.');
      revision = data.revision; saved = data.credits; input.value = saved === null ? '' : String(saved);
      $('rewarded-credits-current').textContent = saved === null ? 'No valid server default is configured.' : `Current reward: ${saved} ${saved === 1 ? 'credit' : 'credits'} per completed rewarded ad`;
      $('rewarded-credits-editor').textContent = data.updatedAt ? `Last changed by ${data.updatedByName || 'Team member'} · ${window.MaddsDates.dateTime(data.updatedAt)}` : 'Using the existing server default. No Workspace override saved yet.';
    }
    async function refresh() {
      if (busy || loading) return;
      if (revision !== null && input.value !== (saved === null ? '' : String(saved)) && !window.confirm('Discard your unsaved ad-reward change and refresh?')) return;
      const owner = epoch; loading = true; controls(); $('rewarded-credits-error').textContent = '';
      try { const data = await api(base); if (owner === epoch) accept(data); }
      catch (error) { if (owner === epoch) { revision = null; $('rewarded-credits-error').textContent = error.message; } }
      finally { if (owner === epoch) { loading = false; controls(); } }
    }
    async function save(event) {
      event.preventDefault(); if (busy || loading || revision === null) return;
      const credits = Number(input.value);
      if (!/^\d+$/.test(input.value.trim()) || !Number.isSafeInteger(credits) || credits < 1 || credits > 100000) {
        $('rewarded-credits-error').textContent = 'Enter a whole number from 1 to 100,000. To turn rewarded ads off, use Ad placements.'; return;
      }
      if (credits === saved) return;
      const owner = epoch; busy = true; controls(); $('rewarded-credits-error').textContent = '';
      try {
        const data = await api(base, { method: 'PATCH', body: JSON.stringify({ credits, expectedRevision: revision }) });
        if (owner !== epoch) return;
        accept(data); notify('Ad reward saved. Applies to newly started rewarded ads.');
      } catch (error) { if (owner === epoch) $('rewarded-credits-error').textContent = error.message; }
      finally { if (owner === epoch) { busy = false; controls(); } }
    }
    input.addEventListener('input', controls); form.addEventListener('submit', save); $('rewarded-credits-refresh').addEventListener('click', refresh);
    function reset() {
      ++epoch; revision = null; saved = null; busy = false; loading = false; input.value = '';
      for (const id of ['rewarded-credits-current', 'rewarded-credits-error', 'rewarded-credits-editor']) $(id).textContent = '';
      controls();
    }
    controls(); return { refresh, reset, hasPendingChanges: () => busy || loading || (revision !== null && input.value !== (saved === null ? '' : String(saved))) };
  }
  window.MaddsRewardedCredits = { create };
})();
