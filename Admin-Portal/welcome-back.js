(() => {
  const esc = value => String(value ?? "").replace(/[&<>"']/g,c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
  function create({ api, notify, openNotification }) {
    const $ = id => document.getElementById(id), base = "/api/admin/notifications/welcome-back";
    const form = $("welcome-back-form");
    let batch = null, selected = new Set(), busy = false, epoch = 0, requestId = null, timer, confirmationPending = false;
    function controls() {
      const locked = busy || confirmationPending || (batch && batch.status !== "DRAFT");
      for (const field of form.querySelectorAll("input,select,button")) field.disabled = !!locked;
      $("welcome-back-confirm").disabled = busy || !batch || batch.status !== "DRAFT" || !selected.size;
      $("welcome-back-confirm").ariaBusy = String(busy);
      $("welcome-back-preview").ariaBusy = String(busy);
      $("welcome-back-refresh").disabled = busy;
      $("welcome-back-all").disabled = !!locked || !batch;
      $("welcome-back-clear").disabled = !!locked || !batch;
      $("welcome-back-new").disabled = busy || confirmationPending;
      $("welcome-back-recipients").querySelectorAll("input").forEach(input => input.disabled = !!locked);
      $("welcome-back-summary").textContent = batch ? batch.status === "DRAFT"
        ? `${selected.size} users selected · ${selected.size * batch.amount} total credits · ${batch.amount} per user`
        : `${batch.status === "DONE" ? "Finished" : "Processing"}: ${batch.granted} granted · ${batch.skipped} skipped · ${batch.pending} pending · ${batch.creditsGranted} credits added` : "";
    }
    function render() {
      $("welcome-back-recipients").innerHTML = batch ? `<div class="welcome-back-users">${batch.recipients.map(r => `<label><input type="checkbox" data-grant-user="${esc(r.userId)}" ${selected.has(r.userId)?"checked":""}><span><b>${esc(r.name)}</b><small>${r.credits} credits at preview · Last active ${esc(new Date(r.lastActiveAt).toLocaleString())}${r.status!=="PENDING"?` · ${esc(r.status)}${r.reason?`: ${esc(r.reason)}`:""}`:""}</small></span></label>`).join("") || '<p class="muted">No eligible users found.</p>'}</div>${batch.hasMore?'<p class="field-hint">Preview is limited to the first 500 eligible users. Run another reviewed batch for remaining users.</p>':""}` : "";
      controls();
    }
    function stopTimer() { clearTimeout(timer); }
    async function refresh() {
      stopTimer(); const session = epoch;
      try {
        const data = await api(base); if (session !== epoch) return;
        if (batch?.status !== "DRAFT" || confirmationPending) {
          const updated = data.batches.find(b => b.id === batch?.id);
          if (updated) { batch = updated; confirmationPending = false; render(); }
        }
        $("welcome-back-history").innerHTML = data.batches.map(b => `<div class="welcome-back-result"><strong>${esc(b.actorName || "Team member")} · ${esc(new Date(b.createdAt).toLocaleString())}</strong><p>${b.inactiveDays === 0 ? "Any activity · low credits only" : b.inactiveDays + "+ days inactive"} · ${b.amount} credits each · ${b.granted} granted · ${b.skipped} skipped · ${b.pending} pending</p>${b.notificationId?`<button type="button" class="button secondary" data-grant-notification="${esc(b.notificationId)}">View notification results</button>`:""}</div>`).join("") || '<p class="muted">No welcome-back grants yet.</p>';
        $("welcome-back-delivery").textContent = data.deliveryEnabled ? "Push delivery respects Offers & Rewards preferences and device permissions. Credits are granted even when a user cannot receive push notifications." : "Push delivery is paused. Credits can still be granted; notifications will stay queued until sending is enabled.";
        if (data.batches.some(b => b.status === "PROCESSING") && !document.getElementById("notifications-panel").hidden)
          timer = setTimeout(() => { void refresh(); }, 10000);
      } catch (error) { if (session === epoch) $("welcome-back-error").textContent = error.message; }
    }
    async function preview(event) {
      event.preventDefault(); if (busy || confirmationPending || !form.reportValidity()) return;
      busy = true; controls(); const session = epoch;
      requestId ||= crypto.randomUUID(); $("welcome-back-error").textContent = "";
      try {
        const data = await api(`${base}/preview`, { method: "POST", body: JSON.stringify({ inactiveDays:Number(form.elements.inactiveDays.value), amount:Number(form.elements.amount.value), requestId }) });
        if (session !== epoch) return;
        batch = data.batch; selected = new Set(batch.recipients.map(r => r.userId)); render();
      } catch (error) { if (session === epoch) $("welcome-back-error").textContent = error.message; }
      finally { if (session === epoch) { busy = false; controls(); } }
    }
    async function confirm() {
      if (busy || !batch || batch.status !== "DRAFT" || !selected.size) return;
      if (!window.confirm(`Add ${batch.amount} credits each to ${selected.size} selected users (${selected.size * batch.amount} credits maximum), then queue their personalised notification? Eligibility is checked again; users who no longer qualify will be skipped.`)) return;
      busy = true; confirmationPending = true; controls(); const session = epoch; $("welcome-back-error").textContent = "";
      try {
        const data = await api(`${base}/${batch.id}/confirm`, {method:"POST",body:JSON.stringify({userIds:[...selected],confirm:true})});
        if (session !== epoch) return;
        batch = data.batch; confirmationPending = false; render(); notify("Credit grants queued. Each user is credited once per batch before notification sending.");
        await refresh();
      } catch (error) { if (session === epoch) {
        const rejected = /^(Preview expired\.|Preview not found for this administrator\.|Recipients must come from the reviewed preview\.)/.test(error.message);
        if (rejected) confirmationPending = false;
        $("welcome-back-error").textContent = rejected ? error.message : `${error.message} Retry confirmation with this same selection to check the operation; do not create another grant.`;
      } }
      finally { if (session === epoch) { busy = false; controls(); } }
    }
    form.addEventListener("submit",preview);
    form.addEventListener("input", () => { if (!busy && !confirmationPending) { batch = null; selected.clear(); requestId = null; render(); } });
    $("welcome-back-recipients").addEventListener("change", event => {
      if (busy || confirmationPending || batch?.status !== "DRAFT") return;
      const id = event.target.dataset.grantUser; if (!id) return;
      if (event.target.checked) selected.add(id); else selected.delete(id); controls();
    });
    $("welcome-back-all").onclick = () => { if (batch?.status === "DRAFT" && !busy && !confirmationPending) { selected = new Set(batch.recipients.map(r => r.userId)); render(); } };
    $("welcome-back-clear").onclick = () => { if (!busy && !confirmationPending) { selected.clear(); render(); } };
    $("welcome-back-confirm").onclick = confirm;
    $("welcome-back-refresh").onclick = () => { if (!busy) void refresh(); };
    $("welcome-back-new").onclick = () => { if (busy || confirmationPending) return; batch=null;requestId=null;selected.clear();render(); };
    $("welcome-back-history").addEventListener("click", event => { const id = event.target.closest("[data-grant-notification]")?.dataset.grantNotification; if(id) openNotification(id); });
    function reset() { epoch++;stopTimer();batch=null;selected.clear();requestId=null;busy=false;confirmationPending=false;$("welcome-back-error").textContent="";$("welcome-back-history").innerHTML="";render(); }
    controls(); return { refresh, reset };
  }
  if (typeof module !== "undefined" && module.exports) module.exports = { create };
  else window.MaddsWelcomeBack = { create };
})();
