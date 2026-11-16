(() => {
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
  function create({ api, notify }) {
    const $ = id => document.getElementById(id), form = $('daily-rewards-form');
    let epoch = 0, revision = null, saved = '', busy = false, loading = false, maximum = 10;
    const snapshot = () => JSON.stringify({ enabled: form.elements.enabled.checked, credits: form.elements.credits.value });
    function controls() {
      for (const field of [form.elements.enabled, form.elements.credits]) field.disabled = busy || loading || revision === null;
      $('daily-rewards-save').disabled = busy || loading || revision === null || saved === snapshot();
      $('daily-rewards-refresh').disabled = busy || loading;
      $('daily-rewards-save').ariaBusy = String(busy); $('daily-rewards-refresh').ariaBusy = String(loading);
    }
    function accept(data) {
      if (typeof data.enabled !== 'boolean' || !Number.isSafeInteger(data.credits) || !Number.isSafeInteger(data.revision) || !Number.isSafeInteger(data.maximum) || data.credits < 1 || data.maximum < 1) throw Error('Daily reward settings are invalid. Refresh and try again.');
      revision = data.revision; maximum = data.maximum; form.elements.enabled.checked = data.enabled;
      form.elements.credits.value = String(data.credits); form.elements.credits.max = String(maximum); saved = snapshot();
      $('daily-rewards-current').textContent = `${data.enabled ? 'Enabled' : 'Disabled'} · ${data.credits} credits per account per day. Server limit: ${maximum}.`;
      $('daily-rewards-editor').textContent = data.updatedAt ? `Last changed by ${data.updatedByName || 'Team member'} · ${window.MaddsDates.dateTime(data.updatedAt)}` : 'Default: 2 credits, disabled until you enable it.';
      $('daily-rewards-history').innerHTML = (data.history || []).map(entry => `<p>${escape(window.MaddsDates.dateTime(entry.createdAt))} · ${escape(entry.actorName || entry.actorEmail)}<br><small>${entry.previous.enabled ? 'On' : 'Off'} · ${escape(entry.previous.credits)} credits → ${entry.next.enabled ? 'On' : 'Off'} · ${escape(entry.next.credits)} credits</small></p>`).join('') || '<p class="field-hint">No daily reward changes yet.</p>';
    }
    async function refresh() {
      if (busy || loading) return;
      if (revision !== null && saved !== snapshot() && !window.confirm('Discard your unsaved daily reward changes?')) return;
      const owner = epoch; loading = true; controls(); $('daily-rewards-error').textContent = '';
      try { const data = await api('/api/admin/settings/daily-rewards'); if (owner === epoch) accept(data); }
      catch (error) { if (owner === epoch) { revision = null; $('daily-rewards-error').textContent = error.message; } }
      finally { if (owner === epoch) { loading = false; controls(); } }
    }
    form.addEventListener('submit', async event => {
      event.preventDefault(); if (busy || loading || revision === null || saved === snapshot()) return;
      const credits = Number(form.elements.credits.value);
      if (!/^\d+$/.test(form.elements.credits.value.trim()) || !Number.isSafeInteger(credits) || credits < 1 || credits > maximum) { $('daily-rewards-error').textContent = `Enter 1–${maximum} whole credits.`; return; }
      const owner = epoch; busy = true; controls(); $('daily-rewards-error').textContent = '';
      try {
        const data = await api('/api/admin/settings/daily-rewards', { method: 'PATCH', body: JSON.stringify({ enabled: form.elements.enabled.checked, credits, expectedRevision: revision }) });
        if (owner !== epoch) return; accept(data); notify('Daily rewards saved. Already-claimed rewards stay unchanged.');
      } catch (error) { if (owner === epoch) $('daily-rewards-error').textContent = error.message; }
      finally { if (owner === epoch) { busy = false; controls(); } }
    });
    form.elements.credits.addEventListener('input', controls); form.elements.enabled.addEventListener('change', controls);
    $('daily-rewards-refresh').addEventListener('click', refresh);
    function reset() { ++epoch; revision = null; busy = false; loading = false; saved = ''; form.elements.enabled.checked = false; form.elements.credits.value = ''; for (const id of ['daily-rewards-current','daily-rewards-editor','daily-rewards-error','daily-rewards-history']) $(id).textContent = ''; controls(); }
    controls(); return { refresh, reset };
  }
  window.MaddsDailyRewards = { create };
})();
