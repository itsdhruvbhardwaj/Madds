(() => {
  function create({ api, notify }) {
    const $ = id => document.getElementById(id), form = $("watermark-form"), fields = form.elements;
    const base = "/api/admin/settings/watermark";
    let revision = null, saved = null, logoUrl = "", logoPublicId = "", busy = false, epoch = 0;
    function values() { return { enabled: fields.enabled.checked, logoUrl, logoPublicId,
      widthPercent: Number(fields.widthPercent.value), opacityPercent: Number(fields.opacityPercent.value), paddingPercent: Number(fields.paddingPercent.value) }; }
    function render() {
      for (const input of form.querySelectorAll("input,button")) input.disabled = busy || revision === null;
      $("watermark-refresh").disabled = busy;
      for (const id of ["watermark-save", "watermark-upload", "watermark-refresh"]) $(id).ariaBusy = String(busy);
      $("watermark-save").disabled = busy || revision === null || JSON.stringify(values()) === saved || (fields.enabled.checked && !logoUrl);
      $("watermark-preview-logo").hidden = !logoUrl || !fields.enabled.checked;
      if (logoUrl) $("watermark-preview-logo").src = logoUrl;
      $("watermark-preview-logo").style.width = `${fields.widthPercent.value}%`;
      $("watermark-preview-logo").style.opacity = Number(fields.opacityPercent.value) / 100;
      $("watermark-preview-logo").style.right = `${Number(fields.paddingPercent.value) * 2 / 3}%`;
      $("watermark-preview-logo").style.bottom = `${fields.paddingPercent.value}%`;
      $("watermark-logo-name").textContent = logoUrl ? "PNG logo uploaded · stored in Cloudinary" : "Upload a transparent PNG to get started.";
    }
    function accept(data) {
      revision = data.revision; logoUrl = data.logoUrl; logoPublicId = data.logoPublicId;
      fields.enabled.checked = data.enabled;
      for (const key of ["widthPercent", "opacityPercent", "paddingPercent"]) fields[key].value = String(data[key]);
      saved = JSON.stringify(values());
      $("watermark-editor").textContent = data.updatedAt ? `Last changed by ${data.updatedByName || "Team member"} · ${new Date(data.updatedAt).toLocaleString()}` : "Not enabled yet. Upload your logo, then save.";
    }
    async function refresh() {
      if (busy || (revision !== null && JSON.stringify(values()) !== saved && !window.confirm("Discard unsaved watermark changes and refresh?"))) return;
      busy = true; render(); const session = epoch; $("watermark-error").textContent = "";
      try { const data = await api(base); if (session === epoch) accept(data); }
      catch (error) { if (session === epoch) { revision = null; $("watermark-error").textContent = error.message; } }
      finally { if (session === epoch) { busy = false; render(); } }
    }
    async function upload() {
      const file = $("watermark-logo-file").files?.[0]; if (!file || busy) return;
      if (file.type !== "image/png" || file.size > 2 * 1024 * 1024) { $("watermark-error").textContent = "Choose a transparent PNG up to 2 MB."; return; }
      busy = true; render(); const session = epoch; $("watermark-error").textContent = "";
      try {
        const header = new DataView(await file.slice(0,24).arrayBuffer());
        if (header.byteLength < 24 || header.getUint32(0) !== 0x89504e47 || header.getUint32(4) !== 0x0d0a1a0a ||
            header.getUint32(16) < 1 || header.getUint32(20) < 1 || header.getUint32(16) > 4096 || header.getUint32(20) > 4096 ||
            header.getUint32(16) * header.getUint32(20) > 4_000_000) throw Error("Use a PNG up to 4096 pixels per side and 4 million pixels in total.");
        const bitmap = await createImageBitmap(file);
        let blob;
        try {
          const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
          const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
          canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
        } finally { bitmap.close(); }
        if (!blob) throw Error("Couldn't read this PNG. Please choose another file.");
        if (session !== epoch) return;
        const body = new FormData(); body.set("logo", blob, "watermark.png");
        const data = await api(`${base}/logo`, { method: "POST", body });
        if (session !== epoch) return;
        logoUrl = data.logoUrl; logoPublicId = data.logoPublicId;
        notify("Logo uploaded. Save changes to apply it to exports.");
      } catch (error) { if (session === epoch) $("watermark-error").textContent = error.message; }
      finally { if (session === epoch) { busy = false; $("watermark-logo-file").value = ""; render(); } }
    }
    async function save(event) {
      event.preventDefault(); if (busy || revision === null || JSON.stringify(values()) === saved) return;
      if (!form.reportValidity()) return;
      busy = true; render(); const session = epoch; $("watermark-error").textContent = "";
      try {
        const data = await api(base, { method: "PATCH", body: JSON.stringify({ ...values(), expectedRevision: revision }) });
        if (session !== epoch) return;
        accept(data); notify("Watermark saved. Updated apps refresh it when saving or sharing.");
      } catch (error) { if (session === epoch) $("watermark-error").textContent = error.message; }
      finally { if (session === epoch) { busy = false; render(); } }
    }
    function reset() {
      epoch++; revision = null; saved = null; busy = false; logoUrl = ""; logoPublicId = "";
      form.reset(); $("watermark-preview-logo").removeAttribute("src"); $("watermark-logo-file").value = "";
      $("watermark-error").textContent = ""; $("watermark-editor").textContent = ""; render();
    }
    form.addEventListener("input", render); form.addEventListener("submit", save);
    $("watermark-upload").addEventListener("click", () => $("watermark-logo-file").click());
    $("watermark-logo-file").addEventListener("change", upload); $("watermark-refresh").addEventListener("click", refresh);
    render(); return { refresh, reset };
  }
  if (typeof module !== "undefined" && module.exports) module.exports = { create };
  else window.MaddsWatermark = { create };
})();
