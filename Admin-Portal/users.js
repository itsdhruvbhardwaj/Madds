(() => {
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const date = v => v ? new Date(v).toLocaleString() : "—";
  function create({ api, notify }) {
    const $ = id => document.getElementById(id), base = "/api/admin/users";
    let page = 1, epoch = 0, historyTicket = 0, selected = null, busy = false, pending = null, query = "", status = "";
    async function refresh() {
      const ticket = ++epoch; $("users-error").textContent = "";
      try {
        const result = await api(`${base}?page=${page}&q=${encodeURIComponent(query)}&status=${status}`);
        if (ticket !== epoch) return;
        $("users-list").innerHTML = `<div class="logs-table-wrap"><table class="logs-table"><thead><tr><th>User</th><th>Credits</th><th>Joined</th><th>Status</th></tr></thead><tbody>${result.users.map(u => `<tr><td><button class="text-button" data-user="${esc(u._id)}">${esc(u.name)}</button><span class="log-member-email">${esc(u.email)}</span></td><td>${Number(u.credits)}</td><td>${esc(date(u.createdAt))}</td><td>${u.isActive === false ? "Suspended" : u.deletionScheduledAt ? "Deletion scheduled" : "Active"}</td></tr>`).join("") || '<tr><td colspan="4">No users found.</td></tr>'}</tbody></table></div>`;
        $("users-count").textContent = `${result.total} users · Page ${result.page} of ${result.pages}`;
        $("users-prev").disabled = page <= 1; $("users-next").disabled = page >= result.pages;
      } catch (e) { if (ticket === epoch) $("users-error").textContent = e.message; }
    }
    async function open(id) {
      if (busy) return;
      const ticket = ++epoch; selected = id; pending = null;
      $("user-details").hidden = false; $("user-details").textContent = "Loading account…";
      try {
        const { user: u } = await api(`${base}/${id}`); if (ticket !== epoch) return;
        $("user-details").innerHTML = `<div class="push-section-heading"><div><h2>${esc(u.name)}</h2><p>${esc(u.email)}</p><p>User ID: ${esc(u._id)}</p></div><button id="user-close" class="button secondary">Close</button></div><div class="push-metrics"><div><strong>${Number(u.credits)}</strong><span>Credits</span></div><div><strong>${u.isActive === false ? "Suspended" : "Active"}</strong><span>Account access</span></div></div><p class="muted">Joined ${esc(date(u.createdAt))} · Last active ${esc(date(u.lastActiveAt))}<br>Login: ${[u.hasGoogleLogin ? "Google" : "", u.hasPassword ? "Password" : ""].filter(Boolean).join(" + ") || "Email"}${u.deletionScheduledAt ? `<br>Deletion scheduled: ${esc(date(u.deletionScheduledAt))}` : ""}</p><form id="user-change" class="push-fields"><div class="push-two-fields"><label>Action<select name="action"><option value="credits">Adjust credits</option><option value="${u.isActive === false ? "restore" : "suspend"}">${u.isActive === false ? "Restore access" : "Suspend access"}</option></select></label><label id="user-amount-field">Credit adjustment<input name="amount" type="number" step="1" min="-100000" max="100000" placeholder="e.g. 20 to add, -20 to deduct"></label></div><label>Reason<textarea name="reason" minlength="5" maxlength="500" required rows="2" placeholder="Explain why this change is needed"></textarea></label><button class="button primary" id="user-submit">Review change</button><p id="user-change-error" class="form-error" role="alert"></p></form><div class="push-actions"><button class="button secondary" data-history="generations">Generation history</button><button class="button secondary" data-history="credits">Credit history</button><button class="button secondary" data-history="activity">Admin activity</button></div><div id="user-history"></div>`;
        $("user-close").onclick = () => { selected = null; ++epoch; $("user-details").hidden = true; };
        $("user-change").elements.action.onchange = e => { $("user-amount-field").hidden = e.target.value !== "credits"; pending = null; };
        $("user-change").oninput = () => { pending = null; };
        $("user-change").onsubmit = change;
        $("user-details").querySelectorAll("[data-history]").forEach(b => b.onclick = () => history(b.dataset.history));
        void history("generations");
      } catch (e) { if (ticket === epoch) $("user-details").textContent = e.message; }
    }
    async function history(kind, cursor = "", previous = []) {
      const id = selected, ticket = epoch, request = ++historyTicket; if (!id) return;
      try {
        const result = await api(`${base}/${id}/${kind}?cursor=${cursor}`); if (id !== selected || ticket !== epoch || request !== historyTicket) return;
        const rows = [...previous, ...result.rows];
        const heads = kind === "generations" ? ["Style", "Time", "Status"] : kind === "credits" ? ["Time", "Type", "Change", "Balance", "Reason"] : ["Time", "Administrator", "Action", "Reason"];
        $("user-history").innerHTML = `<h3>${kind === "generations" ? "Generation history" : kind === "credits" ? "Credit history" : "Admin activity"}</h3><div class="logs-table-wrap"><table class="logs-table"><thead><tr>${heads.map(h => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr>${(kind === "generations" ? [r.styleName, date(r.createdAt), ({ completed: "Completed", failed: "Failed", processing: "Processing", outcome_unknown: "Outcome unknown" })[r.status] || r.status] : kind === "credits" ? [date(r.createdAt), r.type, r.amount > 0 ? `+${r.amount}` : r.amount, r.balanceAfter, r.description] : [date(r.createdAt), r.actorEmail, r.action, r.reason]).map(v => `<td>${esc(v)}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="5">No records yet.</td></tr>`}</tbody></table></div>${result.nextCursor ? '<button id="user-more-history" class="button secondary">Load more</button>' : ""}`;
        if (result.nextCursor) $("user-more-history").onclick = () => history(kind, result.nextCursor, rows);
      } catch (e) { if (id === selected && ticket === epoch && request === historyTicket) $("user-history").textContent = e.message; }
    }
    async function change(e) {
      e.preventDefault(); if (busy || !selected) return;
      const form = e.target, action = form.elements.action.value, reason = form.elements.reason.value.trim(), amount = Number(form.elements.amount.value);
      if (action === "credits" && (!Number.isSafeInteger(amount) || !amount || Math.abs(amount) > 100000)) { $("user-change-error").textContent = "Enter a nonzero whole-credit adjustment up to 100,000."; return; }
      if (reason.length < 5) { $("user-change-error").textContent = "Provide a reason of at least 5 characters."; return; }
      if (!pending && !window.confirm(`${action === "credits" ? `${amount > 0 ? "Add" : "Deduct"} ${Math.abs(amount)} credits` : action === "restore" ? "Restore account access" : "Suspend account access"}?\nReason: ${reason}`)) return;
      pending ||= { requestId: crypto.randomUUID(), reason, ...(action === "credits" ? { amount } : { active: action === "restore" }) };
      const id = selected; busy = true; form.querySelectorAll("input,textarea,select,button").forEach(el => el.disabled = true);
      try { await api(`${base}/${id}/${action === "credits" ? "credits" : "access"}`, { method: "POST", body: JSON.stringify(pending) }); pending = null; notify("Account updated."); busy = false; await refresh(); await open(id); }
      catch (error) { $("user-change-error").textContent = error.message; }
      finally { busy = false; form.querySelectorAll("input,textarea,select,button").forEach(el => el.disabled = false); }
    }
    $("users-search").onsubmit = e => { e.preventDefault(); if (busy) return; query = e.target.elements.q.value.trim(); status = e.target.elements.status.value; page = 1; void refresh(); };
    $("users-prev").onclick = () => { if (!busy && page > 1) { page--; void refresh(); } };
    $("users-next").onclick = () => { if (!busy) { page++; void refresh(); } };
    $("users-list").onclick = e => { const b = e.target.closest("[data-user]"); if (b) void open(b.dataset.user); };
    return { refresh, reset() { epoch++; selected = null; pending = null; $("users-list").textContent = ""; $("user-details").hidden = true; } };
  }
  window.MaddsUsers = { create };
})();
