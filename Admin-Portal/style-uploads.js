(() => {
  function clearImageFields(form, previewsOnly = false) {
    const fields = ["exampleBeforeUrl", "exampleBeforePublicId", "exampleAfterUrl", "exampleAfterPublicId", "previewImages", "previewImagePublicIds"];
    if (!previewsOnly) fields.push("thumbnail", "thumbnailPublicId");
    fields.forEach(name => { form.elements[name].value = ""; });
  }
  function synchronizeFields(fields, linked) {
    if (linked) {
      fields.exampleAfterUrl.value = fields.exampleBeforeUrl.value ? fields.thumbnail.value : "";
      fields.exampleAfterPublicId.value = fields.exampleBeforeUrl.value ? fields.thumbnailPublicId.value : "";
    }
    const urls = [fields.exampleBeforeUrl.value, fields.exampleAfterUrl.value];
    const ids = [fields.exampleBeforePublicId.value, fields.exampleAfterPublicId.value];
    fields.previewImages.value = urls.every(Boolean) ? urls.join("\n") : "";
    fields.previewImagePublicIds.value = ids.every(Boolean) ? ids.join("\n") : "";
  }
  function create({ discard }) {
    const uploads = new Set();
    const pending = new Map();
    return {
      track(id) { uploads.add(id); },
      async releaseUnused(kept = []) {
        const keep = new Set(kept);
        const ids = [...uploads].filter(id => !keep.has(id));
        await Promise.all(ids.map(id => {
          if (pending.has(id)) return pending.get(id);
          const work = Promise.resolve().then(() => discard(id)).then(() => uploads.delete(id)).finally(() => pending.delete(id));
          pending.set(id, work);
          return work;
        }));
      },
      saved(ids) { ids.forEach(id => uploads.delete(id)); },
    };
  }
  window.MaddsStyleUploads = { create, clearImageFields, synchronizeFields };
})();
