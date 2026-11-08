(() => {
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  function create({ api, notify, onChanged }) {
    const $ = id => document.getElementById(id);
    let page = 1, totalPages = 1, epoch = 0, loading = false, changing = false, searchTimer, currentItems = [], activeRequest;
    function controls() {
      $("performance-refresh").disabled = loading || changing;
      for (const id of ["performance-days", "performance-sort", "performance-search"]) $(id).disabled = changing;
      $("performance-prev").disabled = loading || changing || page <= 1;
      $("performance-next").disabled = loading || changing || page >= totalPages;
      $("performance-rows").querySelectorAll("[data-performance-style]").forEach(button => { button.disabled = loading || changing; });
      $("performance-results").setAttribute("aria-busy", String(loading || changing));
      $("performance-refresh").classList.toggle("is-loading", loading);
    }
    async function request(path, options) {
      const controller = new AbortController(); activeRequest?.abort(); activeRequest = controller;
      let timer;
      try {
        return await Promise.race([
          api(path, { ...options, signal: controller.signal }),
          new Promise((_, reject) => { timer = setTimeout(() => { reject(new Error("The request took too long. Please try again.")); controller.abort(); }, 20000); })
        ]);
      } finally { clearTimeout(timer); if (activeRequest === controller) activeRequest = null; }
    }
    function render(result) {
      currentItems = result.items;
      $("performance-summary").innerHTML = [["Successful generations", result.summary.successful], ["Styles used", result.summary.stylesUsed], ["Failed generations", result.summary.failed]].map(([label, value]) => `<div class="performance-metric"><span>${esc(label)}</span><strong>${Number(value).toLocaleString()}</strong></div>`).join("");
      $("performance-rows").innerHTML = result.items.map(item => `<tr><td><strong>${esc(item.name)}</strong><small>${!item.available ? "Removed from catalogue" : item.verified ? "Verified" : "Unverified · hidden in app"}</small></td><td>${Number(item.successful).toLocaleString()}</td><td>${Number(item.uniqueUsers).toLocaleString()}</td><td>${Number(item.failed).toLocaleString()}</td><td>${item.lastUsedAt ? esc(window.MaddsDates.dateTime(item.lastUsedAt)) : "—"}</td><td>${item.available ? `<button type="button" class="button ${item.trending ? "secondary" : "primary"}" data-performance-style="${esc(item.id)}" data-trending="${!item.trending}">${item.trending ? "Remove from Trending" : "Add to Trending"}</button>` : "—"}</td></tr>`).join("") || '<tr><td colspan="6" class="muted">No styles match your search.</td></tr>';
      $("performance-page").textContent = `Page ${result.page} of ${result.totalPages} · ${result.total} styles`;
      $("performance-period").textContent = `Requests started ${window.MaddsDates.dateTime(result.since)} – ${window.MaddsDates.dateTime(result.until)}. Unique users counts people with successful generations of each style.`;
    }
    async function refresh() {
      if (changing) return;
      const ticket = ++epoch; loading = true; $("performance-error").textContent = ""; controls();
      try {
        const query = new URLSearchParams({ days: $("performance-days").value, sort: $("performance-sort").value, search: $("performance-search").value.trim(), page: String(page) });
        const result = await request(`/api/admin/catalog/performance?${query}`);
        if (ticket !== epoch) return;
        page = result.page; totalPages = result.totalPages; render(result);
      } catch (error) { if (ticket === epoch) $("performance-error").textContent = error.message || "Could not load style performance."; }
      finally { if (ticket === epoch) { loading = false; controls(); } }
    }
    $("performance-rows").onclick = async event => {
      const button = event.target.closest("[data-performance-style]");
      if (!button || changing || loading) return;
      const item = currentItems.find(row => row.id === button.dataset.performanceStyle);
      if (!item?.available) return;
      const ticket = ++epoch, desired = button.dataset.trending === "true";
      changing = true; $("performance-error").textContent = ""; controls(); button.disabled = true; button.classList.add("is-loading");
      try {
        await request(`/api/admin/catalog/performance/${encodeURIComponent(item.id)}/trending`, { method: "PATCH", body: JSON.stringify({ trending: desired }) });
        if (ticket !== epoch) return;
        notify(desired ? "Style added to Trending." : "Style removed from Trending.");
        changing = false; await refresh();
        if (ticket + 1 === epoch) await onChanged?.();
      } catch (error) { if (ticket === epoch) $("performance-error").textContent = error.message || "Could not update Trending."; }
      finally {
        if (ticket === epoch || ticket + 1 === epoch) { changing = false; controls(); button.disabled = false; button.classList.remove("is-loading"); }
      }
    };
    for (const id of ["performance-days", "performance-sort"]) $(id).onchange = () => { page = 1; void refresh(); };
    $("performance-search").oninput = () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { page = 1; void refresh(); }, 350); };
    $("performance-refresh").onclick = () => refresh();
    $("performance-prev").onclick = () => { if (!loading && !changing && page > 1) { page--; void refresh(); } };
    $("performance-next").onclick = () => { if (!loading && !changing && page < totalPages) { page++; void refresh(); } };
    return { refresh, reset() { epoch++; activeRequest?.abort(); clearTimeout(searchTimer); page = 1; totalPages = 1; loading = false; changing = false; currentItems = []; $("performance-rows").textContent = ""; $("performance-summary").textContent = ""; $("performance-page").textContent = ""; $("performance-period").textContent = ""; $("performance-error").textContent = ""; controls(); } };
  }
  window.MaddsPerformance = { create };
})();
