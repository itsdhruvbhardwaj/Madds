const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const context = { window: {} };
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
