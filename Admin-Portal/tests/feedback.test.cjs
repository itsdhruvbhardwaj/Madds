const { test } = require("node:test"), assert = require("node:assert/strict");
const { senderDetails } = require("../feedback.js");
test("feedback shows the account identity separately from the optional reply email and escapes it", () => {
  const html = senderDetails({ userName: "<script>Sender</script>", userEmail: "account@example.com", userId: "abc", contactEmail: "reply@example.com" });
  assert.ok(html.includes("&lt;script&gt;Sender&lt;/script&gt;"));
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("account@example.com"));
  assert.ok(html.includes("Reply email: reply@example.com"));
  assert.ok(html.includes("User ID: abc"));
  assert.ok(senderDetails({ userId: "deleted" }).includes("Account unavailable"));
});
