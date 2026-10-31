/* Notification controls share Studio's authenticated API client. No Firebase keys belong here. */
(() => {
  const labels = {
    ALL_USERS: "All eligible users", ACTIVE_USERS: "Active in the last 7 days",
    INACTIVE_7_DAYS: "Inactive for 7 days", INACTIVE_14_DAYS: "Inactive for 14 days",
    INACTIVE_30_DAYS: "Inactive for 30 days", SPECIFIC_USERS: "Selected users",
    USERS_WITHOUT_RECENT_GENERATIONS: "Without recent creations",
  };
  const types = { PRODUCT_UPDATE: "Product updates", NEW_STYLE: "New styles & trends", OFFER: "Offers & rewards", REENGAGEMENT: "Re-engagement" };
  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const formatDate = (value) => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toLocaleString() : "—";
  const statusLabel = (value) => ({ DRAFT: "Draft", SCHEDULED: "Scheduled", PROCESSING: "Sending", SENT: "Finished", FAILED: "Failed", CANCELLED: "Cancelled" })[value] || value || "Draft";
  function localSchedule(value, now = Date.now()) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error("Choose a date and time.");
    const date = new Date(value);
    const pad = (number) => String(number).padStart(2, "0");
    const roundtrip = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
    if (!Number.isFinite(date.getTime()) || roundtrip !== value || date.getTime() <= now || date.getTime() > now + 365 * 86400000) throw new Error("Choose a valid future time within one year.");
    return date.toISOString();
  }
  function buildDraft(values) {
    const title = values.title.trim(), body = values.body.trim();
    if (!title || title.length > 120 || !body || body.length > 500) throw new Error("Enter a title and message within the character limits.");
    if (!Object.hasOwn(types, values.notificationType) || !Object.hasOwn(labels, values.targetAudience)) throw new Error("Choose a category and audience.");
    const userIds = [...new Set(values.userIds.split(/[\s,]+/).filter(Boolean))];
    if (values.targetAudience === "SPECIFIC_USERS" && (!userIds.length || userIds.length > 1000 || userIds.some((id) => !/^[0-9a-f]{24}$/i.test(id)))) throw new Error("Enter 1 to 1,000 valid user IDs, separated by commas or new lines.");
    const recentDays = Number(values.recentDays || 7);
    if (!Number.isInteger(recentDays) || recentDays < 1 || recentDays > 365) throw new Error("Choose a creation window between 1 and 365 days.");
    if (values.imageUrl.trim()) {
      let url; try { url = new URL(values.imageUrl.trim()); } catch { throw new Error("Use a valid HTTPS image URL."); }
      if (url.protocol !== "https:" || url.username || url.password || url.href.length > 1000) throw new Error("Use a valid HTTPS image URL without credentials.");
    }
    if (values.notificationType === "NEW_STYLE" && values.destination !== "style") throw new Error("A new-style notification must open a published style.");
    if (values.destination === "style" && !values.styleId) throw new Error("Choose a published style.");
    if (values.destination === "collection" && !values.collectionId) throw new Error("Choose a collection.");
    return { title, body, notificationType: values.notificationType, targetAudience: values.targetAudience,
      targetConditions: { recentDays, userIds: values.targetAudience === "SPECIFIC_USERS" ? userIds : [] },
      ...(values.destination === "style" ? { relatedStyleId: values.styleId } : {}),
      ...(values.destination === "collection" ? { collectionId: values.collectionId } : {}),
      ...(values.imageUrl.trim() ? { imageUrl: values.imageUrl.trim() } : {}) };
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("This image could not be compressed.")), type, quality));
  }
  async function loadImage(file) {
    const sourceUrl = URL.createObjectURL(file);
    try {
      const image = new Image(); image.src = sourceUrl; await image.decode();
      return image;
    } finally { URL.revokeObjectURL(sourceUrl); }
  }
  async function compressNotificationImage(file) {
    if (!file || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Choose a JPG, PNG, or WebP image.");
    const image = await loadImage(file);
    const sourceWidth = image.naturalWidth, sourceHeight = image.naturalHeight;
    if (!sourceWidth || !sourceHeight) throw new Error("This image has invalid dimensions.");
    let scale = Math.min(1, 1200 / sourceWidth, 630 / sourceHeight);
    const canvas = document.createElement("canvas"), context = canvas.getContext("2d", { alpha: true });
    if (!context) throw new Error("This browser cannot compress the image.");
    for (let pass = 0; pass < 10; pass += 1) {
      canvas.width = Math.max(1, Math.round(sourceWidth * scale));
      canvas.height = Math.max(1, Math.round(sourceHeight * scale));
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      for (let quality = 0.88; quality >= 0.42; quality -= 0.08) {
        let blob = await canvasToBlob(canvas, "image/webp", quality);
        if (blob.type !== "image/webp") blob = await canvasToBlob(canvas, "image/jpeg", quality);
        if (blob.size <= 300_000) return { file: blob, width: canvas.width, height: canvas.height };
      }
      scale *= 0.82;
    }
    throw new Error("Couldn't compress this image below 300 KB. Try a smaller image.");
  }

  function create({ api, notify, getCatalog }) {
    const $ = (id) => document.getElementById(id);
    const base = "/api/admin/notifications";
    let campaigns = [], nextCursor = null, selected = null, enabled = false, available = false;
    let busy = false, loading = false, epoch = 0, selection = 0, baseline = "", dirty = false;
    let stats = null, logs = [], logCursor = null, review = null;
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const options = (map, current) => Object.entries(map).map(([value, label]) => `<option value="${escape(value)}" ${current === value ? "selected" : ""}>${escape(label)}</option>`).join("");
    const error = (message = "") => { $("push-error").textContent = message; };
    const isDraft = () => !selected || selected.status === "DRAFT";
    const canLeave = () => !busy && (!dirty || window.confirm("Discard unsaved notification changes?"));
    const scheduleMinimum = () => {
      const date = new Date(Date.now() + 60_000);
      const pad = (number) => String(number).padStart(2, "0");
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
    };
    function banner() {
      $("push-delivery-status").textContent = !available ? "Notification controls are unavailable. Deploy the notification backend, then refresh." : enabled ?
        "Delivery enabled · Notifications go only to eligible users who opted in." : "Delivery paused · You can save and preview drafts. Enable notification delivery on the backend to send notifications.";
      $("push-delivery-status").classList.toggle("is-enabled", available && enabled);
    }
    function renderHistory() {
      const drafts = campaigns.filter((item) => item.status === "DRAFT");
      const recent = campaigns.filter((item) => item.status !== "DRAFT");
      $("push-campaigns").innerHTML = drafts.map((item) => `<div class="push-draft-card"><button type="button" class="push-campaign ${selected?._id === item._id ? "is-selected" : ""}" data-campaign="${escape(item._id)}" aria-pressed="${selected?._id === item._id}"><span class="push-status">${escape(statusLabel(item.status))}</span><strong>${escape(item.title)}</strong><small>${escape(labels[item.targetAudience] || item.targetAudience)}</small><small>Last edited ${escape(formatDate(item.updatedAt || item.createdAt))}</small></button><button type="button" class="delete-button push-card-clear" data-clear-draft="${escape(item._id)}" aria-label="Clear draft: ${escape(item.title)}" ${busy ? "disabled" : ""}>Clear</button></div>`).join("") || '<p class="muted push-empty">No saved drafts. Start a notification when you are ready.</p>';
      $("push-recent").innerHTML = recent.length ? `<h3>Recent activity</h3>${recent.map((item) => `<button type="button" class="push-campaign ${selected?._id === item._id ? "is-selected" : ""}" data-campaign="${escape(item._id)}" aria-pressed="${selected?._id === item._id}"><span class="push-status">${escape(statusLabel(item.status))}</span><strong>${escape(item.title)}</strong><small>${escape(formatDate(item.scheduledAt || item.createdAt))}</small></button>`).join("")}` : "";
      $("push-more").hidden = !nextCursor;
      $("push-more").disabled = loading || busy;
    }
    function values() { return Object.fromEntries(new FormData($("push-form"))); }
    function updateDirty() {
      dirty = JSON.stringify(values()) !== baseline;
      $("push-save-state").textContent = dirty ? "Unsaved changes" : selected ? (selected.status === "DRAFT" ? "Saved draft" : statusLabel(selected.status)) : "New draft";
      updateActions(); livePreview();
    }
    function updateActions() {
      const draft = isDraft();
      if ($("push-form")) { $("push-form").querySelector("fieldset").disabled = busy || !draft; conditionalFields(); }
      for (const id of ["push-save", "push-preview", "push-send", "push-schedule", "push-cancel"]) {
        const button = $(id); if (!button) continue;
        button.disabled = busy || !available || (id !== "push-save" && (!selected || dirty)) ||
          (["push-send", "push-schedule"].includes(id) && (!draft || !enabled)) ||
          (id === "push-save" && !draft);
      }
      $("push-new").disabled = busy;
      if ($("push-clear")) $("push-clear").disabled = busy || !draft || (selected && !available);
    }
    function livePreview() {
      if (!$("push-form")) return;
      const form = $("push-form");
      $("push-preview-title").textContent = form.elements.title.value || "Your notification title";
      $("push-preview-body").textContent = form.elements.body.value || "Your message will appear here.";
      $("push-title-count").textContent = `${form.elements.title.value.length}/120`;
      $("push-body-count").textContent = `${form.elements.body.value.length}/500`;
    }
    function conditionalFields() {
      const form = $("push-form"); if (!form) return;
      if (form.elements.notificationType.value === "NEW_STYLE") form.elements.destination.value = "style";
      form.elements.destination.disabled = !isDraft() || form.elements.notificationType.value === "NEW_STYLE";
      $("push-users-field").hidden = form.elements.targetAudience.value !== "SPECIFIC_USERS";
      $("push-days-field").hidden = form.elements.targetAudience.value !== "USERS_WITHOUT_RECENT_GENERATIONS";
      $("push-style-field").hidden = form.elements.destination.value !== "style";
      $("push-collection-field").hidden = form.elements.destination.value !== "collection";
      // Disabled controls aren't included in FormData; values() handles destination below.
    }
    function catalogChanged() {
      const form = $("push-form"); if (!form) return;
      for (const [name, items, placeholder] of [
        ["styleId", getCatalog().styles.filter((item) => item.verified === true), "Choose a published style"],
        ["collectionId", getCatalog().collections, "Choose a collection"],
      ]) {
        const input = form.elements[name], current = input.value || (name === "styleId" ? selected?.relatedStyleId : selected?.collectionId) || "";
        input.innerHTML = `<option value="">${placeholder}</option>` + items.map((item) => `<option value="${escape(item.id)}">${escape(item.name)}</option>`).join("");
        if (current && !items.some((item) => item.id === current)) input.insertAdjacentHTML("beforeend", `<option value="${escape(current)}">${escape(current)} (unavailable)</option>`);
        input.value = current;
      }
    }
    function renderEditor() {
      const item = selected || {}, draft = isDraft();
      $("push-editor").innerHTML = `<div class="push-section-heading"><div><span class="push-status">${escape(statusLabel(item.status))}</span><h2>${item._id ? "Notification details" : "New notification"}</h2></div><span id="push-save-state" class="muted"></span></div>
        <form id="push-form" class="push-form"><fieldset ${draft ? "" : "disabled"} class="push-fields">
          <div class="push-two-fields"><label>Category<select name="notificationType">${options(types, item.notificationType || "PRODUCT_UPDATE")}</select></label><label>Audience<select name="targetAudience">${options(labels, item.targetAudience || "ALL_USERS")}</select></label></div>
          <label id="push-users-field" hidden>User IDs<textarea name="userIds" rows="3" placeholder="Separate IDs with commas or new lines">${escape((item.targetConditions?.userIds || []).join("\n"))}</textarea><small class="field-hint">Use account IDs, not email addresses. Maximum 1,000.</small></label>
          <label id="push-days-field" hidden>Days without a completed creation<input name="recentDays" type="number" min="1" max="365" value="${escape(item.targetConditions?.recentDays || 7)}"></label>
          <label>Title <span id="push-title-count" class="field-hint"></span><input name="title" maxlength="120" value="${escape(item.title)}" required></label>
          <label>Message <span id="push-body-count" class="field-hint"></span><textarea name="body" maxlength="500" rows="3" required>${escape(item.body)}</textarea></label>
          <div class="push-two-fields"><label>Open when tapped<select name="destination">${options({ home: "Home", style: "A published style", collection: "A collection" }, item.relatedStyleId ? "style" : item.collectionId ? "collection" : "home")}</select></label><label id="push-style-field" hidden>Style<select name="styleId"></select></label><label id="push-collection-field" hidden>Collection<select name="collectionId"></select></label></div>
          <label>Notification image <span class="field-hint">Optional · JPG, PNG, or WebP · compressed to 300 KB</span><input name="imageUrl" type="hidden" value="${escape(item.imageUrl)}"><div class="image-upload-row"><input id="push-image-file" type="file" accept="image/jpeg,image/png,image/webp"><button id="push-image-upload" type="button" class="button secondary">Upload image</button><span id="push-image-status" class="field-hint">${item.imageUrl ? "Image uploaded" : "No image selected"}</span></div></label>
        </fieldset>
        <div class="push-phone-preview" aria-label="Notification preview"><span class="push-app-name">madds · now</span><strong id="push-preview-title"></strong><p id="push-preview-body"></p><img id="push-preview-image" alt="Notification image preview" referrerpolicy="no-referrer" hidden><small>Preview · Appearance varies by device</small></div>
        <p class="field-hint">Only users who allow this category and device notifications are eligible. Inactivity audiences exclude unknown activity.</p>
        <div class="push-actions">${draft ? '<button id="push-save" class="button primary" type="submit">Save draft</button><button id="push-clear" class="delete-button" type="button">Clear draft</button>' : ""}<button id="push-preview" class="button secondary" type="button">Check audience</button></div>
        <div id="push-audience-result" class="push-audience-result" role="status"></div>
        ${draft ? `<div class="push-sending"><h3>Delivery</h3><p class="field-hint">Save changes before reviewing a send. Scheduling is available only for a future time.</p><button id="push-send" type="button" class="button secondary">Review send now</button><label>Schedule in ${escape(zone)}<input id="push-schedule-time" type="datetime-local" step="60" min="${scheduleMinimum()}"></label><button id="push-schedule" type="button" class="button secondary">Review schedule</button></div>` : `<p class="muted">${escape(item.status === "SCHEDULED" ? `Scheduled: ${formatDate(item.scheduledAt)}` : `Status: ${statusLabel(item.status)}`)}</p>`}
        ${item._id && ["DRAFT", "SCHEDULED", "PROCESSING"].includes(item.status) ? '<button id="push-cancel" type="button" class="delete-button">Cancel notification</button>' : ""}
        </form><div id="push-stats"></div><div id="push-logs"></div>`;
      catalogChanged(); conditionalFields(); livePreview();
      baseline = JSON.stringify(values()); dirty = false; updateDirty(); renderDetails();
      $("push-form").addEventListener("input", updateDirty);
      $("push-form").addEventListener("change", () => { conditionalFields(); updateDirty(); });
      function imagePreview() {
        const image = $("push-preview-image"); let url;
        try { url = new URL($("push-form").elements.imageUrl.value); } catch { image.hidden = true; image.removeAttribute("src"); return; }
        if (url.protocol !== "https:" || url.username || url.password) { image.hidden = true; image.removeAttribute("src"); return; }
        image.hidden = false; image.src = url.href; image.onerror = () => { image.hidden = true; };
      }
      async function uploadImage() {
        const file = $("push-image-file").files?.[0], button = $("push-image-upload"), status = $("push-image-status");
        if (!file) { status.textContent = "Choose an image first."; return; }
        button.disabled = true; status.textContent = "Compressing image…";
        try {
          const compressed = await compressNotificationImage(file);
          status.textContent = `Compressed to ${(compressed.file.size / 1000).toFixed(0)} KB · Uploading…`;
          const signed = await api(`${base}/upload-signature`, { method: "POST" });
          const upload = new FormData();
          upload.append("file", compressed.file, compressed.file.type === "image/webp" ? "notification.webp" : "notification.jpg");
          upload.append("api_key", signed.apiKey); upload.append("timestamp", String(signed.timestamp));
          upload.append("folder", signed.folder); upload.append("public_id", signed.publicId); upload.append("tags", signed.tags); upload.append("signature", signed.signature);
          const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(signed.cloudName)}/image/upload`, { method: "POST", body: upload });
          const uploaded = await response.json().catch(() => ({}));
          if (!response.ok || uploaded.public_id !== signed.expectedPublicId || typeof uploaded.secure_url !== "string") throw new Error(uploaded.error?.message || "Cloudinary couldn't upload the image.");
          $("push-form").elements.imageUrl.value = uploaded.secure_url;
          status.textContent = `Uploaded · ${(compressed.file.size / 1000).toFixed(0)} KB · ${compressed.width} × ${compressed.height}`;
          imagePreview(); updateDirty();
        } catch (failure) { status.textContent = failure.message || "Image upload failed."; }
        finally { button.disabled = false; $("push-image-file").value = ""; }
      }
      $("push-image-upload").addEventListener("click", uploadImage); imagePreview();
      $("push-form").addEventListener("submit", save);
      $("push-preview").addEventListener("click", checkAudience);
      $("push-send")?.addEventListener("click", () => prepareReview("send"));
      $("push-schedule")?.addEventListener("click", () => prepareReview("schedule"));
      $("push-cancel")?.addEventListener("click", cancelCampaign);
      $("push-clear")?.addEventListener("click", clearDraft);
    }
    function renderDetails() {
      if (!$("push-stats")) return;
      $("push-stats").innerHTML = selected ? stats ? `<h3>Delivery results</h3><div class="push-metrics">${[["Recipients (devices)", stats.totalRecipients], ["Accepted by FCM", stats.successfulDeliveries], ["Failed", stats.failedDeliveries], ["Skipped", stats.skippedDeliveries], ["Pending / in flight", stats.pendingDeliveries]].map(([label, count]) => `<div><strong>${Number(count) || 0}</strong><span>${label}</span></div>`).join("")}</div><p class="field-hint">Acceptance by FCM does not confirm that a notification was displayed or read.</p>` : '<p class="muted">Delivery statistics are not available yet.</p>' : "";
      $("push-logs").innerHTML = selected ? `<h3>Delivery history</h3>${logs.length ? `<div class="push-log-scroll"><table class="push-log-table"><thead><tr><th>Result</th><th>Attempts</th><th>Time</th><th>Details</th></tr></thead><tbody>${logs.map((log) => `<tr><td>${escape(log.status === "ACCEPTED" ? "Accepted by FCM" : log.status)}</td><td>${Number(log.attempts) || 0}</td><td>${escape(formatDate(log.sentAt || log.createdAt))}</td><td>${escape(log.error || "—")}</td></tr>`).join("")}</tbody></table></div>` : '<p class="muted">No delivery attempts yet.</p>'}${logCursor ? '<button id="push-more-logs" class="button secondary" type="button">Load more history</button>' : ""}` : "";
      $("push-more-logs")?.addEventListener("click", () => loadDetails(true));
    }
    async function loadDetails(more = false) {
      if (!selected) return;
      const id = selected._id, ticket = selection, session = epoch;
      const button = $("push-more-logs"); if (button) button.disabled = true;
      try {
        const [result, history] = await Promise.all([api(`${base}/${id}/stats`), api(`${base}/${id}/logs${more && logCursor ? `?cursor=${encodeURIComponent(logCursor)}` : ""}`)]);
        if (ticket !== selection || session !== epoch) return;
        stats = result.stats; logs = more ? [...logs, ...(history.logs || [])] : history.logs || []; logCursor = history.nextCursor; renderDetails();
      } catch (failure) { if (ticket === selection && session === epoch) error(`Could not load delivery results: ${failure.message}`); }
      finally { if (button?.isConnected) button.disabled = false; }
    }
    async function open(id) {
      if (!canLeave()) return;
      const ticket = ++selection, session = epoch;
      error();
      try {
        const result = await api(`${base}/${encodeURIComponent(id)}`);
        if (ticket !== selection || session !== epoch) return;
        selected = result.campaign; stats = null; logs = []; logCursor = null;
        renderHistory(); renderEditor(); void loadDetails();
      } catch (failure) { if (ticket === selection && session === epoch) error(failure.message); }
    }
    async function loadCampaigns(more = false) {
      if (loading || busy) return;
      loading = true; const session = epoch;
      $("push-refresh").disabled = true; $("push-more").disabled = true; error();
      if (!campaigns.length) { $("push-campaigns").textContent = "Loading drafts…"; $("push-recent").textContent = ""; }
      try {
        const data = await api(`${base}${more && nextCursor ? `?cursor=${encodeURIComponent(nextCursor)}` : ""}`);
        if (session !== epoch) return;
        available = true; enabled = data.deliveryEnabled === true;
        campaigns = more ? [...new Map([...campaigns, ...(data.campaigns || [])].map((item) => [item._id, item])).values()] : data.campaigns || [];
        nextCursor = data.nextCursor; renderHistory();
      } catch (failure) { if (session === epoch) { available = false; enabled = false; error(`Could not load notifications: ${failure.message}`); renderHistory(); } }
      finally { if (session === epoch) { loading = false; $("push-refresh").disabled = false; banner(); updateActions(); } }
    }
    async function refresh() {
      if (loading || busy) return;
      await loadCampaigns();
      if (selected && !dirty && !busy) await open(selected._id);
    }
    async function save(event) {
      event.preventDefault(); if (busy || !available || !isDraft()) return;
      let draft;
      try {
        const form = $("push-form"), data = values(); data.destination = form.elements.destination.value;
        draft = buildDraft(data);
      } catch (failure) { error(failure.message); return; }
      busy = true; updateActions(); error(); const session = epoch;
      try {
        const result = await api(selected ? `${base}/${selected._id}` : base, { method: selected ? "PATCH" : "POST",
          body: JSON.stringify({ ...draft, ...(selected ? { expectedRevision: selected.revision ?? 0 } : {}) }) });
        if (session !== epoch) return;
        selected = result.campaign; selection++; stats = null; logs = []; logCursor = null;
        campaigns = [selected, ...campaigns.filter((item) => item._id !== selected._id)]; renderHistory(); renderEditor(); notify("Notification draft saved.");
      } catch (failure) { if (session === epoch) error(failure.message); }
      finally { if (session === epoch) { busy = false; updateActions(); } }
    }
    async function checkAudience() {
      if (busy || !selected || dirty) return;
      busy = true; updateActions(); error(); const ticket = selection, session = epoch;
      try {
        const result = await api(`${base}/${selected._id}/preview`, { method: "POST" });
        if (ticket !== selection || session !== epoch) return;
        const sample = result.audience;
        $("push-audience-result").textContent = `${sample.eligibleDevicesInSample} eligible devices among ${sample.scannedDevices} checked${sample.hasMoreDevices ? "; more devices are available" : ""}. This is a sample before cooldown. Eligibility is checked again when sending.`;
      } catch (failure) { if (session === epoch) error(failure.message); }
      finally { if (session === epoch) { busy = false; updateActions(); } }
    }
    async function prepareReview(action) {
      if (busy || !enabled || !selected || dirty || !isDraft()) return;
      let scheduledAt;
      try { if (action === "schedule") scheduledAt = localSchedule($("push-schedule-time").value); }
      catch (failure) { error(failure.message); return; }
      busy = true; updateActions(); error(); const session = epoch, id = selected._id;
      try {
        const latest = (await api(`${base}/${id}`)).campaign;
        if (session !== epoch) return;
        if (latest.status !== "DRAFT" || (latest.revision ?? 0) !== (selected.revision ?? 0)) throw new Error("This notification changed. Refresh and review the latest version.");
        review = { id, action, scheduledAt, expectedRevision: latest.revision ?? 0 };
        showReview(latest);
      } catch (failure) { if (session === epoch) error(failure.message); }
      finally { if (session === epoch) { busy = false; updateActions(); } }
    }
    function showReview(campaign) {
      $("push-review-dialog")?.remove();
      const dialog = document.createElement("dialog"); dialog.id = "push-review-dialog"; dialog.className = "editor-dialog compact-dialog push-review-dialog";
      dialog.innerHTML = `<div class="push-review-content"><h2>${review.action === "schedule" ? "Review schedule" : "Review send"}</h2><span class="push-app-name">${escape(types[campaign.notificationType])}</span><h3>${escape(campaign.title)}</h3><p class="push-review-body">${escape(campaign.body)}</p><p>Audience: <b>${escape(labels[campaign.targetAudience])}</b></p>${campaign.targetAudience === "SPECIFIC_USERS" ? `<p>${campaign.targetConditions.userIds.length} selected account IDs</p>` : ""}<p>Opens: ${escape(campaign.deepLink)}</p>${review.scheduledAt ? `<p>${escape(formatDate(review.scheduledAt))} · ${escape(zone)}<small class="field-hint">UTC: ${escape(review.scheduledAt)}</small></p>` : "<p>Delivery starts when the worker processes this notification.</p>"}<p class="muted">Only eligible users who opted in will be included. The audience is checked again at delivery.</p><p id="push-review-error" class="form-error" role="alert"></p><div class="push-actions"><button id="push-review-back" type="button" class="button secondary">Back</button><button id="push-review-confirm" type="button" class="button primary">${review.action === "schedule" ? "Confirm schedule" : "Send notification"}</button></div></div>`;
      document.body.append(dialog); dialog.showModal();
      $("push-review-back").addEventListener("click", () => { dialog.close(); review = null; });
      dialog.addEventListener("cancel", (event) => { if (busy) event.preventDefault(); else review = null; });
      $("push-review-confirm").addEventListener("click", confirmReview);
    }
    async function confirmReview() {
      if (busy || !review) return;
      const current = { ...review }, session = epoch;
      busy = true; $("push-review-confirm").disabled = true; $("push-review-back").disabled = true; updateActions();
      try {
        const result = await api(`${base}/${current.id}/${current.action}`, { method: "POST", body: JSON.stringify({ expectedRevision: current.expectedRevision, ...(current.scheduledAt ? { scheduledAt: current.scheduledAt } : {}) }) });
        if (session !== epoch) return;
        selected = result.campaign; campaigns = campaigns.map((item) => item._id === selected._id ? selected : item);
        $("push-review-dialog").close(); review = null; selection++; renderHistory(); renderEditor(); void loadDetails(); notify(current.action === "schedule" ? "Notification scheduled." : "Notification queued for delivery.");
      } catch (failure) { if (session === epoch) $("push-review-error").textContent = `${failure.message} Refresh the notification before retrying if the outcome is uncertain.`; }
      finally { if (session === epoch) { busy = false; updateActions(); if ($("push-review-confirm")) { $("push-review-confirm").disabled = false; $("push-review-back").disabled = false; } } }
    }
    async function clearDraftCard(id) {
      const item = campaigns.find(item => item._id === id);
      if (busy || !item || item.status !== "DRAFT" || !window.confirm(`Clear draft “${item.title}”? Its saved content${selected?._id === id ? " and unsaved edits" : ""} will be discarded.`)) return;
      busy = true; updateActions(); renderHistory(); error(); const session = epoch;
      try {
        await api(`${base}/${id}`, { method: "DELETE", body: JSON.stringify({ expectedRevision: item.revision ?? 0 }) });
        if (session !== epoch) return;
        campaigns = campaigns.filter(item => item._id !== id);
        if (selected?._id === id) { selected = null; selection++; stats = null; logs = []; logCursor = null; renderEditor(); }
        renderHistory(); notify("Draft cleared.");
      } catch (failure) { if (session === epoch) error(failure.message); }
      finally { if (session === epoch) { busy = false; updateActions(); renderHistory(); } }
    }
    async function clearDraft() {
      if (busy || !isDraft() || !window.confirm("Clear this draft? Its saved content and unsaved edits will be discarded.")) return;
      busy = true; updateActions(); error(); const session = epoch;
      try {
        if (selected) {
          const id = selected._id;
          await api(`${base}/${id}`, { method: "DELETE", body: JSON.stringify({ expectedRevision: selected.revision ?? 0 }) });
          if (session !== epoch) return;
          campaigns = campaigns.filter(item => item._id !== id);
        }
        selected = null; selection++; stats = null; logs = []; logCursor = null;
        renderHistory(); renderEditor(); notify("Draft cleared.");
      } catch (failure) { if (session === epoch) error(failure.message); }
      finally { if (session === epoch) { busy = false; updateActions(); } }
    }
    async function cancelCampaign() {
      if (busy || !selected || dirty || !window.confirm("Cancel this notification? Unsent work will stop. A batch already submitted cannot be recalled.")) return;
      busy = true; updateActions(); error(); const session = epoch;
      try {
        const result = await api(`${base}/${selected._id}/cancel`, { method: "POST" });
        if (session !== epoch) return;
        selected = result.campaign; campaigns = campaigns.map((item) => item._id === selected._id ? selected : item);
        selection++; renderHistory(); renderEditor(); void loadDetails(); notify("Notification cancelled. Already submitted batches cannot be recalled.");
      } catch (failure) { if (session === epoch) error(failure.message); }
      finally { if (session === epoch) { busy = false; updateActions(); } }
    }
    function reset() {
      epoch++; selection++; campaigns = []; selected = null; nextCursor = null; stats = null; logs = []; logCursor = null;
      busy = false; loading = false; available = false; enabled = false; dirty = false; review = null;
      $("push-review-dialog")?.remove(); error(); renderHistory(); banner(); $("push-editor").innerHTML = '<p class="muted">Select a draft or create a new notification.</p>'; $("push-refresh").disabled = false; $("push-new").disabled = false;
    }
    $("push-new").addEventListener("click", () => { if (!canLeave()) return; selection++; selected = null; stats = null; logs = []; logCursor = null; error(); renderHistory(); renderEditor(); });
    $("push-refresh").addEventListener("click", refresh);
    $("push-more").addEventListener("click", () => loadCampaigns(true));
    $("push-campaigns").addEventListener("click", (event) => { const clear = event.target.closest("[data-clear-draft]"); if (clear) { void clearDraftCard(clear.dataset.clearDraft); return; } const button = event.target.closest("[data-campaign]"); if (button) void open(button.dataset.campaign); });
    $("push-recent").addEventListener("click", (event) => { const button = event.target.closest("[data-campaign]"); if (button) void open(button.dataset.campaign); });
    window.addEventListener("beforeunload", (event) => { if (dirty) { event.preventDefault(); event.returnValue = ""; } });
    return { refresh, reset, catalogChanged };
  }
  const exported = { create, buildDraft, localSchedule };
  if (typeof module !== "undefined" && module.exports) module.exports = exported;
  else window.MaddsNotifications = exported;
})();
