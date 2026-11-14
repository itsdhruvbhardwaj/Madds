(() => {
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  function senderDetails(item) {
    return `<div class="feedback-sender"><strong>${esc(item.userName || "Account unavailable")}</strong><span>${esc(item.userEmail || "Account email unavailable")}</span><small class="muted">User ID: ${esc(item.userId)}</small>${item.contactEmail ? `<small class="muted">Reply email: ${esc(item.contactEmail)}</small>` : ""}</div>`;
  }
  function create({ api, notify }) {
    const $ = id => document.getElementById(id); let page = 1, epoch = 0, loading = false;
    async function refresh() {
      const ticket = ++epoch; loading = true; $("feedback-error").textContent = "";
      $("feedback-refresh").disabled = true; $("feedback-prev").disabled = true; $("feedback-next").disabled = true;
      try {
        const result = await api(`/api/admin/feedback?page=${page}&status=${encodeURIComponent($("feedback-filter").value)}`);
        if (ticket !== epoch) return;
        $("feedback-list").innerHTML = result.items.map(item => `<article class="feedback-entry"><div class="push-section-heading"><strong>${esc(({ SUGGESTION: "Suggestion", BUG: "Bug report", OTHER: "Other" })[item.category] || "Feedback")}</strong><select aria-label="Feedback status" data-feedback-status="${esc(item._id)}">${Object.entries({ NEW: "New", IN_REVIEW: "In review", RESOLVED: "Resolved" }).map(([value,label]) => `<option value="${value}" ${value === item.status ? "selected" : ""}>${label}</option>`).join("")}</select></div>${senderDetails(item)}<p class="feedback-message">${esc(item.message)}</p><small class="muted">${esc(window.MaddsDates.dateTime(item.createdAt))} · App ${esc(item.appVersion)} · Android ${esc(item.androidVersion)}</small></article>`).join("") || '<p class="push-empty">No feedback matches this filter.</p>';
        $("feedback-page").textContent = `Page ${page}`; $("feedback-prev").disabled = page <= 1; $("feedback-next").disabled = !result.hasMore;
      } catch (e) { if (ticket === epoch) $("feedback-error").textContent = e.message; }
      finally { if (ticket === epoch) { loading = false; $("feedback-refresh").disabled = false; } }
    }
    $("feedback-list").onchange = async e => {
      const id = e.target.dataset.feedbackStatus; if (!id) return;
      e.target.disabled = true;
      try { await api(`/api/admin/feedback/${id}`, { method: "PATCH", body: JSON.stringify({ status: e.target.value }) }); notify("Feedback status updated."); await refresh(); }
      catch (error) { $("feedback-error").textContent = error.message; e.target.disabled = false; }
    };
    $("feedback-filter").onchange = () => { page = 1; void refresh(); };
    $("feedback-refresh").onclick = refresh;
    $("feedback-prev").onclick = () => { if (!loading && page > 1) { page--; void refresh(); } };
    $("feedback-next").onclick = () => { if (!loading) { page++; void refresh(); } };
    return { refresh, reset() { epoch++; page = 1; loading = false; $("feedback-refresh").disabled = false; $("feedback-list").textContent = ""; } };
  }
  if (typeof module !== "undefined" && module.exports) module.exports = { create, senderDetails };
  else window.MaddsFeedback = { create };
})();
