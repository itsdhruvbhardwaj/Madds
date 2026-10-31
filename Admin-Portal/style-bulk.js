(() => {
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  function create({ api, notify, getCatalog, reload }) {
    const $ = id => document.getElementById(id);
    let selected = new Set(), filteredIds = new Set(), busy = false, active = false;
    function update() {
      $("style-bulk-controls").setAttribute("aria-busy", String(busy));
      $("style-bulk-panel").hidden = !active;
      $("style-bulk-toggle").disabled = busy;
      $("style-bulk-toggle").setAttribute("aria-expanded", String(active));
      $("style-bulk-toggle-hint").textContent = active ? "Selection mode on · Collapse ⌃" : "Expand to select styles ⌄";
      $("styles-grid").querySelectorAll(".style-select-label").forEach(label => label.hidden = !active);
      $("style-selection-count").textContent = `${selected.size} of ${filteredIds.size} filtered styles selected`;
      for (const id of ["style-bulk-verify", "style-bulk-unverify"]) {
        $(id).disabled = busy || !selected.size;
        $(id).title = !selected.size ? "Select styles first" : "";
      }
      for (const id of ["style-select-all", "style-select-clear"]) $(id).disabled = busy;
      $("styles-grid").querySelectorAll("[data-bulk-style]").forEach(input => {
        input.checked = selected.has(input.dataset.bulkStyle); input.disabled = busy;
        input.closest("article").classList.toggle("is-bulk-selected", input.checked);
      });
    }
    function catalogChanged(filtered) {
      if (filtered) filteredIds = new Set(filtered.map(style => style.id));
      selected = new Set([...selected].filter(id => filteredIds.has(id)));
      update();
    }
    function decorateCards() {
      $("styles-grid").querySelectorAll("article[data-style-open]").forEach(card => {
        const label = document.createElement("label"); label.className = "style-select-label";
        label.innerHTML = `<input type="checkbox" data-bulk-style="${esc(card.dataset.styleOpen)}" aria-label="Select ${esc(getCatalog().styles.find(s => s.id === card.dataset.styleOpen)?.name || "style")}"><span>Select</span>`;
        card.prepend(label);
      }); update();
    }
    async function save(verified) {
      if (busy || !active || !selected.size) return;
      const ids = [...selected].filter(id => filteredIds.has(id));
      if (!ids.length) return;
      if (!window.confirm(`Mark ${ids.length} selected styles as ${verified ? "verified" : "unverified"}?\n${verified ? "They will become visible in the app and website." : "They will be hidden from the app and website."}`)) return;
      busy = true; update();
      try {
        const result = await api("/api/admin/catalog/styles/verification", { method: "PATCH", body: JSON.stringify({ ids, verified }) });
        selected.clear();
        notify(`${result.changed} styles marked ${verified ? "verified" : "unverified"}.`);
        await reload();
      } catch (error) { notify(error.message, true); }
      finally { busy = false; update(); }
    }
    $("style-bulk-toggle").onclick = () => {
      if (busy) return;
      active = !active;
      if (!active) selected.clear();
      catalogChanged();
    };
    $("style-select-all").onclick = () => { if (!busy && active) { selected = new Set(filteredIds); update(); } };
    $("style-select-clear").onclick = () => { if (!busy) { selected.clear(); update(); } };
    $("styles-grid").addEventListener("change", e => {
      const id = e.target.dataset.bulkStyle; if (!id || busy) return;
      if (e.target.checked) selected.add(id); else selected.delete(id); update();
    });
    $("style-bulk-verify").onclick = () => save(true); $("style-bulk-unverify").onclick = () => save(false);
    update();
    return { catalogChanged, decorateCards, reset() { active = false; selected.clear(); filteredIds.clear(); update(); } };
  }
  window.MaddsStyleBulk = { create };
})();
