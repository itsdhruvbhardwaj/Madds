import { afterEach, describe, expect, it, vi } from "vitest";
const userMocks = vi.hoisted(() => ({ updateOne: vi.fn(), find: vi.fn() }));
vi.mock("../models/User.js", () => ({ User: userMocks }));
import { uploadProfileImage, destroyProfileImage, cleanupPendingProfileImages } from "./profileImages.js";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("Cloudinary profile images", () => {
  it("uses the separate profile folder, server signing, and bounded image dimensions", async () => {
    vi.stubEnv("CLOUDINARY_CLOUD_NAME", "test-cloud");
    vi.stubEnv("CLOUDINARY_API_KEY", "test-key");
    vi.stubEnv("CLOUDINARY_API_SECRET", "test-secret");
    const fetchMock = vi.fn().mockImplementation(async (_url, options) => {
      const body = options.body as FormData;
      const id = `profile/${body.get("public_id")}`;
      expect(body.get("folder")).toBe("profile");
      expect(body.get("transformation")).toContain("w_512,h_512");
      expect(body.get("signature")).toMatch(/^[a-f0-9]{40}$/);
      expect(body.get("file")).toBeInstanceOf(Blob);
      return { ok: true, json: async () => ({ public_id: id, secure_url: `https://res.cloudinary.com/test-cloud/image/upload/${id}.jpg` }) };
    });
    vi.stubGlobal("fetch", fetchMock);
    const image = await uploadProfileImage(Buffer.from("test"), "image/jpeg", "user-a");
    expect(image.publicId).toMatch(/^profile\/user-a-/);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.cloudinary.com/v1_1/test-cloud/image/upload");
  });

  it("never deletes catalogue images or externally supplied paths", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(destroyProfileImage("picmee/styles/private")).rejects.toThrow();
    await expect(destroyProfileImage("profile/../private")).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("queues an ambiguous upload for cleanup without changing the active profile", async () => {
    vi.stubEnv("CLOUDINARY_CLOUD_NAME", "test-cloud");
    vi.stubEnv("CLOUDINARY_API_KEY", "test-key");
    vi.stubEnv("CLOUDINARY_API_SECRET", "test-secret");
    userMocks.updateOne.mockResolvedValue({ matchedCount: 1 });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
    await expect(uploadProfileImage(Buffer.from("test"), "image/jpeg", "user-a")).rejects.toThrow("timeout");
    expect(userMocks.updateOne).toHaveBeenCalledWith(
      { _id: "user-a", profileImagePublicId: { $ne: expect.stringMatching(/^profile\/user-a-/) } },
      { $addToSet: { profileImageCleanupIds: expect.stringMatching(/^profile\/user-a-/) } },
    );
  });

  it("cleanup deletes queued replacements but never the active photo", async () => {
    vi.stubEnv("CLOUDINARY_CLOUD_NAME", "test-cloud");
    vi.stubEnv("CLOUDINARY_API_KEY", "test-key");
    vi.stubEnv("CLOUDINARY_API_SECRET", "test-secret");
    userMocks.find.mockReturnValue({ select: () => ({ limit: () => ({ lean: async () => [{
      _id: "user-a", profileImagePublicId: "profile/current", profileImageCleanupIds: ["profile/current", "profile/old"],
    }] }) }) });
    userMocks.updateOne.mockClear().mockResolvedValue({ matchedCount: 1 });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ result: "ok" }) });
    vi.stubGlobal("fetch", fetchMock);
    await cleanupPendingProfileImages();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0][1].body as URLSearchParams).get("public_id")).toBe("profile/old");
    expect(userMocks.updateOne).toHaveBeenCalledWith(
      { _id: "user-a", profileImagePublicId: { $ne: "profile/old" } },
      { $pull: { profileImageCleanupIds: "profile/old" } },
    );
  });
});
