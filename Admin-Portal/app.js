(() => {
  const apiBase = String(window.PICMEE_API_BASE || "").replace(/\/$/, "");
  const tokenKey = "picmee_admin_access";
  const refreshKey = "picmee_admin_refresh";
  const state = { styles: [], collections: [], sections: [], logs: [], logMembers: [], logPage: 1, logPagination: null, pendingCloudinaryCleanup: 0, activePanel: "styles-panel", editingId: null, renamingId: null, styleEditorBaseline: null, catalogLoaded: false, catalogLoading: false, logsLoading: false, promptTestFile: null, promptTestOriginalUrl: null, promptTestResultUrl: null, promptTestDownloadUrl: null, promptTestGenerating: false };
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
    if (state.catalogLoading) return;
    state.catalogLoading = true;
    const refreshButton = byId("refresh-button");
    refreshButton.disabled = true;
    refreshButton.classList.add("is-loading");
    refreshButton.setAttribute("aria-label", "Refreshing catalogue");
    byId("styles-grid").setAttribute("aria-busy", "true");
    byId("collections-list").setAttribute("aria-busy", "true");
    if (!state.catalogLoaded) {
      byId("styles-grid").innerHTML = `<div class="catalogue-skeleton" aria-label="Loading styles">${Array.from({ length: 8 }, () => '<div class="skeleton-card"><div class="skeleton-image"></div><div class="skeleton-lines"><i></i><i></i><i></i></div></div>').join("")}</div>`;
      byId("collections-list").innerHTML = '<div class="loading-message"><span class="loading-spinner"></span>Loading collections…</div>';
    }
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
      state.catalogLoaded = true;
    } catch (error) {
      if (error.message.includes("not allowed")) {
        clearSession();
        showLogin("This account can sign in, but it has not been approved for catalogue access. Ask the Madds Studio owner to add its email to the backend ADMIN_EMAILS setting.");
      } else if (!byId("login-view").hidden) {
        showLogin(error.message);
      } else notify(error.message, true);
      if (!state.catalogLoaded) {
        byId("styles-grid").innerHTML = '<div class="empty-state">Could not load the catalogue. Use the refresh button to try again.</div>';
        byId("collections-list").innerHTML = '<div class="empty-state">Could not load collections. Use the refresh button to try again.</div>';
      }
    } finally {
      state.catalogLoading = false;
      refreshButton.disabled = false;
      refreshButton.classList.remove("is-loading");
      refreshButton.setAttribute("aria-label", "Refresh catalogue");
      byId("styles-grid").setAttribute("aria-busy", "false");
      byId("collections-list").setAttribute("aria-busy", "false");
    }
  }

  async function loadLogs(page = state.logPage) {
    if (state.logsLoading) return;
    state.logsLoading = true;
    const params = new URLSearchParams({ page: String(page), limit: "50" });
    if (byId("log-member-filter").value) params.set("member", byId("log-member-filter").value);
    if (byId("log-action-filter").value) params.set("action", byId("log-action-filter").value);
    const refreshButton = byId("logs-refresh");
    refreshButton.disabled = true;
    refreshButton.textContent = "Loading…";
    byId("logs-body").setAttribute("aria-busy", "true");
    byId("logs-body").innerHTML = '<tr><td colspan="4" class="logs-loading"><span class="loading-spinner"></span>Loading change logs…</td></tr>';
    try {
      const data = await api(`/api/admin/catalog/logs?${params}`);
      state.logs = data.logs || [];
      state.logMembers = data.members || [];
      state.logPage = data.pagination?.page || page;
      state.logPagination = data.pagination || { page, total: 0, totalPages: 0 };
      renderLogs();
    } catch (error) { notify(error.message, true); renderLogs(); }
    finally {
      state.logsLoading = false;
      refreshButton.disabled = false;
      refreshButton.textContent = "Refresh logs";
      byId("logs-body").setAttribute("aria-busy", "false");
    }
  }

  function renderLogs() {
    const memberFilter = byId("log-member-filter");
    const selectedMember = memberFilter.value;
    memberFilter.innerHTML = '<option value="">All team members</option>' + state.logMembers.map((member) => `<option value="${escapeHtml(member.email)}">${escapeHtml(member.name)} (${escapeHtml(member.email)})</option>`).join("");
    if ([...memberFilter.options].some((option) => option.value === selectedMember)) memberFilter.value = selectedMember;

    const actions = {
      STYLE_CREATED: "Style created", STYLE_UPDATED: "Style updated", STYLE_DELETED: "Style deleted",
      COLLECTION_CREATED: "Collection created", COLLECTION_RENAMED: "Collection renamed", COLLECTION_DELETED: "Collection deleted",
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
    const verification = byId("verification-filter").value;
    const filtered = state.styles.filter((style) => {
      const matchesCollection = !collection || style.collections.includes(collection);
      const matchesVerification = verification === "all" || (verification === "verified" ? style.verified === true : style.verified !== true);
      const searchable = `${style.name} ${style.id} ${style.description} ${style.prompt}`.toLowerCase();
      return matchesCollection && matchesVerification && (!query || searchable.includes(query));
    });
    sortItems(filtered, byId("style-sort").value);
    byId("style-count").textContent = String(state.styles.length);
    byId("result-count").textContent = `${filtered.length} shown`;
    const grid = byId("styles-grid");
    if (!filtered.length) {
      grid.innerHTML = '<div class="empty-state">No styles match. Try another search or add a new style.</div>';
      return;
    }
    grid.innerHTML = filtered.map((style) => {
      const coverUrl = style.thumbnail || "";
      const img = coverUrl
        ? `<img src="${escapeHtml(coverUrl)}" alt="${escapeHtml(style.name)} cover" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentElement.innerHTML='<div class=\'image-placeholder\'>Preview unavailable</div>'">`
        : '';
      const collection = (style.collections || [])[0];
      const collectionBadge = collection
        ? `<span class="style-collection-pill">${escapeHtml(collection)}</span>`
        : '<span class="style-collection-pill">No collection</span>';
      const verificationBadge = style.verified === true
        ? '<span class="verification-badge is-verified">✓ Verified</span>'
        : '<span class="verification-badge is-unverified">Unverified</span>';
      return `<article class="style-card website-style-card" data-style-open="${escapeHtml(style.id)}"><div class="style-image ${coverUrl ? "" : "missing-image"}">${img}${collectionBadge}</div><div class="style-body"><h3 class="style-card-title">${escapeHtml(style.name)}</h3><div class="style-description">${escapeHtml(style.description)}</div><div class="style-admin-footer"><span class="style-id">ID · ${escapeHtml(style.id)}</span>${verificationBadge}<span><button class="edit-button" data-edit="${escapeHtml(style.id)}">Edit</button><button class="delete-button" data-delete="${escapeHtml(style.id)}">Delete</button></span></div></div></article>`;
    }).join("");
    grid.querySelectorAll("[data-style-open]").forEach((card) => card.addEventListener("click", (event) => {
      if (event.target.closest("button, a")) return;
      openStyleEditor(card.dataset.styleOpen);
    }));
    grid.querySelectorAll("[data-edit]").forEach((button) => button.addEventListener("click", () => openStyleEditor(button.dataset.edit)));
    grid.querySelectorAll("[data-delete]").forEach((button) => button.addEventListener("click", () => deleteStyle(button.dataset.delete)));
  }

  const styleImageMaxBytes = 300_000;

  async function loadImageForCompression(file) {
    if (typeof createImageBitmap === "function") {
      try {
        return await createImageBitmap(file, { imageOrientation: "from-image" });
      } catch {
        // Fall back for browsers that decode the format but lack this option.
      }
    }
    const sourceUrl = URL.createObjectURL(file);
    try {
      return await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("The selected image could not be opened."));
        image.src = sourceUrl;
      });
    } finally {
      URL.revokeObjectURL(sourceUrl);
    }
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("The image could not be compressed in this browser.")), type, quality);
    });
  }

  async function exportStyleImage(canvas, quality) {
    let blob = await canvasToBlob(canvas, "image/webp", quality);
    if (blob.type === "image/webp") return blob;

    // Older browsers may not encode WebP. Studio images are photos, so use a
    // white-backed JPEG fallback to avoid black transparency when exporting.
    const jpegCanvas = document.createElement("canvas");
    jpegCanvas.width = canvas.width;
    jpegCanvas.height = canvas.height;
    const context = jpegCanvas.getContext("2d");
    if (!context) throw new Error("The image could not be compressed in this browser.");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, jpegCanvas.width, jpegCanvas.height);
    context.drawImage(canvas, 0, 0);
    blob = await canvasToBlob(jpegCanvas, "image/jpeg", quality);
    if (blob.type !== "image/jpeg") throw new Error("This browser cannot encode a compressed image. Try Chrome or Edge.");
    return blob;
  }

  async function compressStyleImage(file) {
    let image;
    try {
      image = await loadImageForCompression(file);
      const sourceWidth = image.width || image.naturalWidth;
      const sourceHeight = image.height || image.naturalHeight;
      if (!sourceWidth || !sourceHeight) throw new Error("The selected image has invalid dimensions.");

      let scale = Math.min(1, 900 / sourceWidth, 1260 / sourceHeight);
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d", { alpha: true });
      if (!context) throw new Error("The image could not be compressed in this browser.");

      for (let dimensionPass = 0; dimensionPass < 10; dimensionPass += 1) {
        const width = Math.max(1, Math.round(sourceWidth * scale));
        const height = Math.max(1, Math.round(sourceHeight * scale));
        canvas.width = width;
        canvas.height = height;
        context.clearRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);

        let lowQuality = 0.48;
        let highQuality = 0.92;
        let bestBlob = null;
        for (let qualityPass = 0; qualityPass < 8; qualityPass += 1) {
          const quality = (lowQuality + highQuality) / 2;
          const blob = await exportStyleImage(canvas, quality);
          if (blob.size <= styleImageMaxBytes) {
            bestBlob = blob;
            lowQuality = quality;
          } else {
            highQuality = quality;
          }
        }

        if (bestBlob) {
          const extension = bestBlob.type === "image/webp" ? "webp" : "jpg";
          const baseName = file.name.replace(/\.[^.]+$/, "") || "madds-style-image";
          return {
            file: new File([bestBlob], `${baseName}.${extension}`, { type: bestBlob.type, lastModified: Date.now() }),
            width,
            height,
          };
        }
        scale *= 0.84;
      }
      throw new Error("This image could not be reduced below 300 KB. Choose a smaller image and try again.");
    } finally {
      if (typeof image?.close === "function") image.close();
    }
  }

  async function uploadStyleExampleImage(kind, fileInput) {
    const file = fileInput.files?.[0];
    if (!file) return;
    const cover = kind === "cover";
    const before = kind === "before";
    const prefix = cover ? "cover" : (before ? "before" : "after");
    const button = byId(`upload-${prefix}-image`);
    const status = byId(`${prefix}-image-status`);
    const preview = byId(`${prefix}-image-preview`);
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/avif"];
    if (!allowedTypes.includes(file.type) || file.size > 10 * 1024 * 1024) {
      status.textContent = "Choose a JPG, PNG, WebP or AVIF image up to 10 MB.";
      fileInput.value = "";
      return;
    }

    const collections = [...byId("style-form").querySelectorAll('input[name="collections"]:checked')].map((input) => input.value);
    button.disabled = true;
    button.textContent = "Compressing…";
    status.textContent = "Compressing image to 300 KB or less…";
    try {
      const compressed = await compressStyleImage(file);
      status.textContent = `Compressed to ${(compressed.file.size / 1000).toFixed(0)} KB · ${compressed.width} × ${compressed.height}. Uploading…`;
      button.textContent = "Uploading…";
      const signed = await api("/api/admin/catalog/cloudinary/signature", {
        method: "POST", body: JSON.stringify({ collections: collections.length ? collections : ["Other"] }),
      });
      const uploadForm = new FormData();
      uploadForm.append("file", compressed.file);
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
      const urlField = cover ? "thumbnail" : (before ? "exampleBeforeUrl" : "exampleAfterUrl");
      const idField = cover ? "thumbnailPublicId" : (before ? "exampleBeforePublicId" : "exampleAfterPublicId");
      form.elements[urlField].value = uploaded.secure_url;
      form.elements[idField].value = uploaded.public_id;
      if (cover) form.elements.thumbnail.value = uploaded.secure_url;
      if (!cover) {
        const previewUrls = [form.elements.exampleBeforeUrl.value, form.elements.exampleAfterUrl.value];
        const previewIds = [form.elements.exampleBeforePublicId.value, form.elements.exampleAfterPublicId.value];
        if (previewUrls.every(Boolean) && previewIds.every(Boolean)) {
          form.elements.previewImages.value = previewUrls.join("\n");
          form.elements.previewImagePublicIds.value = previewIds.join("\n");
        }
      }
      preview.src = uploaded.secure_url;
      preview.hidden = false;
      status.textContent = `Uploaded compressed image · ${(compressed.file.size / 1000).toFixed(0)} KB · ${compressed.width} × ${compressed.height}. Save the style to keep it.`;
    } catch (error) {
      status.textContent = error.message || "Cloudinary upload failed.";
    } finally {
      button.disabled = false;
      button.textContent = cover ? "Upload cover image" : (before ? "Upload before preview" : "Upload after preview");
      fileInput.value = "";
    }
  }

  async function generatePromptTestImage() {
    const prompt = byId("prompt-test-prompt").value.trim();
    const error = byId("prompt-test-error");
    const button = byId("generate-test-image");
    error.textContent = "";
    if (!state.promptTestFile) {
      error.textContent = "Choose an original image first.";
      return;
    }
    if (!prompt) {
      error.textContent = "Enter a prompt first.";
      return;
    }

    if (state.promptTestGenerating) return;
    state.promptTestGenerating = true;
    button.disabled = true;
    button.textContent = "Generating with Qwen…";
    byId("prompt-test-progress").hidden = false;
    if (!state.promptTestResultUrl) byId("prompt-test-empty").hidden = true;
    byId("prompt-test-progress-status").textContent = "Sending your image and prompt to Qwen…";
    byId("prompt-test-nav-status").hidden = false;
    byId("prompt-test-nav-status").textContent = "Generating";
    const progressMessages = ["Qwen is creating your style preview…", "Working on the details…", "Still generating. You can keep using the other Studio sections."];
    let messageIndex = 0;
    const progressTimer = window.setInterval(() => {
      messageIndex = Math.min(messageIndex + 1, progressMessages.length - 1);
      byId("prompt-test-progress-status").textContent = progressMessages[messageIndex];
    }, 7000);
    try {
      const body = new FormData();
      body.append("image", state.promptTestFile);
      body.append("prompt", prompt);
      const result = await api("/api/admin/catalog/test-generation", { method: "POST", body });
      if (!result.image) throw new Error("Qwen returned no image. Try again.");
      if (state.promptTestResultUrl) URL.revokeObjectURL(state.promptTestResultUrl);
      const imageBlob = await fetch(result.image).then((response) => response.blob());
      state.promptTestResultUrl = URL.createObjectURL(imageBlob);
      byId("prompt-test-result-image").src = state.promptTestResultUrl;
      byId("prompt-test-result-image").hidden = false;
      byId("prompt-test-empty").hidden = true;
      byId("test-export-controls").hidden = false;
      byId("prompt-test-progress").hidden = true;
      byId("prompt-test-nav-status").textContent = "Ready";
      byId("download-test-status").textContent = "";
    } catch (cause) {
      error.textContent = cause.message || "Could not generate a test image.";
      byId("prompt-test-progress").hidden = true;
      byId("prompt-test-nav-status").textContent = "Failed";
      if (!state.promptTestResultUrl) byId("prompt-test-empty").hidden = false;
    } finally {
      window.clearInterval(progressTimer);
      state.promptTestGenerating = false;
      button.disabled = false;
      button.textContent = "Generate test image";
    }
  }

  async function prepareAndDownloadTestImage() {
    const button = byId("download-test-image");
    const status = byId("download-test-status");
    const ratioParts = byId("test-export-aspect").value.split(":").map(Number);
    const ratioWidth = ratioParts[0];
    const ratioHeight = ratioParts[1];
    const targetRatio = ratioWidth / ratioHeight;
    const selectedQuality = Number(byId("test-export-quality").value) / 100;
    const maxBytes = 300_000;
    const image = new Image();
    button.disabled = true;
    button.textContent = "Preparing download…";
    status.textContent = "Cropping and compressing a copy. The Qwen preview is unchanged.";

    try {
      image.src = state.promptTestResultUrl;
      await image.decode();
      const sourceRatio = image.naturalWidth / image.naturalHeight;
      let sx = 0;
      let sy = 0;
      let sw = image.naturalWidth;
      let sh = image.naturalHeight;
      if (sourceRatio > targetRatio) {
        sw = image.naturalHeight * targetRatio;
        sx = (image.naturalWidth - sw) / 2;
      } else {
        sh = image.naturalWidth / targetRatio;
        sy = (image.naturalHeight - sh) / 2;
      }

      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("This browser cannot prepare the download.");
      let scale = 1;
      let quality = selectedQuality;
      let exportBlob = null;
      let actualMime = "image/webp";

      for (let attempt = 0; attempt < 40; attempt += 1) {
        const ratioUnit = Math.max(1, Math.floor(Math.min(sw * scale / ratioWidth, sh * scale / ratioHeight)));
        canvas.width = ratioUnit * ratioWidth;
        canvas.height = ratioUnit * ratioHeight;
        context.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
        exportBlob = await canvasToBlob(canvas, "image/webp", quality);
        if (exportBlob.type !== "image/webp") {
          actualMime = "image/jpeg";
          exportBlob = await canvasToBlob(canvas, actualMime, quality);
        }
        if (exportBlob.size <= maxBytes) break;
        if (quality > 0.4) quality = Math.max(0.4, quality - 0.1);
        else {
          scale *= 0.86;
          quality = selectedQuality;
        }
      }

      if (!exportBlob || exportBlob.size > maxBytes) {
        throw new Error("Could not compress this image below 300 KB. Try a lower quality setting.");
      }
      if (state.promptTestDownloadUrl) URL.revokeObjectURL(state.promptTestDownloadUrl);
      state.promptTestDownloadUrl = URL.createObjectURL(exportBlob);
      const ratioLabel = byId("test-export-aspect").value.replace(":", "x");
      const extension = actualMime === "image/webp" ? "webp" : "jpg";
      const link = document.createElement("a");
      link.href = state.promptTestDownloadUrl;
      link.download = `madds-prompt-test-${ratioLabel}.${extension}`;
      document.body.append(link);
      link.click();
      link.remove();
      const sizeKb = (exportBlob.size / 1000).toFixed(0);
      const effectiveQuality = Math.round(quality * 100);
      status.textContent = `Downloaded ${sizeKb} KB · ${byId("test-export-aspect").value} · ${effectiveQuality}% quality`;
    } catch (cause) {
      status.textContent = cause.message || "Could not prepare the download.";
    } finally {
      button.disabled = false;
      button.textContent = "Prepare and download";
    }
  }

  function canvasToBlob(canvas, mimeType, quality) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Could not encode the image in this browser."));
      }, mimeType, quality);
    });
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
    const collections = [...state.collections];
    sortItems(collections, byId("collection-sort").value);
    root.innerHTML = collections.map((collection) => {
      const count = state.styles.filter((style) => style.collections.includes(collection.name)).length;
      const section = state.sections.find((item) => String(item.slug).toLowerCase() === collection.name.toLowerCase());
      const visible = Boolean(section?.visible);
      const isFallback = collection.name.trim().toLowerCase() === "other";
      return `<div class="collection-row"><div><div class="collection-name">${escapeHtml(collection.name)}</div><div class="collection-meta">ID: ${escapeHtml(collection.id)}</div></div><label class="home-control collection-check"><input class="home-toggle" type="checkbox" data-home="${escapeHtml(section?.id || "")}" ${visible ? "checked" : ""} ${section ? "" : "disabled"}>Show on Home</label><div class="collection-count">${count} style${count === 1 ? "" : "s"}</div><div class="collection-actions"><button class="text-button" data-rename="${escapeHtml(collection.id)}">Rename</button><button class="delete-button collection-delete" data-delete-collection="${escapeHtml(collection.id)}" ${isFallback ? 'disabled title="Other is the protected fallback collection."' : ""}>Delete</button></div></div>`;
    }).join("");
    root.querySelectorAll("[data-rename]").forEach((button) => button.addEventListener("click", () => openRenameDialog(button.dataset.rename)));
    root.querySelectorAll("[data-delete-collection]").forEach((button) => button.addEventListener("click", () => deleteCollection(button.dataset.deleteCollection)));
    root.querySelectorAll("[data-home]").forEach((input) => input.addEventListener("change", () => updateHomeVisibility(input.dataset.home, input.checked)));
  }

  function sortItems(items, sort) {
    const [field, direction] = String(sort || "name-asc").split("-");
    const multiplier = direction === "desc" ? -1 : 1;
    items.sort((left, right) => {
      if (field === "created" || field === "updated") {
        const key = field === "created" ? "createdAt" : "updatedAt";
        const leftTime = Date.parse(left[key] || "") || 0;
        const rightTime = Date.parse(right[key] || "") || 0;
        return (leftTime - rightTime) * multiplier || left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
      }
      return left.name.localeCompare(right.name, undefined, { sensitivity: "base" }) * multiplier;
    });
  }

  async function deleteCollection(id) {
    const collection = state.collections.find((item) => item.id === id);
    if (!collection || collection.name.trim().toLowerCase() === "other") return;
    const affectedCount = state.styles.filter((style) => style.collections.includes(collection.name)).length;
    if (!window.confirm(`Delete the “${collection.name}” collection? ${affectedCount} assigned style(s) will be updated: styles assigned only here move to Other, while styles assigned to other collections keep those assignments. Styles and Cloudinary images will not be deleted.`)) return;
    const button = [...document.querySelectorAll("[data-delete-collection]")].find((item) => item.dataset.deleteCollection === id);
    if (button) { button.disabled = true; button.textContent = "Deleting…"; }
    try {
      const result = await api(`/api/admin/catalog/collections/${encodeURIComponent(id)}`, { method: "DELETE" });
      state.collections = state.collections.filter((item) => item.id !== id);
      if (!state.collections.some((item) => item.name.trim().toLowerCase() === "other")) state.collections.push({ id: "other", name: "Other" });
      state.styles = state.styles.map((style) => {
        const remaining = style.collections.filter((name) => name !== collection.name);
        return { ...style, collections: remaining.length ? remaining : ["Other"] };
      });
      state.sections = state.sections.filter((section) => String(section.slug).toLowerCase() !== collection.name.toLowerCase());
      renderStyles(); renderCollections(); renderCollectionOptions();
      notify(`Collection deleted. ${Number(result.stylesMovedToOther || 0)} style(s) moved to Other; other collection assignments and images were kept.`);
    } catch (error) {
      notify(error.message, true);
      if (button) { button.disabled = false; button.textContent = "Delete"; }
    }
  }

  async function updateHomeVisibility(id, visible) {
    if (!id) return;
    const input = document.querySelector(`[data-home="${CSS.escape(id)}"]`);
    if (input) input.disabled = true;
    try {
      const result = await api(`/api/admin/catalog/home-sections/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ visible }) });
      const index = state.sections.findIndex((section) => section.id === id);
      if (index >= 0) state.sections[index] = result.section;
      notify(visible ? "Collection will appear on the app Home screen." : "Collection hidden from the app Home screen.");
    } catch (error) { notify(error.message, true); await loadCatalog(); }
    finally { if (input?.isConnected) input.disabled = false; }
  }

  async function deleteStyle(id) {
    const style = state.styles.find((item) => item.id === id);
    if (!style) return;
    if (!window.confirm(`Permanently delete “${style.name}”? It will disappear from the catalogue and users’ favorites. Existing generation history will remain.`)) return;
    const deleteButton = [...document.querySelectorAll("[data-delete]")].find((button) => button.dataset.delete === id);
    if (deleteButton) { deleteButton.disabled = true; deleteButton.textContent = "Deleting…"; }
    try {
      const result = await api(`/api/admin/catalog/styles/${encodeURIComponent(id)}`, { method: "DELETE" });
      state.styles = state.styles.filter((item) => item.id !== id);
      if (result.cloudinaryCleanupPending) state.pendingCloudinaryCleanup += 1;
      const cleanupButton = byId("retry-cloudinary-cleanup");
      cleanupButton.hidden = state.pendingCloudinaryCleanup === 0;
      cleanupButton.textContent = `Retry image cleanup (${state.pendingCloudinaryCleanup})`;
      renderStyles();
      renderCollections();
      notify(result.cloudinaryCleanupPending
        ? "Style deleted. Cloudinary cleanup is pending and will be retried from the portal."
        : "Style permanently deleted.", Boolean(result.cloudinaryCleanupPending));
    } catch (error) { notify(error.message, true); if (deleteButton) { deleteButton.disabled = false; deleteButton.textContent = "Delete"; } }
  }

  function openStyleEditor(id = null) {
    state.editingId = id;
    const form = byId("style-form");
    form.reset();
    byId("before-image-preview").removeAttribute("src");
    byId("before-image-preview").hidden = true;
    byId("after-image-preview").removeAttribute("src");
    byId("after-image-preview").hidden = true;
    for (const image of ["cover", "before", "after"]) {
      byId(`${image}-image-preview`).removeAttribute("src");
      byId(`${image}-image-preview`).hidden = true;
    }
    byId("cover-image-status").textContent = "Required";
    byId("before-image-status").textContent = "Optional";
    byId("after-image-status").textContent = "Optional";
    form.elements.tokensRequired.value = "10";
    byId("form-error").textContent = "";
    const style = state.styles.find((item) => item.id === id);
    byId("dialog-title").textContent = style ? "Edit style" : "Add a style";
    if (style) {
      form.elements.name.value = style.name;
      form.elements.description.value = style.description;
      form.elements.prompt.value = style.prompt;
      form.elements.verified.checked = style.verified === true;
      const hasPreviewPair = (style.previewImages || []).length >= 2;
      const beforeUrl = (hasPreviewPair ? style.previewImages[0] : style.exampleBeforeUrl) || "";
      const afterUrl = (hasPreviewPair ? style.previewImages[1] : style.exampleAfterUrl) || "";
      form.elements.thumbnail.value = style.thumbnail || style.exampleBeforeUrl || "";
      form.elements.thumbnailPublicId.value = style.thumbnailPublicId || style.exampleBeforePublicId || "";
      form.elements.exampleBeforeUrl.value = beforeUrl;
      form.elements.exampleBeforePublicId.value = style.previewImagePublicIds?.[0] || style.exampleBeforePublicId || "";
      form.elements.exampleAfterUrl.value = afterUrl;
      form.elements.exampleAfterPublicId.value = style.previewImagePublicIds?.[1] || style.exampleAfterPublicId || "";
      form.elements.previewImages.value = (style.previewImages || []).join("\n");
      form.elements.previewImagePublicIds.value = (style.previewImagePublicIds || []).join("\n");
      const coverUrl = style.thumbnail || style.exampleBeforeUrl || "";
      if (coverUrl) {
        byId("cover-image-preview").src = coverUrl;
        byId("cover-image-preview").hidden = false;
        byId("cover-image-status").textContent = "Current cover image";
      }
      if (beforeUrl) {
        byId("before-image-preview").src = beforeUrl;
        byId("before-image-preview").hidden = false;
        byId("before-image-status").textContent = "Current before preview";
      }
      if (afterUrl) {
        byId("after-image-preview").src = afterUrl;
        byId("after-image-preview").hidden = false;
        byId("after-image-status").textContent = "Current after preview";
      }
      form.elements.imageCount.value = String(style.imageCount);
      form.elements.tokensRequired.value = String(style.tokensRequired);
    }
    updateIdPreview(form.elements.name.value, style?.id);
    renderCollectionOptions();
    if (style) for (const input of form.querySelectorAll('input[name="collections"]')) input.checked = style.collections.includes(input.value);
    state.styleEditorBaseline = styleEditorSnapshot();
    byId("copy-prompt-status").textContent = "";
    byId("style-dialog").showModal();
  }

  function styleEditorSnapshot() {
    const form = byId("style-form");
    const entries = [...new FormData(form).entries()];
    const selectedFiles = ["cover-image-file", "before-image-file", "after-image-file"].map((id) => {
      const file = byId(id).files?.[0];
      return file ? [file.name, file.size, file.lastModified] : null;
    });
    return JSON.stringify({ entries, selectedFiles });
  }

  function requestCloseStyleEditor() {
    if (state.styleEditorBaseline !== null && styleEditorSnapshot() !== state.styleEditorBaseline) {
      byId("discard-confirm-dialog").showModal();
      return;
    }
    state.styleEditorBaseline = null;
    byId("style-dialog").close();
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
    const submit = event.currentTarget.querySelector('button[type="submit"]');
    submit.disabled = true;
    submit.textContent = "Signing in…";
    try {
      const data = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email: form.get("email"), password: form.get("password") }) }, false);
      sessionStorage.setItem(tokenKey, data.accessToken);
      sessionStorage.setItem(refreshKey, data.refreshToken);
      showApp(data.user?.email);
      await loadCatalog();
    } catch (error) { showLogin(error.message); }
    finally { submit.disabled = false; submit.textContent = "Sign in"; }
  });

  byId("style-search").addEventListener("input", renderStyles);
  byId("collection-filter").addEventListener("change", renderStyles);
  byId("verification-filter").addEventListener("change", renderStyles);
  byId("style-sort").addEventListener("change", renderStyles);
  byId("collection-sort").addEventListener("change", renderCollections);
  byId("add-style").addEventListener("click", () => openStyleEditor());
  byId("refresh-button").addEventListener("click", () => {
    if (state.activePanel === "logs-panel") void loadLogs(1);
    else void loadCatalog();
  });
  document.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => {
    if (button.dataset.close === "style-dialog") requestCloseStyleEditor();
    else byId(button.dataset.close).close();
  }));
  byId("style-dialog").addEventListener("cancel", (event) => {
    event.preventDefault();
    requestCloseStyleEditor();
  });
  byId("keep-style-editing").addEventListener("click", () => byId("discard-confirm-dialog").close());
  byId("discard-style-editing").addEventListener("click", () => {
    byId("discard-confirm-dialog").close();
    state.styleEditorBaseline = null;
    byId("style-dialog").close();
  });
  byId("copy-style-prompt").addEventListener("click", async () => {
    const prompt = byId("style-prompt").value;
    const status = byId("copy-prompt-status");
    if (!prompt) {
      status.textContent = "There is no prompt to copy yet.";
      return;
    }
    try {
      await navigator.clipboard.writeText(prompt);
    } catch {
      const textarea = byId("style-prompt");
      textarea.focus();
      textarea.select();
      const copied = document.execCommand("copy");
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
      if (!copied) {
        status.textContent = "Copy was blocked by the browser. Select the prompt and copy it manually.";
        return;
      }
    }
    status.textContent = "Prompt copied.";
  });
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
  byId("cover-image-file").addEventListener("change", (event) => uploadStyleExampleImage("cover", event.currentTarget));
  byId("before-image-file").addEventListener("change", (event) => uploadStyleExampleImage("before", event.currentTarget));
  byId("after-image-file").addEventListener("change", (event) => uploadStyleExampleImage("after", event.currentTarget));
  byId("upload-cover-image").addEventListener("click", () => byId("cover-image-file").click());
  byId("upload-before-image").addEventListener("click", () => byId("before-image-file").click());
  byId("upload-after-image").addEventListener("click", () => byId("after-image-file").click());
  byId("prompt-test-image").addEventListener("change", (event) => {
    const file = event.currentTarget.files?.[0] || null;
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 10 * 1024 * 1024) {
      byId("prompt-test-error").textContent = "Choose a JPG, PNG or WebP image up to 10 MB.";
      event.currentTarget.value = "";
      return;
    }
    state.promptTestFile = file;
    if (state.promptTestOriginalUrl) URL.revokeObjectURL(state.promptTestOriginalUrl);
    state.promptTestOriginalUrl = URL.createObjectURL(file);
    byId("prompt-test-file-name").textContent = file.name;
    byId("prompt-test-original-preview").src = state.promptTestOriginalUrl;
    byId("prompt-test-original-preview").hidden = false;
    byId("prompt-test-error").textContent = "";
  });
  byId("generate-test-image").addEventListener("click", generatePromptTestImage);
  byId("download-test-image").addEventListener("click", prepareAndDownloadTestImage);
  byId("test-export-quality").addEventListener("input", (event) => {
    byId("test-export-quality-value").value = `${event.currentTarget.value}%`;
  });
  byId("retry-cloudinary-cleanup").addEventListener("click", async () => {
    const button = byId("retry-cloudinary-cleanup");
    button.disabled = true;
    try {
      const result = await api("/api/admin/catalog/cloudinary/retry-cleanup", { method: "POST", body: "{}" });
      const firstFailure = result.failures?.find((failure) => failure.lastError);
      const failureDetail = firstFailure ? ` ${firstFailure.styleName}: ${firstFailure.lastError}` : "";
      notify(result.pending
        ? `${result.pending} Cloudinary image cleanup${result.pending === 1 ? "" : "s"} still pending.${failureDetail}`
        : "Cloudinary image cleanup is complete.", Boolean(result.pending));
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
    if (!fields.get("thumbnail") || !fields.get("thumbnailPublicId")) {
      byId("form-error").textContent = "Upload a cover image before saving.";
      return;
    }
    const beforeUrl = String(fields.get("exampleBeforeUrl") || "");
    const afterUrl = String(fields.get("exampleAfterUrl") || "");
    const beforeId = String(fields.get("exampleBeforePublicId") || "");
    const afterId = String(fields.get("exampleAfterPublicId") || "");
    if (Boolean(beforeUrl || beforeId) !== Boolean(afterUrl || afterId) || (beforeUrl && !beforeId) || (afterUrl && !afterId)) {
      byId("form-error").textContent = "Before and after previews are optional, but upload both together.";
      return;
    }
    const previewImages = beforeUrl && afterUrl
      ? [beforeUrl, afterUrl]
      : String(fields.get("previewImages") || "").split(/\r?\n/).map((url) => url.trim()).filter(Boolean);
    const previewImagePublicIds = beforeUrl && afterUrl
      ? [beforeId, afterId]
      : String(fields.get("previewImagePublicIds") || "").split(/\r?\n/).map((id) => id.trim()).filter(Boolean);
    const style = {
      id: String(fields.get("name") || "").normalize("NFKD").toLowerCase().trim().replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""), name: fields.get("name"), description: fields.get("description"), prompt: fields.get("prompt"), verified: fields.get("verified") === "on",
      thumbnail: fields.get("thumbnail"),
      thumbnailPublicId: fields.get("thumbnailPublicId"),
      exampleBeforeUrl: beforeUrl || null,
      exampleBeforePublicId: beforeId || null,
      exampleAfterUrl: afterUrl || null,
      exampleAfterPublicId: afterId || null,
      previewImages,
      previewImagePublicIds,
      imageCount: Number(fields.get("imageCount")), tokensRequired: Number(fields.get("tokensRequired")),
      collections: [...form.querySelectorAll('input[name="collections"]:checked')].map((input) => input.value),
    };
    const save = form.querySelector('button[type="submit"]');
    save.disabled = true; save.textContent = "Saving…";
    try {
      const wasEditing = Boolean(state.editingId);
      const result = await api(state.editingId ? `/api/admin/catalog/styles/${encodeURIComponent(state.editingId)}` : "/api/admin/catalog/styles", { method: state.editingId ? "PUT" : "POST", body: JSON.stringify(style) });
      const savedAt = new Date().toISOString();
      const savedStyle = { ...result.style, createdAt: wasEditing ? state.styles.find((item) => item.id === result.style.id)?.createdAt : savedAt, updatedAt: savedAt };
      if (wasEditing) state.styles = state.styles.map((item) => item.id === result.style.id ? savedStyle : item);
      else state.styles = [savedStyle, ...state.styles];
      if (result.cloudinaryCleanupPending) state.pendingCloudinaryCleanup += 1;
      const cleanupButton = byId("retry-cloudinary-cleanup");
      cleanupButton.hidden = state.pendingCloudinaryCleanup === 0;
      cleanupButton.textContent = `Retry image cleanup (${state.pendingCloudinaryCleanup})`;
      renderStyles();
      renderCollections();
      state.styleEditorBaseline = null;
      byId("style-dialog").close();
      notify(result.cloudinaryCleanupPending
        ? "Style saved. The replaced Cloudinary image cleanup is pending and will be retried from the portal."
        : state.editingId ? "Style saved. App and site will receive the new catalogue data from the backend." : "Style added to the live catalogue.", Boolean(result.cloudinaryCleanupPending));
    } catch (error) { byId("form-error").textContent = error.message; }
    finally { save.disabled = false; save.textContent = "Save style"; }
  });

  byId("collection-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const collectionForm = event.currentTarget;
    const form = new FormData(collectionForm);
    const submit = collectionForm.querySelector('button[type="submit"]');
    submit.disabled = true;
    submit.textContent = "Creating…";
    collectionForm.setAttribute("aria-busy", "true");
    try {
      const result = await api("/api/admin/catalog/collections", { method: "POST", body: JSON.stringify({ name: form.get("name") }) });
      const createdAt = new Date().toISOString();
      state.collections = [...state.collections, { ...result.collection, createdAt, updatedAt: createdAt }].sort((a, b) => a.name.localeCompare(b.name));
      if (result.section && !state.sections.some((section) => section.id === result.section.id)) state.sections.push(result.section);
      collectionForm.reset();
      renderCollections();
      renderCollectionOptions();
      notify("Collection created and ready to assign.");
    } catch (error) { notify(error.message, true); }
    finally { submit.disabled = false; submit.textContent = "Create collection"; collectionForm.setAttribute("aria-busy", "false"); }
  });

  byId("rename-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const renameForm = event.currentTarget;
    const name = new FormData(renameForm).get("name");
    const submit = renameForm.querySelector('button[type="submit"]');
    submit.disabled = true; submit.textContent = "Saving…";
    try {
      const result = await api(`/api/admin/catalog/collections/${encodeURIComponent(state.renamingId)}`, { method: "PUT", body: JSON.stringify({ name }) });
      const previous = state.collections.find((item) => item.id === state.renamingId);
      const oldName = previous?.name;
      const renamedAt = new Date().toISOString();
      state.collections = state.collections.map((item) => item.id === state.renamingId ? { ...result.collection, createdAt: item.createdAt, updatedAt: renamedAt } : item).sort((a, b) => a.name.localeCompare(b.name));
      if (oldName) {
        state.styles = state.styles.map((style) => ({ ...style, collections: style.collections.map((collection) => collection === oldName ? result.collection.name : collection) }));
        state.sections = state.sections.map((section) => String(section.slug).toLowerCase() === oldName.toLowerCase() ? { ...section, title: result.collection.name, slug: result.collection.name } : section);
      }
      renderStyles(); renderCollections(); renderCollectionOptions();
      byId("rename-dialog").close(); notify("Collection renamed and assigned styles were updated.");
    } catch (error) { notify(error.message, true); }
    finally { submit.disabled = false; submit.textContent = "Save name"; }
  });

  byId("logout-button").addEventListener("click", async () => {
    try { await api("/api/auth/logout", { method: "POST" }, false); } catch { /* Clear the browser session even when the network is unavailable. */ }
    clearSession(); showLogin("You are signed out.");
  });

  if (!apiBase) showLogin("Set the backend URL in config.js before signing in.");
  else if (sessionStorage.getItem(tokenKey)) { showApp(""); void loadCatalog(); }
})();
