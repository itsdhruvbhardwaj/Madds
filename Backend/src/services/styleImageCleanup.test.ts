import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CatalogStyle } from "../models/CatalogStyle.js";
import { CloudinaryCleanup } from "../models/CloudinaryCleanup.js";
const cloud = vi.hoisted(() => ({ destroy: vi.fn(), resolve: vi.fn() }));
vi.mock("./cloudinaryAssets.js", async original => ({ ...await original<any>(), destroyManagedStyleImage: cloud.destroy, resolveLegacyStyleImagePublicIds: cloud.resolve }));
import { getStyleImageIds, queueStyleImages, retryPendingCloudinaryCleanup, styleImageReferenceFilter, startStyleImageCleanup } from "./styleImageCleanup.js";
const id = "picmee/styles/indian-traditional/img-27648c1c-456a-4d49-ac96-0bbfa886c6cc";
const item = { _id: "job", publicId: id, styleId: "discarded-upload", attempts: 0 };
function pending(items: any[]) {
  vi.spyOn(CloudinaryCleanup, "find").mockReturnValue({ sort: () => ({ limit: () => ({ lean: async () => items }) }) } as any);
}
describe("style image cleanup", () => {
  beforeEach(() => {
    vi.stubEnv("CLOUDINARY_CLOUD_NAME", "test");
    vi.spyOn(CatalogStyle, "exists").mockResolvedValue(null);
    vi.spyOn(CloudinaryCleanup, "findOneAndUpdate").mockReturnValue({ lean: async () => ({ ...item, attempts: 1 }) } as any);
    vi.spyOn(CloudinaryCleanup, "deleteOne").mockResolvedValue({} as any);
    vi.spyOn(CloudinaryCleanup, "updateOne").mockResolvedValue({} as any);
    cloud.destroy.mockReset(); cloud.destroy.mockResolvedValue(undefined);
    cloud.resolve.mockReset(); cloud.resolve.mockResolvedValue(new Map());
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.useRealTimers(); });
  it("recovers managed URL-only references without allowing unrelated folders or clouds", () => {
    expect(getStyleImageIds({ thumbnail: `https://res.cloudinary.com/test/image/upload/q_auto/v123/${id}.jpg`, previewImagePublicIds: [id] })).toEqual([id]);
    expect(getStyleImageIds({ thumbnail: `https://res.cloudinary.com/other/image/upload/${id}.jpg`, exampleBeforeUrl: "https://res.cloudinary.com/test/image/upload/profile/a.jpg", thumbnailPublicId: "profile/a" })).toEqual([]);
  });
  it("handles original bundled covers without granting arbitrary root deletion", async () => {
    vi.stubEnv("CLOUDINARY_CLOUD_NAME", "xjqlkkta");
    const root = "Golden-Hour_Riverfront_Embrace";
    expect(getStyleImageIds({ thumbnail: `https://res.cloudinary.com/xjqlkkta/image/upload/q_auto/v1791225261/${root}.png` })).toEqual([root]);
    expect(getStyleImageIds({ thumbnail: "https://res.cloudinary.com/xjqlkkta/image/upload/v123/unrelated-image.png" })).toEqual([]);
    pending([{ ...item, publicId: root }]);
    await retryPendingCloudinaryCleanup();
    expect(cloud.destroy).toHaveBeenCalledWith(root);
  });
  it("checks URL references as well as saved public IDs before every deletion", async () => {
    pending([item]); vi.mocked(CatalogStyle.exists).mockResolvedValue({ _id: "shared-style" } as any);
    await retryPendingCloudinaryCleanup();
    expect(CatalogStyle.exists).toHaveBeenCalledWith(styleImageReferenceFilter(id));
    const filter = styleImageReferenceFilter(id);
    const pattern = new RegExp((filter.$or[4] as any).thumbnail.$regex);
    expect(pattern.test(`https://res.cloudinary.com/test/image/upload/q_auto/v123/${id}.jpg`)).toBe(true);
    expect(cloud.destroy).not.toHaveBeenCalled();
    expect(CloudinaryCleanup.deleteOne).not.toHaveBeenCalled();
    expect(CloudinaryCleanup.updateOne).toHaveBeenCalled();
  });
  it("deletes confirmed unused files and removes their queue entries", async () => {
    pending([item]); await retryPendingCloudinaryCleanup();
    expect(cloud.destroy).toHaveBeenCalledWith(id);
    expect(CloudinaryCleanup.deleteOne).toHaveBeenCalledWith({ _id: "job" });
  });
  it("retains failures with backoff and releases the worker lease", async () => {
    pending([item]); cloud.destroy.mockRejectedValue(new Error("Cloudinary unavailable"));
    const before = Date.now(); await retryPendingCloudinaryCleanup();
    expect(CloudinaryCleanup.deleteOne).not.toHaveBeenCalled();
    const update = vi.mocked(CloudinaryCleanup.updateOne).mock.calls[0][1] as any;
    expect(update.$set.lastError).toBe("Cloudinary unavailable");
    expect(update.$set.cleanupAfter.getTime()).toBeGreaterThanOrEqual(before + 60_000);
    expect(update.$unset.leaseUntil).toBe(1);
  });
  it("does not delete when another worker already holds the job", async () => {
    pending([item]); vi.mocked(CloudinaryCleanup.findOneAndUpdate).mockReturnValue({ lean: async () => null } as any);
    await retryPendingCloudinaryCleanup(); expect(cloud.destroy).not.toHaveBeenCalled();
  });
  it("persists a delayed safety job before a catalogue change can start", async () => {
    const before = Date.now(); await queueStyleImages([id], "style", "Style name");
    const update = vi.mocked(CloudinaryCleanup.updateOne).mock.calls[0][1] as any;
    expect(update.$setOnInsert.cleanupAfter.getTime()).toBeGreaterThanOrEqual(before + 86_400_000);
    expect(cloud.destroy).not.toHaveBeenCalled();
  });
  it("keeps legacy IDs queued when lookup fails instead of assuming the image is gone", async () => {
    const legacy = { ...item, publicId: "img-27648c1c-456a-4d49-ac96-0bbfa886c6cc", styleId: "pending-upload" };
    pending([legacy]); cloud.resolve.mockRejectedValue(new Error("unauthorized"));
    await retryPendingCloudinaryCleanup();
    expect(CloudinaryCleanup.deleteOne).not.toHaveBeenCalled(); expect(cloud.destroy).not.toHaveBeenCalled();
    expect(CloudinaryCleanup.updateOne).toHaveBeenCalled();
  });
  it("runs on startup and periodically without opening Studio", async () => {
    vi.useFakeTimers(); pending([]);
    const stop = startStyleImageCleanup();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(CloudinaryCleanup.find).toHaveBeenCalledTimes(2);
    stop(); await vi.advanceTimersByTimeAsync(60_000);
    expect(CloudinaryCleanup.find).toHaveBeenCalledTimes(2);
  });
});
