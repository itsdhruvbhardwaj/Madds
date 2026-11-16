(() => {
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
  function create({ api, notify }) {
    const $ = id => document.getElementById(id), form = $('daily-reminder-form'), base = '/api/admin/notifications/daily-reminder';
    let epoch = 0, revision = null, baseline = '', busy = false, loading = false, credits = 2;
    const values = () => ({ enabled: form.elements.enabled.checked, sendTime: form.elements.sendTime.value, title: form.elements.title.value, body: form.elements.body.value });
    const dirty = () => revision !== null && baseline !== JSON.stringify(values());
    function preview() {
      const expand = value => value.replaceAll('{credits}', String(credits)).replaceAll('{firstName}', 'Maddies');
      $('daily-reminder-preview-title').textContent = expand(form.elements.title.value);
      $('daily-reminder-preview-body').textContent = expand(form.elements.body.value);
    }
    function controls() {
      for (const name of ['enabled','sendTime','title','body']) form.elements[name].disabled = busy || loading || revision === null;
      $('daily-reminder-save').disabled = busy || loading || !dirty();
      $('daily-reminder-refresh').disabled = busy || loading;
      $('daily-reminder-save').ariaBusy = String(busy); $('daily-reminder-refresh').ariaBusy = String(loading);
      preview();
    }
    function accept(data) {
      if (typeof data.enabled !== 'boolean' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(data.sendTime) || typeof data.title !== 'string' || typeof data.body !== 'string' || !Number.isSafeInteger(data.revision)) throw Error('Invalid reminder settings. Refresh before saving.');
      revision = data.revision; credits = data.credits || 2;
      form.elements.enabled.checked = data.enabled;
      for (const name of ['sendTime','title','body']) form.elements[name].value = data[name];
      baseline = JSON.stringify(values());
      $('daily-reminder-status').textContent = !data.enabled ? 'Automatic reminders are off.' : !data.rewardsEnabled ? 'Paused: daily rewards are disabled.' : !data.deliveryEnabled ? 'Paused: notification delivery is disabled.' : `Enabled · every day at ${data.sendTime} IST · next check: ${window.MaddsDates.dateTime(data.nextRunAt)}.`;
      $('daily-reminder-hosting').textContent = data.processorMode === 'web' ? 'Current mode runs while the backend is awake. Reliable scheduled delivery requires the notification worker to keep running.' : 'Keep the notification worker running for automatic scheduled delivery.';
      $('daily-reminder-editor').textContent = data.updatedAt ? `Last changed by ${data.updatedByName || 'Team member'} · ${window.MaddsDates.dateTime(data.updatedAt)}` : 'Default: off, 8 PM IST. No reminders are sent until enabled.';
      const labels = { ACCEPTED: 'Accepted by FCM', FAILED: 'Failed', PENDING: 'Pending', PROCESSING: 'Sending', SKIPPED: 'Skipped' };
      const reasons = { DAILY_REWARD_ALREADY_CLAIMED: 'already claimed', INELIGIBLE_OR_COOLDOWN: 'account, permission or cooldown', BINDING_OR_PREFERENCE_CHANGED: 'session or preference changed', DAILY_REMINDER_EXPIRED: 'expired', DAILY_REMINDER_DISABLED_OR_CHANGED: 'automation disabled or changed', DAILY_REWARD_DISABLED_OR_CHANGED: 'reward disabled or changed', DAILY_REMINDER_UNSUPPORTED: 'app unsupported' };
      $('daily-reminder-runs').innerHTML = (data.runs || []).map(run => `<article class="daily-reminder-run"><strong>${escape(run.dayKey)} · ${escape(run.status)}</strong><p class="field-hint">${run.failureReason ? `${escape(reasons[run.failureReason] || run.failureReason)} · ` : ''}${(run.results || []).map(result => `${escape(labels[result.status] || result.status)}${result.reason ? ` (${escape(reasons[result.reason] || result.reason)})` : ''}: ${escape(result.count)}`).join(' · ') || 'No eligible devices recorded yet.'}</p></article>`).join('') || '<p class="field-hint">No automatic reminder runs yet.</p>';
      $('daily-reminder-history').innerHTML = (data.history || []).map(entry => `<p class="field-hint">${escape(window.MaddsDates.dateTime(entry.createdAt))} · ${escape(entry.actorName || entry.actorEmail)} · ${entry.next.enabled ? 'On' : 'Off'} at ${escape(entry.next.sendTime)} IST</p>`).join('') || '<p class="field-hint">No automation changes yet.</p>';
    }
    async function refresh() {
      if (busy || loading || (dirty() && !window.confirm('Discard unsaved daily reminder changes?'))) return;
      const session = epoch; loading = true; controls(); $('daily-reminder-error').textContent = '';
      try { const data = await api(base); if (session === epoch) accept(data); }
      catch (error) { if (session === epoch) { revision = null; $('daily-reminder-error').textContent = error.message; } }
      finally { if (session === epoch) { loading = false; controls(); } }
    }
    form.addEventListener('submit', async event => {
      event.preventDefault(); if (busy || loading || !dirty()) return;
      const input = values();
      if (!input.title.trim() || !input.body.trim() || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.sendTime)) { $('daily-reminder-error').textContent = 'Enter a time, title and message.'; return; }
      const session = epoch; busy = true; controls(); $('daily-reminder-error').textContent = '';
      try { const data = await api(base, { method: 'PATCH', body: JSON.stringify({ ...input, expectedRevision: revision }) });
        if (session !== epoch) return; accept(data); notify('Daily reminder automation saved. Existing submitted notifications cannot be recalled.');
      } catch (error) { if (session === epoch) $('daily-reminder-error').textContent = error.message; }
      finally { if (session === epoch) { busy = false; controls(); } }
    });
    form.addEventListener('input', controls); form.addEventListener('change', controls);
    $('daily-reminder-refresh').addEventListener('click', refresh);
    function reset() { ++epoch; revision = null; baseline = ''; busy = false; loading = false;
      form.elements.enabled.checked = false; for (const name of ['sendTime','title','body']) form.elements[name].value = '';
      for (const id of ['status','hosting','editor','error','runs','history']) $(`daily-reminder-${id}`).textContent = ''; controls(); }
    function canLeave() { return !busy && !loading && (!dirty() || window.confirm('Discard unsaved daily reminder changes?')); }
    window.addEventListener('beforeunload', event => { if (dirty()) { event.preventDefault(); event.returnValue = ''; } });
    controls(); return { refresh, reset, canLeave };
  }
  window.MaddsDailyReminder = { create };
})();
