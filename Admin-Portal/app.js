(() => {
  const apiBase = String(window.PICMEE_API_BASE || "").replace(/\/$/, "");
  const tokenKey = "picmee_admin_access";
  const refreshKey = "picmee_admin_refresh";
  const state = { styles: [], collections: [], sections: [], logs: [], logMembers: [], logPage: 1, logPagination: null, pendingCloudinaryCleanup: 0, activePanel: "styles-panel", editingId: null, renamingId: null };
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
      state.pendingCloudinaryCleanup = Number(data.pendingCloudinaryCleanup || 0);
      const cleanupButton = byId("retry-cloudinary-cleanup");
      cleanupButton.hidden = state.pendingCloudinaryCleanup === 0;
      cleanupButton.textContent = `Retry image cleanup (${state.pendingCloudinaryCleanup})`;
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

  async function loadLogs(page = state.logPage) {
    const params = new URLSearchParams({ page: String(page), limit: "50" });
    if (byId("log-member-filter").value) params.set("member", byId("log-member-filter").value);
    if (byId("log-action-filter").value) params.set("action", byId("log-action-filter").value);
    try {
      const data = await api(`/api/admin/catalog/logs?${params}`);
      state.logs = data.logs || [];
      state.logMembers = data.members || [];
      state.logPage = data.pagination?.page || page;
      state.logPagination = data.pagination || { page, total: 0, totalPages: 0 };
      renderLogs();
    } catch (error) { notify(error.message, true); }
  }

  function renderLogs() {
    const memberFilter = byId("log-member-filter");
    const selectedMember = memberFilter.value;
    memberFilter.innerHTML = '<option value="">All team members</option>' + state.logMembers.map((member) => `<option value="${escapeHtml(member.email)}">${escapeHtml(member.name)} (${escapeHtml(member.email)})</option>`).join("");
    if ([...memberFilter.options].some((option) => option.value === selectedMember)) memberFilter.value = selectedMember;

    const actions = {
      STYLE_CREATED: "Style created", STYLE_UPDATED: "Style updated", STYLE_DELETED: "Style deleted",
      COLLECTION_CREATED: "Collection created", COLLECTION_RENAMED: "Collection renamed",
      HOME_SECTION_UPDATED: "Home visibility changed",
    };
    const body = byId("logs-body");
    if (!state.logs.length) {
      body.innerHTML = '<tr><td colspan="4" class="logs-empty">No changes match these filters.</td></tr>';
    } else {
      body.innerHTML = state.logs.map((log) => `<tr><td>${escapeHtml(new Date(log.createdAt).toLocaleString())}</td><td><span class="log-member-name">${escapeHtml(log.actorName || log.actorEmail)}</span><span class="log-member-email">${escapeHtml(log.actorEmail)}</span></td><td><span class="log-action">${escapeHtml(actions[log.action] || log.action)}</span></td><td>${escapeHtml(log.itemName)}<span class="log-item-id">${escapeHtml(log.itemId)}</span></td></tr>`).join("");
    }
    const pagination = state.logPagination || { page: 1, total: 0, totalPages: 0 };
    byId("logs-page-label").textContent = pagination.total ? `Page ${pagination.page} of ${pagination.totalPages} · ${pagination.total} changes` : "No changes recorded yet";
    byId("logs-previous").disabled = pagination.page <= 1;
    byId("logs-next").disabled = pagination.page >= pagination.totalPages;
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
        : '';
      const chips = (style.collections || []).map((name) => `<span class="chip">${escapeHtml(name)}</span>`).join("");
      return `<article class="style-card"><div class="style-image ${style.thumbnail ? "" : "missing-image"}">${img}<div class="app-preview-plus">＋</div><div class="app-preview-caption"><strong>${escapeHtml(style.name)}</strong><span>Try now</span></div></div><div class="style-body"><div class="style-description">${escapeHtml(style.description)}</div><div class="style-id">ID · ${escapeHtml(style.id)}</div><div class="chips">${chips || '<span class="muted">No collection</span>'}</div><div class="card-footer"><span>${Number(style.tokensRequired)} credits · ${Number(style.imageCount)} photo${Number(style.imageCount) === 1 ? "" : "s"}</span><span><button class="edit-button" data-edit="${escapeHtml(style.id)}">Edit</button><button class="delete-button" data-delete="${escapeHtml(style.id)}">Delete</button></span></div></div></article>`;
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
      const result = await api(`/api/admin/catalog/styles/${encodeURIComponent(id)}`, { method: "DELETE" });
      notify(result.cloudinaryCleanupPending
        ? "Style deleted. Cloudinary cleanup is pending and will be retried from the portal."
        : "Style permanently deleted.", Boolean(result.cloudinaryCleanupPending));
      await loadCatalog();
    } catch (error) { notify(error.message, true); }
  }

  function openStyleEditor(id = null) {
    state.editingId = id;
    const form = byId("style-form");
    form.reset();
    byId("thumbnail-upload-status").textContent = "Images are organized under the first selected collection.";
    form.elements.tokensRequired.value = "10";
    byId("form-error").textContent = "";
    const style = state.styles.find((item) => item.id === id);
    byId("dialog-title").textContent = style ? "Edit style" : "Add a style";
    if (style) {
      form.elements.name.value = style.name;
      form.elements.description.value = style.description;
      form.elements.prompt.value = style.prompt;
      form.elements.thumbnail.value = style.thumbnail || "";
      form.elements.thumbnailPublicId.value = style.thumbnailPublicId || "";
      form.elements.previewImages.value = (style.previewImages || []).join("\n");
      form.elements.imageCount.value = String(style.imageCount);
      form.elements.tokensRequired.value = String(style.tokensRequired);
    }
    updateIdPreview(form.elements.name.value, style?.id);
    renderCollectionOptions();
    if (style) for (const input of form.querySelectorAll('input[name="collections"]')) input.checked = style.collections.includes(input.value);
    else {
      const fallback = [...form.querySelectorAll('input[name="collections"]')].find((input) => input.value.toLowerCase() === "other");
      if (fallback) fallback.checked = true;
    }
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
  byId("refresh-button").addEventListener("click", () => {
    if (state.activePanel === "logs-panel") void loadLogs(1);
    else void loadCatalog();
  });
  document.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => byId(button.dataset.close).close()));
  document.querySelectorAll(".side-link").forEach((button) => button.addEventListener("click", () => {
    state.activePanel = button.dataset.panel;
    document.querySelectorAll(".side-link").forEach((item) => item.classList.toggle("active", item === button));
    document.querySelectorAll(".panel-view").forEach((panel) => { panel.hidden = panel.id !== button.dataset.panel; });
    if (state.activePanel === "logs-panel") void loadLogs(1);
  }));
  byId("log-member-filter").addEventListener("change", () => loadLogs(1));
  byId("log-action-filter").addEventListener("change", () => loadLogs(1));
  byId("logs-refresh").addEventListener("click", () => loadLogs(1));
  byId("logs-previous").addEventListener("click", () => loadLogs(Math.max(1, state.logPage - 1)));
  byId("logs-next").addEventListener("click", () => loadLogs(state.logPage + 1));
  byId("style-form").elements.thumbnail.addEventListener("input", () => { byId("style-form").elements.thumbnailPublicId.value = ""; });
  byId("upload-thumbnail").addEventListener("click", () => byId("thumbnail-file").click());
  byId("thumbnail-file").addEventListener("change", async (event) => {
    const fileInput = event.currentTarget;
    const file = fileInput.files?.[0];
    if (!file) return;
    const status = byId("thumbnail-upload-status");
    const uploadButton = byId("upload-thumbnail");
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/avif"];
    if (!allowedTypes.includes(file.type) || file.size > 10 * 1024 * 1024) {
      status.textContent = "Choose a JPG, PNG, WebP or AVIF image up to 10 MB.";
      fileInput.value = "";
      return;
    }
    const collections = [...byId("style-form").querySelectorAll('input[name="collections"]:checked')].map((input) => input.value);
    uploadButton.disabled = true;
    uploadButton.textContent = "Uploading…";
    status.textContent = "Preparing a secure Cloudinary upload…";
    try {
      const signed = await api("/api/admin/catalog/cloudinary/signature", {
        method: "POST", body: JSON.stringify({ collections: collections.length ? collections : ["Other"] }),
      });
      const uploadForm = new FormData();
      uploadForm.append("file", file);
      uploadForm.append("api_key", signed.apiKey);
      uploadForm.append("timestamp", String(signed.timestamp));
      uploadForm.append("folder", signed.folder);
      uploadForm.append("public_id", signed.publicId);
      uploadForm.append("tags", signed.tags);
      uploadForm.append("signature", signed.signature);
      const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(signed.cloudName)}/image/upload`, { method: "POST", body: uploadForm });
      const uploaded = await response.json().catch(() => ({}));
      if (!response.ok || !uploaded.secure_url || !uploaded.public_id) throw new Error(uploaded.error?.message || "Cloudinary upload failed.");
      const form = byId("style-form");
      form.elements.thumbnail.value = uploaded.secure_url;
      form.elements.thumbnailPublicId.value = uploaded.public_id;
      status.textContent = `Uploaded to ${signed.folder}. Save the style to keep this image linked.`;
    } catch (error) {
      status.textContent = error.message || "Cloudinary upload failed.";
    } finally {
      uploadButton.disabled = false;
      uploadButton.textContent = "Upload image to Cloudinary";
      fileInput.value = "";
    }
  });
  byId("retry-cloudinary-cleanup").addEventListener("click", async () => {
    const button = byId("retry-cloudinary-cleanup");
    button.disabled = true;
    try {
      const result = await api("/api/admin/catalog/cloudinary/retry-cleanup", { method: "POST", body: "{}" });
      notify(result.pending ? `${result.pending} Cloudinary image cleanup${result.pending === 1 ? "" : "s"} still pending.` : "Cloudinary image cleanup is complete.", Boolean(result.pending));
      await loadCatalog();
    } catch (error) { notify(error.message, true); }
    finally { button.disabled = false; }
  });
  byId("style-form").elements.name.addEventListener("input", (event) => updateIdPreview(event.currentTarget.value, state.editingId));

  function updateIdPreview(name, existingId = null) {
    const id = existingId || String(name || "").normalize("NFKD").toLowerCase().trim().replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "style-id-from-name";
    byId("style-id-preview").textContent = id;
  }

  byId("style-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const style = {
      id: String(fields.get("name") || "").normalize("NFKD").toLowerCase().trim().replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""), name: fields.get("name"), description: fields.get("description"), prompt: fields.get("prompt"),
      thumbnail: fields.get("thumbnail") || null,
      thumbnailPublicId: fields.get("thumbnailPublicId") || null,
      previewImages: String(fields.get("previewImages") || "").split(/\r?\n/).map((url) => url.trim()).filter(Boolean),
      imageCount: Number(fields.get("imageCount")), tokensRequired: Number(fields.get("tokensRequired")),
      collections: [...form.querySelectorAll('input[name="collections"]:checked')].map((input) => input.value),
    };
    const save = form.querySelector('button[type="submit"]');
    save.disabled = true; save.textContent = "Saving…";
    try {
      const result = await api(state.editingId ? `/api/admin/catalog/styles/${encodeURIComponent(state.editingId)}` : "/api/admin/catalog/styles", { method: state.editingId ? "PUT" : "POST", body: JSON.stringify(style) });
      byId("style-dialog").close();
      notify(result.cloudinaryCleanupPending
        ? "Style saved. The replaced Cloudinary image cleanup is pending and will be retried from the portal."
        : state.editingId ? "Style saved. App and site will receive the new catalogue data from the backend." : "Style added to the live catalogue.", Boolean(result.cloudinaryCleanupPending));
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
