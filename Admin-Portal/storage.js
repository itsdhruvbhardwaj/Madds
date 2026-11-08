/* Storage and media tools use the same authenticated Workspace client. */
(() => {
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
  const bytes = n => n != null && Number.isFinite(Number(n)) ? `${(Number(n)/1048576).toFixed(2)} MB` : "Not available";
  function create({ api, notify }) {
    const $ = id => document.getElementById(id), base = "/api/admin/storage";
    let epoch = 0, busy = false, mediaTicket = 0, assets = [], cursor = null;
    function controls() {
      for (const id of ["storage-refresh", "media-refresh", "media-more", "media-folder", "cleanup-retry"]) $(id).disabled = busy;
      $("storage-policies").querySelectorAll("button").forEach(b => b.disabled = busy || b.dataset.empty === "true");
      $("media-grid").querySelectorAll("button").forEach(b => b.disabled = busy);
      for (const button of [$("storage-refresh"), $("media-refresh"), $("media-more"), $("cleanup-retry"),
        ...$("storage-policies").querySelectorAll("button"), ...$("media-grid").querySelectorAll("button")]) button.ariaBusy = String(busy);
    }
    const error = text => { $("storage-error").textContent = text || ""; };
    async function overview() {
      const session = epoch;
      const data = await api(base); if (session !== epoch) return;
      $("storage-summary").innerHTML = `<div><span>Document data</span><strong>${bytes(data.database?.dataBytes)}</strong></div><div><span>Allocated storage</span><strong>${bytes(data.database?.allocatedBytes)}</strong></div><div><span>Indexes</span><strong>${bytes(data.database?.indexBytes)}</strong></div>`;
      $("storage-note").textContent = data.note;
      $("storage-policies").innerHTML = data.policies.map(p => `<article class="storage-policy"><div><h3>${esc(p.label)}</h3><p>${esc(p.description)}</p><small>${p.days} day retention · ${p.mode === "compact" ? "Compact details" : "Delete eligible records"}${p.lastRunAt ? ` · Last run ${esc(window.MaddsDates.dateTime(p.lastRunAt))}` : ""}</small></div><div class="storage-policy-action"><strong>${esc(p.eligible)} eligible</strong><span>${esc(p.total)} total records</span><button type="button" class="button secondary" data-cleanup="${esc(p.key)}" data-empty="${p.eligible === 0}" ${busy || p.eligible === 0 ? "disabled" : ""}>Clean up</button></div></article>`).join("");
    }
    async function queue() {
      const session = epoch, data = await api(`${base}/image-cleanup`); if (session !== epoch) return;
      $("cleanup-jobs").innerHTML = `<p>${esc(data.total)} images queued for cleanup.</p>` + data.jobs.map(j => `<div class="cleanup-job"><code>${esc(j.publicId)}</code><small>${esc(j.attempts)} attempts · Next check ${esc(window.MaddsDates.dateTime(j.cleanupAfter))}</small><p>${esc(j.lastError || "Waiting for cleanup or still referenced.")}</p></div>`).join("");
    }
    function renderMedia() {
      $("media-grid").innerHTML = assets.map(a => `<article class="media-card">${a.url ? `<a href="${esc(a.url)}" target="_blank" rel="noopener noreferrer"><img loading="lazy" src="${esc(a.url.replace("/image/upload/", "/image/upload/c_limit,w_480,q_auto,f_auto/"))}" alt="Cloudinary image"></a>` : ""}<div><code>${esc(a.publicId)}</code><small>${esc(a.width)} × ${esc(a.height)} · ${bytes(a.bytes)}</small><span class="media-use">${esc(a.protection)}</span>${a.references.map(r => `<small>${esc(r)}</small>`).join("")}${a.canDelete ? `<button type="button" class="delete-button" data-delete-media="${esc(a.publicId)}" ${busy ? "disabled" : ""}>Delete unused image</button>` : ""}</div></article>`).join("") || '<p class="muted">No images on this page. Use Next page if available.</p>';
      $("media-more").hidden = !cursor;
    }
    async function loadMedia(more = false) {
      const ticket = ++mediaTicket, session = epoch, folder = $("media-folder").value;
      $("media-error").textContent = "Loading images…";
      try {
        const result = await api(`${base}/media?folder=${encodeURIComponent(folder)}${more && cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
        if (ticket !== mediaTicket || session !== epoch) return;
        assets = result.assets || []; cursor = result.nextCursor; renderMedia(); $("media-error").textContent = "";
      } catch (failure) { if (ticket === mediaTicket && session === epoch) { assets = []; cursor = null; renderMedia(); $("media-error").textContent = failure.message; } }
    }
    async function refresh() {
      if (busy) return; const session = epoch; error();
      try { await Promise.all([overview(), queue()]); } catch (failure) { if (session === epoch) error(failure.message); }
    }
    async function mutate(action, message) {
      if (busy || !window.confirm(message)) return;
      busy = true; controls(); error(); const session = epoch;
      try { await action(); if (session !== epoch) return; await Promise.all([overview(), queue()]); if (session === epoch) notify("Cleanup request processed. Check the updated counts and image queue."); }
      catch (failure) { if (session === epoch) error(failure.message); }
      finally { if (session === epoch) { busy = false; controls(); } }
    }
    $("storage-policies").addEventListener("click", event => {
      const button = event.target.closest("[data-cleanup]"); if (!button) return;
      void mutate(() => api(`${base}/cleanup`, {method:"POST",body:JSON.stringify({key:button.dataset.cleanup,confirm:true})}), "Clean up up to 200 eligible records in this category? This permanently removes eligible history or compacts old generation details. Balances and protected proofs stay.");
    });
    $("media-grid").addEventListener("click", event => {
      const button = event.target.closest("[data-delete-media]"); if (!button) return;
      void mutate(async () => { const session = epoch; const result = await api(`${base}/media/delete`, {method:"POST",body:JSON.stringify({publicId:button.dataset.deleteMedia,confirm:true})}); if (session !== epoch) return; if (result.pending) notify("Image cleanup is queued. Check the cleanup queue for progress."); await loadMedia(); }, "Permanently delete this unused image? The backend checks its references again before deletion.");
    });
    $("cleanup-retry").addEventListener("click", () => { void mutate(() => api(`${base}/image-cleanup/retry`, {method:"POST"}), "Retry due image cleanup jobs? Images still in use will be protected."); });
    $("storage-refresh").addEventListener("click", refresh);
    $("media-refresh").addEventListener("click", () => { if (!busy) void loadMedia(); });
    $("media-folder").addEventListener("change", () => { if (!busy) void loadMedia(); });
    $("media-more").addEventListener("click", () => { if (!busy) void loadMedia(true); });
    function reset() { epoch++; mediaTicket++; assets=[]; cursor=null; busy=false; error(); $("storage-summary").innerHTML=""; $("storage-policies").innerHTML=""; $("cleanup-jobs").innerHTML=""; $("media-grid").innerHTML=""; $("media-error").textContent=""; controls(); }
    return { refresh, reset };
  }
  const exported = { create, bytes };
  if (typeof module !== "undefined" && module.exports) module.exports = exported; else window.MaddsStorage = exported;
})();
