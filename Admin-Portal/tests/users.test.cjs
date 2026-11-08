const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const context = { window: {} };
vm.runInNewContext(require("node:fs").readFileSync(require("node:path").join(__dirname,"../dates.js"),"utf8"), context);
vm.runInNewContext(fs.readFileSync(require("node:path").join(__dirname, "../users.js"), "utf8"), context);
const { generationDetails, generationRecovery } = context.window.MaddsUsers;
test("endpoint and upstream explanations are separate from status codes", () => {
  const text = generationDetails({ status: "failed", providerHttpStatus: 400,
    providerErrorMessage: "Validation failed", providerUpstreamMessage: "Unsupported quality",
    providerErrorParameter: "quality", providerReportedName: "OpenAI", providerRequestSummary: '{"quality":"medium"}' });
  assert.match(text, /Endpoint explanation: Validation failed/);
  assert.match(text, /Upstream explanation: Unsupported quality/);
  assert.match(text, /Rejected parameter: quality/);
  assert.match(text, /Request settings:/);
  assert.doesNotMatch(text, /Detailed explanation was not recorded/);
});
test("old errors explicitly indicate missing detailed explanation", () => {
  assert.match(generationDetails({ status: "failed", providerHttpStatus: 400 }), /Detailed explanation was not recorded/);
});

test("failed generation shows investigation references and accurate refund state", () => {
  const text = generationDetails({ _id: "request-1", status: "failed", failureReason: "Provider rate limit",
    providerHttpStatus: 429, providerRequestId: "upstream-2", providerDurationMs: 2100 });
  assert.match(text, /Provider rate limit/);
  assert.match(text, /HTTP: 429/);
  assert.match(text, /upstream-2/);
  assert.match(text, /2.1s/);
  assert.match(text, /check credit history/);
});
test("acknowledging an error never claims a photo was opened", () => {
  const text = generationRecovery({ status: "failed", appReceivedAt: "2026-11-03T10:00:00Z" });
  assert.match(text, /Error acknowledged/);
  assert.doesNotMatch(text, /Opened|Result retrieved/);
});
test("unknown outcome never claims a refund or successful image", () => {
  assert.match(generationDetails({ status: "outcome_unknown" }), /Credits held/);
  assert.doesNotMatch(generationDetails({ status: "outcome_unknown" }), /Credits refunded/);
});

function userListFixture() {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, { innerHTML: "", textContent: "", hidden: false,
      append() {}, remove() {}, querySelectorAll() { return []; } });
    return elements.get(id);
  };
  element("users-search").elements = { q: { value: "" }, status: { value: "" }, sort: { value: "joined_desc" } };
  const sandbox = { window: {}, document: { getElementById: element } };
  vm.runInNewContext(require("node:fs").readFileSync(require("node:path").join(__dirname,"../dates.js"),"utf8"), sandbox);
  vm.runInNewContext(fs.readFileSync(require("node:path").join(__dirname, "../users.js"), "utf8"), sandbox);
  const requests = [];
  const users = sandbox.window.MaddsUsers.create({ api: async url => {
    requests.push(url); return { users: [], page: Number(new URL(url, "https://example.com").searchParams.get("page")), pages: 3, total: 60 };
  }, notify() {} });
  return { users, element, requests };
}
test("changing sorting resets pagination and carries the active search and status", async () => {
  const { users, element, requests } = userListFixture();
  await users.refresh();
  element("users-next").onclick(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(new URL(requests.at(-1), "https://example.com").searchParams.get("page"), "2");
  const form = element("users-search");
  form.elements.q.value = "Test + member"; form.elements.status.value = "active"; form.elements.sort.value = "last_active_desc";
  form.elements.sort.onchange(); await new Promise(resolve => setImmediate(resolve));
  const params = new URL(requests.at(-1), "https://example.com").searchParams;
  assert.equal(params.get("page"), "1"); assert.equal(params.get("sort"), "last_active_desc");
  assert.equal(params.get("q"), "Test + member"); assert.equal(params.get("status"), "active");
  element("users-next").onclick(); await new Promise(resolve => setImmediate(resolve));
  const next = new URL(requests.at(-1), "https://example.com").searchParams;
  assert.equal(next.get("sort"), "last_active_desc"); assert.equal(next.get("page"), "2");
});
test("user lists show a Last active column and empty rows span all six columns", async () => {
  const { users, element } = userListFixture(); await users.refresh();
  assert.match(element("users-list").innerHTML, /<th>Last active<\/th>/);
  assert.match(element("users-list").innerHTML, /colspan="6"/);
});
