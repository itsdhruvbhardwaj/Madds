import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { uploadRawStyleImage } from "./cloudinaryAssets.js";

describe("original image Cloudinary upload location", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it("signs the Madds asset folder while preserving the existing public ID", async () => {
    vi.stubEnv("CLOUDINARY_CLOUD_NAME", "test");
    vi.stubEnv("CLOUDINARY_API_KEY", "test-key");
    vi.stubEnv("CLOUDINARY_API_SECRET", "test-secret");
    const publicId = "picmee/styles/raw-library/test-original";
    const url = `https://res.cloudinary.com/test/image/upload/${publicId}.webp`;
    const upload = vi.fn(async (_url: string, request: RequestInit) => {
      const form = request.body as FormData;
      expect(form.get("asset_folder")).toBe("Madds-aiphotostudio/Raw-images");
      expect(form.get("public_id")).toBe(publicId);
      expect(form.get("overwrite")).toBe("false");
      const signed = `asset_folder=Madds-aiphotostudio/Raw-images&overwrite=false&public_id=${publicId}&timestamp=${form.get("timestamp")}test-secret`;
      expect(form.get("signature")).toBe(createHash("sha1").update(signed).digest("hex"));
      return Response.json({ public_id: publicId, secure_url: url });
    });
    vi.stubGlobal("fetch", upload);
    expect(await uploadRawStyleImage(Buffer.from("image"), "test.webp", "image/webp", publicId)).toBe(url);
    expect(upload).toHaveBeenCalledOnce();
  });
});
