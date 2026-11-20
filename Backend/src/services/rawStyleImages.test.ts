import { afterEach, describe, expect, it, vi } from "vitest";
import { RawStyleImage } from "../models/RawStyleImage.js";
const cloudinary = vi.hoisted(() => ({ upload: vi.fn() }));
vi.mock("./cloudinaryAssets.js", async original => ({ ...await original<any>(), uploadRawStyleImage: cloudinary.upload }));
import { beforeImage, saveRawStyleImage } from "./rawStyleImages.js";

describe("reusable raw style images", () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); cloudinary.upload.mockReset(); });

  it("reuses a stored upload when the compressed file has the same bytes", async () => {
    const bytes = Buffer.from("same compressed image");
    const publicId = "picmee/styles/raw-library/existing";
    const url = `https://res.cloudinary.com/test/image/upload/${publicId}.webp`;
    vi.spyOn(RawStyleImage, "findOne").mockReturnValue({ lean: async () => ({ url, name: "Original" }) } as any);
    const result = await saveRawStyleImage(bytes, "copy.webp", "image/webp");
    expect(result.url).toBe(url);
    expect(result.publicId).toMatch(/^picmee\/styles\/raw-library\/[0-9a-f]{64}$/);
    expect(cloudinary.upload).not.toHaveBeenCalled();
  });

  it("imports a managed legacy before preview without choosing the generated image", () => {
    vi.stubEnv("CLOUDINARY_CLOUD_NAME", "test");
    const raw = "picmee/styles/portraits/original";
    const image = beforeImage({ name: "Portrait", previewImages: [
      `https://res.cloudinary.com/test/image/upload/v1/${raw}.jpg`,
      "https://res.cloudinary.com/test/image/upload/picmee/styles/portraits/generated.jpg",
    ] });
    expect(image?.publicId).toBe(raw);
    expect(image?.folders).toEqual(["others"]);
    expect(beforeImage({ name: "Third party", exampleBeforeUrl: "https://res.cloudinary.com/other/image/upload/picmee/styles/portraits/raw.jpg" })).toBeNull();
  });
  it("adds an identical file to another folder without uploading a duplicate", async () => {
    const bytes = Buffer.from("same compressed image");
    const url = "https://res.cloudinary.com/test/image/upload/original.webp";
    vi.spyOn(RawStyleImage, "findOne").mockReturnValue({ lean: async () => ({ url, name: "Original", folders: ["men"] }) } as any);
    const update = vi.spyOn(RawStyleImage, "findOneAndUpdate").mockReturnValue({ lean: async () => ({ url, name: "Original", folders: ["men", "groups"] }) } as any);
    const result = await saveRawStyleImage(bytes, "same.webp", "image/webp", "groups");
    expect(result.folders).toEqual(["men", "groups"]);
    expect(update).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ $addToSet: { folders: "groups" } }), expect.anything());
    expect(cloudinary.upload).not.toHaveBeenCalled();
  });
});
