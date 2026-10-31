(() => {
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const date = v => v ? new Date(v).toLocaleString() : "—";
  function create({ api, notify }) {
    const $ = id => document.getElementById(id), base = "/api/admin/users";
    let page = 1, epoch = 0, historyTicket = 0, activeHistory = null, selected = null, selectedBalance = 0, busy = false, pending = null, query = "", status = "";
    const accountStatus = u => u.isActive === false ? "Suspended" : !u.emailVerified ? "Email unverified" : u.deletionScheduledAt ? "Deletion scheduled" : "Active";
    function closeDetails() {
      const detail = $("user-details"); detail.hidden = true; $("users-panel").append(detail);
      $("user-detail-row")?.remove();
      $("users-list").querySelectorAll(".is-expanded").forEach(row => row.classList.remove("is-expanded"));
      activeHistory = null; historyTicket++;
      $("users-list").querySelectorAll("[data-user]").forEach(b => { b.textContent = "View"; b.setAttribute("aria-expanded", "false"); });
      selected = null; ++epoch;
    }
    async function refresh() {
      if (busy) return;
      const ticket = ++epoch; $("users-error").textContent = "";
      try {
        const result = await api(`${base}?page=${page}&q=${encodeURIComponent(query)}&status=${status}`);
        if (ticket !== epoch) return;
        closeDetails();
        $("users-list").innerHTML = `<div class="users-table-wrap"><table class="users-table"><thead><tr><th>User</th><th>Credits</th><th>Joined</th><th>Status</th><th></th></tr></thead><tbody>${result.users.map(u => `<tr id="user-row-${esc(u._id)}"><td><strong>${esc(u.name)}</strong><span class="log-member-email">${esc(u.email)}</span></td><td><span class="user-credit-count">${Number(u.credits)}</span></td><td>${esc(date(u.createdAt))}</td><td><span class="user-status ${u.isActive === false ? "is-suspended" : !u.emailVerified ? "is-unverified" : ""}">${accountStatus(u)}</span></td><td><button class="button secondary user-view" data-user="${esc(u._id)}" aria-expanded="false">View</button></td></tr>`).join("") || '<tr><td colspan="5">No users found.</td></tr>'}</tbody></table></div>`;
        $("users-count").textContent = `${result.total} users · Page ${result.page} of ${result.pages}`;
        $("users-prev").disabled = page <= 1; $("users-next").disabled = page >= result.pages;
      } catch (e) { if (ticket === epoch) $("users-error").textContent = e.message; }
    }
    async function open(id) {
      if (busy) return;
      if (selected === id) { closeDetails(); return; }
      closeDetails();
      const anchor = $("user-row-" + id); if (!anchor) return;
      anchor.classList.add("is-expanded");
      const row = document.createElement("tr"); row.id = "user-detail-row";
      const cell = document.createElement("td"); cell.colSpan = 5; row.append(cell); anchor.after(row); cell.append($("user-details"));
      const view = anchor.querySelector("[data-user]"); view.textContent = "Close"; view.setAttribute("aria-expanded", "true");
      const ticket = ++epoch; selected = id; pending = null;
      $("user-details").hidden = false; $("user-details").textContent = "Loading account…";
      try {
        const { user: u } = await api(`${base}/${id}`); if (ticket !== epoch) return;
        selectedBalance = Number(u.credits);
        $("user-details").innerHTML = `<div class="user-detail-heading"><div><h2>${esc(u.name)}</h2><p>${esc(u.email)} · <span class="user-status">${accountStatus(u)}</span></p><p class="user-id">User ID: ${esc(u._id)}</p></div><button id="user-close" class="button secondary">Close details</button></div>
          <div class="user-summary"><div><span>Available credits</span><strong>${Number(u.credits)}</strong></div><div><span>Joined</span><b>${esc(date(u.createdAt))}</b></div><div><span>Last active</span><b>${esc(date(u.lastActiveAt))}</b></div><div><span>Login</span><b>${[u.hasGoogleLogin ? "Google" : "", u.hasPassword ? "Password" : ""].filter(Boolean).join(" + ") || "Email"}</b></div></div>
          ${u.deletionScheduledAt ? `<p class="muted">Deletion scheduled: ${esc(date(u.deletionScheduledAt))}</p>` : ""}
          <form id="user-change" class="user-controls"><h3>Manage account</h3><div class="user-control-fields"><label>Action<select name="action"><option value="add">Add credits</option><option value="deduct">Deduct credits</option><option value="restore" ${u.isActive !== false ? "disabled" : ""}>Activate account${u.isActive !== false ? " (already active)" : ""}</option><option value="suspend" ${u.isActive === false ? "disabled" : ""}>Suspend account${u.isActive === false ? " (already suspended)" : ""}</option></select></label><label id="user-amount-field">Credits<input name="amount" type="number" step="1" min="1" max="100000" placeholder="Enter amount" required><small id="user-amount-hint">Enter a positive whole number.</small></label><label>Reason<textarea name="reason" minlength="5" maxlength="500" required rows="2" placeholder="Why is this change needed?"></textarea></label></div><button class="button primary" id="user-submit">Review change</button><p id="user-change-error" class="form-error" role="alert"></p></form>
          <div class="user-history-tabs"><button class="button secondary is-active" data-history="generations">Generations</button><button class="button secondary" data-history="credits">Credit history</button><button class="button secondary" data-history="activity">Admin activity</button></div><div id="user-history"></div>`;
        $("user-submit").textContent = "Save changes";
        $("user-close").onclick = () => { if (!busy) closeDetails(); };
        $("user-change").elements.action.onchange = e => {
          const creditAction = ["add", "deduct"].includes(e.target.value);
          $("user-amount-field").hidden = !creditAction;
          $("user-change").elements.amount.required = creditAction;
          $("user-change").elements.amount.disabled = !creditAction;
          $("user-change").elements.amount.max = e.target.value === "deduct" ? Math.max(0, selectedBalance) : 100000;
          $("user-amount-hint").textContent = e.target.value === "deduct" ? `Maximum deduction: ${selectedBalance} credits. Balance cannot go below zero.` : "Enter a positive whole number.";
          pending = null;
        };
        $("user-change").oninput = () => { pending = null; };
        $("user-change").onsubmit = change;
        $("user-details").querySelectorAll("[data-history]").forEach(b => b.onclick = () => {
          if (activeHistory === b.dataset.history) {
            activeHistory = null; historyTicket++;
            $("user-history").hidden = true; $("user-history").textContent = "";
            $("user-details").querySelectorAll("[data-history]").forEach(tab => { tab.classList.remove("is-active"); tab.setAttribute("aria-expanded", "false"); });
          } else void history(b.dataset.history);
        });
        void history("generations");
      } catch (e) { if (ticket === epoch) $("user-details").textContent = e.message; }
    }
    async function history(kind, cursor = "", previous = []) {
      const id = selected, ticket = epoch, request = ++historyTicket; if (!id) return;
      activeHistory = kind; $("user-history").hidden = false;
      if (!cursor) $("user-history").textContent = "Loading history…";
      try {
        $("user-details").querySelectorAll("[data-history]").forEach(b => { b.classList.toggle("is-active", b.dataset.history === kind); b.setAttribute("aria-expanded", String(b.dataset.history === kind)); b.setAttribute("aria-controls", "user-history"); });
        const result = await api(`${base}/${id}/${kind}?cursor=${cursor}`); if (id !== selected || ticket !== epoch || request !== historyTicket) return;
        const rows = [...previous, ...result.rows];
        const heads = kind === "generations" ? ["Style", "Time", "Status"] : kind === "credits" ? ["Time", "Type", "Change", "Balance", "Reason"] : ["Time", "Administrator", "Action", "Reason"];
        $("user-history").innerHTML = `<h3>${kind === "generations" ? "Generation history" : kind === "credits" ? "Credit history" : "Admin activity"}</h3><div class="logs-table-wrap"><table class="logs-table"><thead><tr>${heads.map(h => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr>${(kind === "generations" ? [r.styleName, date(r.createdAt), ({ completed: "Completed", failed: "Failed", processing: "Processing", outcome_unknown: "Outcome unknown" })[r.status] || r.status] : kind === "credits" ? [date(r.createdAt), r.type, r.amount > 0 ? `+${r.amount}` : r.amount, r.balanceAfter, r.description] : [date(r.createdAt), r.actorEmail, r.action, r.reason]).map(v => `<td>${esc(v)}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="5">No records yet.</td></tr>`}</tbody></table></div>${result.nextCursor ? '<button id="user-more-history" class="button secondary">Load more</button>' : ""}`;
        if (result.nextCursor) $("user-more-history").onclick = () => history(kind, result.nextCursor, rows);
      } catch (e) { if (id === selected && ticket === epoch && request === historyTicket) $("user-history").textContent = e.message; }
    }
    async function change(e) {
      e.preventDefault(); if (busy || !selected) return;
      const form = e.target, action = form.elements.action.value, reason = form.elements.reason.value.trim(), rawAmount = Number(form.elements.amount.value);
      const creditAction = ["add", "deduct"].includes(action), amount = action === "deduct" ? -rawAmount : rawAmount;
      if (creditAction && (!Number.isSafeInteger(rawAmount) || rawAmount <= 0 || rawAmount > 100000)) { $("user-change-error").textContent = "Enter a positive whole-credit amount up to 100,000."; return; }
      if (action === "deduct" && rawAmount > selectedBalance) { $("user-change-error").textContent = `You can deduct at most ${selectedBalance} credits. Balance cannot go below zero.`; return; }
      if (reason.length < 5) { $("user-change-error").textContent = "Provide a reason of at least 5 characters."; return; }
      if (!pending && !window.confirm(`${creditAction ? `${amount > 0 ? "Add" : "Deduct"} ${Math.abs(amount)} credits` : action === "restore" ? "Activate account" : "Suspend account"}?\nReason: ${reason}`)) return;
      pending ||= { requestId: crypto.randomUUID(), reason, ...(creditAction ? { amount } : { active: action === "restore" }) };
      const id = selected; busy = true; form.querySelectorAll("input,textarea,select,button").forEach(el => el.disabled = true);
      try { await api(`${base}/${id}/${creditAction ? "credits" : "access"}`, { method: "POST", body: JSON.stringify(pending) }); pending = null; notify("Account updated."); busy = false; await refresh(); await open(id); }
      catch (error) { $("user-change-error").textContent = error.message; }
      finally { busy = false; form.querySelectorAll("input,textarea,select,button").forEach(el => el.disabled = false); }
    }
    $("users-search").onsubmit = e => { e.preventDefault(); if (busy) return; query = e.target.elements.q.value.trim(); status = e.target.elements.status.value; page = 1; void refresh(); };
    $("users-prev").onclick = () => { if (!busy && page > 1) { page--; void refresh(); } };
    $("users-next").onclick = () => { if (!busy) { page++; void refresh(); } };
    $("users-list").onclick = e => { const b = e.target.closest("[data-user]"); if (b) void open(b.dataset.user); };
    return { refresh, reset() { closeDetails(); pending = null; $("users-list").textContent = ""; } };
  }
  window.MaddsUsers = { create };
})();
