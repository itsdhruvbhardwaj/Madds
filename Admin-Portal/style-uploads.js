(() => {
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
  window.MaddsStyleUploads = { create };
})();
