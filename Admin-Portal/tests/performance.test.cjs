const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
function fixture(responder) {
  const elements = new Map();
  const el = id => {
    if (!elements.has(id)) elements.set(id, { value: id === "performance-days" ? "7" : id === "performance-sort" ? "successful" : "", textContent: "", innerHTML: "", disabled: false,
      setAttribute() {}, querySelectorAll: () => [], classList: { toggle() {}, add() {}, remove() {} } });
    return elements.get(id);
  };
  const requests = [], notices = []; let catalogueRefreshes = 0;
  const item = { id: "portrait", name: "Portrait", available: true, verified: true, trending: false, successful: 12, failed: 2, uniqueUsers: 4, lastUsedAt: "2026-11-08T12:00:00Z" };
  const report = { items: [item], page: 1, totalPages: 2, total: 51, summary: { successful: 12, failed: 2, stylesUsed: 1 }, since: "2026-11-01", until: "2026-11-08" };
  const api = (url, options = {}) => {
    requests.push({ url, options });
    const result = responder ? responder(url, options, report) : report;
    return new Promise((resolve, reject) => {
      options.signal?.addEventListener("abort", () => reject(new Error("Request aborted")), { once: true });
      Promise.resolve(result).then(resolve, reject);
    });
  };
  const timeouts = new Map();
  function startTimer(fn, delay) { const id = setTimeout(fn, delay); if (delay === 20000) timeouts.set(id, fn); return id; }
  function stopTimer(id) { timeouts.delete(id); clearTimeout(id); }
  const context = { window: {}, document: { getElementById: el }, URLSearchParams, AbortController, setTimeout: startTimer, clearTimeout: stopTimer, console };
  vm.runInNewContext(require("node:fs").readFileSync(require("node:path").join(__dirname,"../dates.js"),"utf8"), context);
  vm.runInNewContext(fs.readFileSync("Admin-Portal/performance.js", "utf8"), context);
  const controls = context.window.MaddsPerformance.create({ api, notify: message => notices.push(message), onChanged: async () => { catalogueRefreshes++; } });
  const click = (desired = true) => el("performance-rows").onclick({ target: { closest: () => ({ dataset: { performanceStyle: "portrait", trending: String(desired) }, disabled: false, classList: { add() {}, remove() {} } }) } });
  return { controls, el, requests, notices, click, report, expireRequest() { const fn = [...timeouts.values()][0]; fn(); }, get catalogueRefreshes() { return catalogueRefreshes; } };
}
const flush = () => new Promise(resolve => setImmediate(resolve));
test("loads on demand, sends bounded filters and shows totals with escaped style names", async () => {
  const f = fixture();
  assert.equal(f.requests.length, 0);
  f.report.items[0].name = '<img src=x onerror="bad()">';
  await f.controls.refresh();
  assert.match(f.requests[0].url, /days=7/); assert.match(f.requests[0].url, /sort=successful/); assert.match(f.requests[0].url, /page=1/);
  assert.match(f.el("performance-rows").innerHTML, /&lt;img/); assert.doesNotMatch(f.el("performance-rows").innerHTML, /<img/);
  assert.match(f.el("performance-summary").innerHTML, /Successful generations/);
  assert.equal(f.el("performance-next").disabled, false); assert.equal(f.el("performance-prev").disabled, true);
});
test("period and ranking changes restart pagination", async () => {
  const f = fixture(); await f.controls.refresh();
  f.el("performance-next").onclick(); await flush();
  assert.match(f.requests.at(-1).url, /page=2/);
  f.el("performance-days").value = "30"; f.el("performance-days").onchange(); await flush();
  assert.match(f.requests.at(-1).url, /days=30/); assert.match(f.requests.at(-1).url, /page=1/);
});
test("promotes manually, blocks rapid duplicate clicks, and refreshes the shared catalogue", async () => {
  let release;
  const f = fixture((url, options, report) => options.method ? new Promise(resolve => { release = resolve; }) : report);
  await f.controls.refresh();
  const pending = f.click(); await flush(); await f.click();
  assert.equal(f.requests.filter(r => r.options.method === "PATCH").length, 1);
  assert.deepEqual(JSON.parse(f.requests[1].options.body), { trending: true });
  assert.equal(f.el("performance-days").disabled, true);
  release({ changed: true }); await pending;
  assert.equal(f.catalogueRefreshes, 1); assert.equal(f.notices.length, 1);
  assert.equal(f.el("performance-days").disabled, false);
});
test("shows safe errors and restores controls after failed changes", async () => {
  const f = fixture((url, options, report) => options.method ? Promise.reject(new Error("Refresh before trying again.")) : report);
  await f.controls.refresh(); await f.click();
  assert.equal(f.el("performance-error").textContent, "Refresh before trying again.");
  assert.equal(f.el("performance-days").disabled, false); assert.equal(f.notices.length, 0);
});
test("logout cancels old requests and cannot restore the old report", async () => {
  let release;
  const f = fixture(() => new Promise(resolve => { release = resolve; }));
  const loading = f.controls.refresh(); await flush(); f.controls.reset(); release(f.report); await loading;
  assert.equal(f.el("performance-rows").textContent, ""); assert.equal(f.el("performance-summary").textContent, "");
  assert.equal(f.el("performance-page").textContent, ""); assert.equal(f.notices.length, 0);
});
test("empty matches have a clear message", async () => {
  const f = fixture(); f.report.items = []; f.report.total = 0; f.report.totalPages = 1;
  await f.controls.refresh(); assert.match(f.el("performance-rows").innerHTML, /No styles match/);
  assert.equal(f.el("performance-next").disabled, true);
});

test("removes Trending through an explicit desired state", async () => {
  const f = fixture((url, options, report) => {
    if (options.method) { report.items[0].trending = false; return { changed: true }; }
    return report;
  });
  f.report.items[0].trending = true;
  await f.controls.refresh(); assert.match(f.el("performance-rows").innerHTML, /Remove from Trending/);
  await f.click(false);
  assert.deepEqual(JSON.parse(f.requests.find(r => r.options.method).options.body), { trending: false });
  assert.match(f.el("performance-rows").innerHTML, /Add to Trending/);
  assert.match(f.notices[0], /removed/);
});
test("a hung request times out, restores controls and can be retried", async () => {
  let calls = 0;
  const f = fixture((url, options, report) => ++calls === 1 ? new Promise(() => {}) : report);
  const loading = f.controls.refresh(); await flush(); f.expireRequest(); await loading;
  assert.match(f.el("performance-error").textContent, /took too long/);
  assert.equal(f.el("performance-refresh").disabled, false);
  await f.controls.refresh(); assert.match(f.el("performance-rows").innerHTML, /Portrait/);
});
