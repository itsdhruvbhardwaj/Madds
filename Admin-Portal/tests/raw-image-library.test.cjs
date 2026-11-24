const { test } = require("node:test");
const assert = require("node:assert/strict");
const { thumbnail, download } = require("../raw-image-library.js");
const image = { publicId: "picmee/styles/raw-library/abc123", name: "Original photo", url: "https://res.cloudinary.com/test/image/upload/c_limit,w_900,h_1260,q_auto,f_auto/v123/picmee/styles/raw-library/abc123.webp" };
test("library thumbnails use a stable smaller delivery URL", () => {
  assert.equal(thumbnail(image), "https://res.cloudinary.com/test/image/upload/c_limit,w_420,h_588,q_auto:good,f_auto/v123/picmee/styles/raw-library/abc123.webp");
  assert.equal(thumbnail(image), thumbnail(image));
});
test("download retains the saved format, version and identity without thumbnail resizing", () => {
  assert.equal(download(image), "https://res.cloudinary.com/test/image/upload/fl_attachment:Original-photo/v123/picmee/styles/raw-library/abc123.webp");
  const legacy = { publicId: "OldPhoto", name: "Old photo", url: "https://res.cloudinary.com/test/image/upload/q_auto/OldPhoto.jpg" };
  assert.equal(download(legacy), "https://res.cloudinary.com/test/image/upload/fl_attachment:Old-photo/OldPhoto.jpg");
});
test("download does not attach an unrelated or non-Cloudinary URL", () => {
  assert.equal(download({ ...image, publicId: "unrelated" }), null);
  assert.equal(download({ ...image, url: "https://example.com/abc123.webp" }), null);
});
