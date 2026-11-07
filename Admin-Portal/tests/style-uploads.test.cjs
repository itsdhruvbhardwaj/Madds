const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
function create(discard) {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../style-uploads.js"), "utf8"), context);
  return context.window.MaddsStyleUploads.create({ discard });
}
test("opening a style clears all retained hidden image fields", () => {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../style-uploads.js"), "utf8"), context);
  const names = ["thumbnail", "thumbnailPublicId", "exampleBeforeUrl", "exampleBeforePublicId", "exampleAfterUrl", "exampleAfterPublicId", "previewImages", "previewImagePublicIds"];
  const form = { elements: Object.fromEntries(names.map(name => [name, {value:"previous-style-image"}])) };
  context.window.MaddsStyleUploads.clearImageFields(form);
  assert.ok(names.every(name => form.elements[name].value === ""));
});
test("removing the preview pair keeps the current cover", () => {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../style-uploads.js"), "utf8"), context);
  const names = ["thumbnail", "thumbnailPublicId", "exampleBeforeUrl", "exampleBeforePublicId", "exampleAfterUrl", "exampleAfterPublicId", "previewImages", "previewImagePublicIds"];
  const form = { elements: Object.fromEntries(names.map(name => [name, {value:"saved-image"}])) };
  context.window.MaddsStyleUploads.clearImageFields(form,true);
  assert.equal(form.elements.thumbnail.value,"saved-image");
  assert.equal(form.elements.thumbnailPublicId.value,"saved-image");
  assert.ok(names.slice(2).every(name => form.elements[name].value === ""));
});
test("only unused uploads from this editor are discarded", async () => {
  const calls = [], uploads = create(async id => calls.push(id));
  uploads.track("old-upload"); uploads.track("new-upload");
  await uploads.releaseUnused(["new-upload", "existing-saved-image"]);
  assert.deepEqual(calls, ["old-upload"]);
});
test("closing discards unsaved uploads while saved ones stay protected", async () => {
  const calls = [], uploads = create(async id => calls.push(id));
  uploads.track("saved-upload"); uploads.track("abandoned-upload"); uploads.saved(["saved-upload"]);
  await uploads.releaseUnused(); assert.deepEqual(calls, ["abandoned-upload"]);
});
test("failed discard remains tracked for the next attempt", async () => {
  let fail = true; const calls = [], uploads = create(async id => { calls.push(id); if (fail) throw Error("offline"); });
  uploads.track("upload"); await assert.rejects(uploads.releaseUnused());
  fail = false; await uploads.releaseUnused(); await uploads.releaseUnused();
  assert.deepEqual(calls, ["upload", "upload"]);
});
test("overlapping cleanup requests do not submit duplicate deletions", async () => {
  let finish; const calls = [], uploads = create(id => { calls.push(id); return new Promise(resolve => { finish = resolve; }); });
  uploads.track("upload"); const a = uploads.releaseUnused(), b = uploads.releaseUnused();
  await Promise.resolve(); finish(); await Promise.all([a,b]);
  assert.deepEqual(calls, ["upload"]);
});
