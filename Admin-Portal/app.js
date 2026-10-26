(() => {
  const apiBase = String(window.PICMEE_API_BASE || "").replace(/\/$/, "");
  const tokenKey = "picmee_admin_access";
  const refreshKey = "picmee_admin_refresh";
  const state = { styles: [], collections: [], sections: [], recentChanges: [], editingId: null, renamingId: null };
  const byId = (id) => document.getElementById(id);

  async function api(path, options = {}, retry = true) {
    const headers = new Headers(options.headers || {});
    headers.set("Accept", "application/json");
    if (options.body && !(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
    const access = sessionStorage.getItem(tokenKey);
    if (access) headers.set("Authorization", `Bearer ${access}`);
    let response = await fetch(`${apiBase}${path}`, { ...options, headers });
    if (response.status === 401 && retry && sessionStorage.getItem(refreshKey)) {
      const refreshed = await fetch(`${apiBase}/api/auth/refresh`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: sessionStorage.getItem(refreshKey) }),
      }).catch(() => null);
      const credentials = refreshed?.ok ? await refreshed.json() : null;
      if (credentials?.accessToken && credentials?.refreshToken) {
        sessionStorage.setItem(tokenKey, credentials.accessToken);
        sessionStorage.setItem(refreshKey, credentials.refreshToken);
        return api(path, options, false);
      }
      clearSession();
      showLogin();
    }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
    return data;
  }

  function clearSession() {
    sessionStorage.removeItem(tokenKey);
    sessionStorage.removeItem(refreshKey);
  }
  function showLogin(message = "") {
    byId("login-view").hidden = false;
    byId("app-view").hidden = true;
    byId("login-message").textContent = message;
  }
  function showApp(email) {
    byId("login-view").hidden = true;
    byId("app-view").hidden = false;
    byId("account-email").textContent = email || "Team account";
  }
  function notify(message, isError = false) {
    const box = byId("notice");
    box.textContent = message;
    box.classList.toggle("error", isError);
    box.hidden = false;
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => { box.hidden = true; }, 5000);
  }
  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  }

  async function loadCatalog() {
    try {
      const data = await api("/api/admin/catalog");
      state.styles = data.styles || [];
      state.collections = data.collections || [];
      state.sections = data.sections || [];
      state.recentChanges = data.recentChanges || [];
      renderStyles();
      renderCollections();
      renderCollectionOptions();
    } catch (error) {
      if (error.message.includes("not allowed")) {
        clearSession();
        showLogin("This account can sign in, but it has not been approved for catalogue access. Ask the owner to add its email to the backend ADMIN_EMAILS setting.");
      } else if (!byId("login-view").hidden) {
        showLogin(error.message);
      } else notify(error.message, true);
    }
  }

  function renderStyles() {
    const query = byId("style-search").value.trim().toLowerCase();
    const collection = byId("collection-filter").value;
    const filtered = state.styles.filter((style) => {
      const matchesCollection = !collection || style.collections.includes(collection);
      const searchable = `${style.name} ${style.id} ${style.description} ${style.prompt}`.toLowerCase();
      return matchesCollection && (!query || searchable.includes(query));
    });
    byId("style-count").textContent = String(state.styles.length);
    byId("result-count").textContent = `${filtered.length} shown`;
    const grid = byId("styles-grid");
    if (!filtered.length) {
      grid.innerHTML = '<div class="empty-state">No styles match. Try another search or add a new style.</div>';
      return;
    }
    grid.innerHTML = filtered.map((style) => {
      const img = style.thumbnail
        ? `<img src="${escapeHtml(style.thumbnail)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentElement.innerHTML='<div class=\'image-placeholder\'>Preview unavailable</div>'">`
        : '<div class="image-placeholder">No thumbnail yet</div>';
      const chips = (style.collections || []).map((name) => `<span class="chip">${escapeHtml(name)}</span>`).join("");
      return `<article class="style-card"><div class="style-image">${img}</div><div class="style-body"><div class="style-title" title="${escapeHtml(style.name)}">${escapeHtml(style.name)}</div><div class="style-id">${escapeHtml(style.id)}</div><p class="style-description">${escapeHtml(style.description)}</p><div class="chips">${chips || '<span class="muted">No collection</span>'}</div><div class="card-footer"><span>${Number(style.tokensRequired)} credits · ${Number(style.imageCount)} photo${Number(style.imageCount) === 1 ? "" : "s"}</span><span><button class="edit-button" data-edit="${escapeHtml(style.id)}">Edit</button><button class="delete-button" data-delete="${escapeHtml(style.id)}">Delete</button></span></div></div></article>`;
    }).join("");
    grid.querySelectorAll("[data-edit]").forEach((button) => button.addEventListener("click", () => openStyleEditor(button.dataset.edit)));
    grid.querySelectorAll("[data-delete]").forEach((button) => button.addEventListener("click", () => deleteStyle(button.dataset.delete)));
  }

  function renderCollectionOptions() {
    const filter = byId("collection-filter");
    const current = filter.value;
    filter.innerHTML = '<option value="">All collections</option>' + state.collections.map((item) => `<option value="${escapeHtml(item.name)}">${escapeHtml(item.name)}</option>`).join("");
    if ([...filter.options].some((option) => option.value === current)) filter.value = current;
    const selected = new Set(byId("style-form").elements.collections ? [...byId("style-form").querySelectorAll('input[name="collections"]:checked')].map((input) => input.value) : []);
    byId("collection-checkboxes").innerHTML = state.collections.map((item) => `<label class="collection-check"><input type="checkbox" name="collections" value="${escapeHtml(item.name)}" ${selected.has(item.name) ? "checked" : ""}>${escapeHtml(item.name)}</label>`).join("") || '<span class="muted">Create a collection first.</span>';
  }

  function renderCollections() {
    const root = byId("collections-list");
    if (!state.collections.length) { root.innerHTML = '<div class="empty-state">No collections have been created.</div>'; return; }
    root.innerHTML = state.collections.map((collection) => {
      const count = state.styles.filter((style) => style.collections.includes(collection.name)).length;
      const section = state.sections.find((item) => String(item.slug).toLowerCase() === collection.name.toLowerCase());
      const visible = Boolean(section?.visible);
      return `<div class="collection-row"><div><div class="collection-name">${escapeHtml(collection.name)}</div><div class="collection-meta">ID: ${escapeHtml(collection.id)}</div></div><label class="home-control collection-check"><input class="home-toggle" type="checkbox" data-home="${escapeHtml(section?.id || "")}" ${visible ? "checked" : ""} ${section ? "" : "disabled"}>Show on Home</label><div class="collection-count">${count} style${count === 1 ? "" : "s"}</div><div class="collection-actions"><button class="text-button" data-rename="${escapeHtml(collection.id)}">Rename</button></div></div>`;
    }).join("");
    root.querySelectorAll("[data-rename]").forEach((button) => button.addEventListener("click", () => openRenameDialog(button.dataset.rename)));
    root.querySelectorAll("[data-home]").forEach((input) => input.addEventListener("change", () => updateHomeVisibility(input.dataset.home, input.checked)));
  }

  async function updateHomeVisibility(id, visible) {
    if (!id) return;
    try {
      const result = await api(`/api/admin/catalog/home-sections/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ visible }) });
      const index = state.sections.findIndex((section) => section.id === id);
      if (index >= 0) state.sections[index] = result.section;
      notify(visible ? "Collection will appear on the app Home screen." : "Collection hidden from the app Home screen.");
    } catch (error) { notify(error.message, true); await loadCatalog(); }
  }

  async function deleteStyle(id) {
    const style = state.styles.find((item) => item.id === id);
    if (!style) return;
    if (!window.confirm(`Permanently delete “${style.name}”? It will disappear from the catalogue and users’ favorites. Existing generation history will remain.`)) return;
    try {
      await api(`/api/admin/catalog/styles/${encodeURIComponent(id)}`, { method: "DELETE" });
      notify("Style permanently deleted.");
      await loadCatalog();
    } catch (error) { notify(error.message, true); }
  }

  function openStyleEditor(id = null) {
    state.editingId = id;
    const form = byId("style-form");
    form.reset();
    form.elements.tokensRequired.value = "10";
    byId("form-error").textContent = "";
    const style = state.styles.find((item) => item.id === id);
    byId("dialog-title").textContent = style ? "Edit style" : "Add a style";
    form.elements.id.readOnly = Boolean(style);
    if (style) {
      form.elements.name.value = style.name;
      form.elements.id.value = style.id;
      form.elements.description.value = style.description;
      form.elements.prompt.value = style.prompt;
      form.elements.thumbnail.value = style.thumbnail || "";
      form.elements.previewImages.value = (style.previewImages || []).join("\n");
      form.elements.imageCount.value = String(style.imageCount);
      form.elements.tokensRequired.value = String(style.tokensRequired);
    }
    renderCollectionOptions();
    if (style) for (const input of form.querySelectorAll('input[name="collections"]')) input.checked = style.collections.includes(input.value);
    byId("style-dialog").showModal();
  }

  function openRenameDialog(id) {
    state.renamingId = id;
    const collection = state.collections.find((item) => item.id === id);
    byId("rename-form").elements.name.value = collection?.name || "";
    byId("rename-dialog").showModal();
  }

  byId("login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    byId("login-message").textContent = "Signing in…";
    try {
      const data = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email: form.get("email"), password: form.get("password") }) }, false);
      sessionStorage.setItem(tokenKey, data.accessToken);
      sessionStorage.setItem(refreshKey, data.refreshToken);
      showApp(data.user?.email);
      await loadCatalog();
    } catch (error) { showLogin(error.message); }
  });

  byId("style-search").addEventListener("input", renderStyles);
  byId("collection-filter").addEventListener("change", renderStyles);
  byId("add-style").addEventListener("click", () => openStyleEditor());
  byId("refresh-button").addEventListener("click", loadCatalog);
  document.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => byId(button.dataset.close).close()));
  document.querySelectorAll(".side-link").forEach((button) => button.addEventListener("click", () => {
    document.querySelectorAll(".side-link").forEach((item) => item.classList.toggle("active", item === button));
    document.querySelectorAll(".panel-view").forEach((panel) => { panel.hidden = panel.id !== button.dataset.panel; });
  }));
  byId("style-form").elements.name.addEventListener("input", (event) => {
    if (!state.editingId) byId("style-form").elements.id.value = event.currentTarget.value.normalize("NFKD").toLowerCase().trim().replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  });

  byId("style-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const style = {
      id: fields.get("id"), name: fields.get("name"), description: fields.get("description"), prompt: fields.get("prompt"),
      thumbnail: fields.get("thumbnail") || null,
      previewImages: String(fields.get("previewImages") || "").split(/\r?\n/).map((url) => url.trim()).filter(Boolean),
      imageCount: Number(fields.get("imageCount")), tokensRequired: Number(fields.get("tokensRequired")),
      collections: [...form.querySelectorAll('input[name="collections"]:checked')].map((input) => input.value),
    };
    const save = form.querySelector('button[type="submit"]');
    save.disabled = true; save.textContent = "Saving…";
    try {
      await api(state.editingId ? `/api/admin/catalog/styles/${encodeURIComponent(state.editingId)}` : "/api/admin/catalog/styles", { method: state.editingId ? "PUT" : "POST", body: JSON.stringify(style) });
      byId("style-dialog").close();
      notify(state.editingId ? "Style saved. App and site will receive the new catalogue data from the backend." : "Style added to the live catalogue.");
      await loadCatalog();
    } catch (error) { byId("form-error").textContent = error.message; }
    finally { save.disabled = false; save.textContent = "Save style"; }
  });

  byId("collection-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await api("/api/admin/catalog/collections", { method: "POST", body: JSON.stringify({ name: form.get("name") }) });
      event.currentTarget.reset(); notify("Collection created."); await loadCatalog();
    } catch (error) { notify(error.message, true); }
  });

  byId("rename-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = new FormData(event.currentTarget).get("name");
    try {
      await api(`/api/admin/catalog/collections/${encodeURIComponent(state.renamingId)}`, { method: "PUT", body: JSON.stringify({ name }) });
      byId("rename-dialog").close(); notify("Collection renamed and assigned styles were updated."); await loadCatalog();
    } catch (error) { notify(error.message, true); }
  });

  byId("logout-button").addEventListener("click", async () => {
    try { await api("/api/auth/logout", { method: "POST" }, false); } catch { /* Clear the browser session even when the network is unavailable. */ }
    clearSession(); showLogin("You are signed out.");
  });

  if (!apiBase) showLogin("Set the backend URL in config.js before signing in.");
  else if (sessionStorage.getItem(tokenKey)) { showApp(""); void loadCatalog(); }
})();
