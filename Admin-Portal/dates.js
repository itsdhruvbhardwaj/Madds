/* Workspace presentation only. Transport timestamps remain ISO; browser timezone is preserved. */
(() => {
  const pad = value => String(value).padStart(2, "0");
  function parts(value, utc = false) {
    if (value === null || value === undefined || value === "") return null;
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return null;
    const get = name => date[`${utc ? "getUTC" : "get"}${name}`]();
    return { day: pad(get("Date")), month: pad(get("Month") + 1), year: String(get("FullYear")).padStart(4,"0"),
      hour: pad(get("Hours")), minute: pad(get("Minutes")), second: pad(get("Seconds")) };
  }
  function dateTime(value, { utc = false } = {}) {
    const p = parts(value, utc);
    return p ? `${p.day}/${p.month}/${p.year}, ${p.hour}:${p.minute}:${p.second}` : "—";
  }
  function scheduleInput(value) {
    const p = parts(value);
    return p ? `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}` : "";
  }
  function scheduleISO(value) {
    const match = /^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}):(\d{2})$/.exec(value);
    return match ? `${match[3]}-${match[2]}-${match[1]}T${match[4]}:${match[5]}` : value;
  }
  const exported = { dateTime, scheduleInput, scheduleISO };
  if (typeof window !== "undefined") window.MaddsDates = exported;
  if (typeof module !== "undefined" && module.exports) module.exports = exported;
})();
