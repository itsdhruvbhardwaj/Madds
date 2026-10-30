import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findById: vi.fn(), findOneAndUpdate: vi.fn(), updateOne: vi.fn(), upload: vi.fn(), destroy: vi.fn(),
}));
vi.mock("../models/User.js", () => ({ User: mocks }));
vi.mock("../middleware/auth.js", () => ({ requireAuth: (req: any, res: any, next: any) => {
  if (req.headers.authorization !== "Bearer test") return res.sendStatus(401);
  req.user = { id: "user-a" };
  next();
} }));
vi.mock("../services/profileImages.js", () => ({ uploadProfileImage: mocks.upload, destroyProfileImage: mocks.destroy }));
import { profileRouter } from "./profile.js";

const app = express();
app.use(express.json());
app.use("/profile", profileRouter);
const user = { _id: "user-a", name: "Tester", email: "test@example.com", isActive: true,
  profileImagePublicId: "profile/user-a-old", profileImage: "https://example.com/old.jpg" };
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5ioAAAAASUVORK5CYII=", "base64");

describe("profile appearance API", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.findById.mockReturnValue({ lean: async () => user });
    mocks.findOneAndUpdate.mockResolvedValue({ ...user, profileAppearance: "avatar", avatarId: "avatar_001", avatarBackground: "sage", profileSetupComplete: true });
    mocks.upload.mockResolvedValue({ publicId: "profile/user-a-new", url: "https://res.cloudinary.com/test/image/upload/profile/user-a-new.jpg" });
    mocks.updateOne.mockResolvedValue({ matchedCount: 1 });
    mocks.destroy.mockResolvedValue(undefined);
  });

  it("requires authentication before accepting profile updates or files", async () => {
    expect((await request(app).patch("/profile/appearance").send({})).status).toBe(401);
    expect((await request(app).post("/profile/photo").attach("image", png, "photo.png")).status).toBe(401);
    expect(mocks.findById).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("saves only valid presets against the authenticated user and queues the replaced photo", async () => {
    const response = await request(app).patch("/profile/appearance").set("Authorization", "Bearer test")
      .send({ userId: "someone-else", profileAppearance: "avatar", avatarId: "avatar_001", avatarBackground: "sage" });
    expect(response.status).toBe(200);
    expect(mocks.findOneAndUpdate).toHaveBeenCalledWith(expect.objectContaining({ _id: "user-a", profileImagePublicId: user.profileImagePublicId }),
      expect.objectContaining({ $set: expect.objectContaining({ profileImage: "", profileImagePublicId: "", avatarId: "avatar_001", avatarBackground: "sage" }),
        $addToSet: { profileImageCleanupIds: "profile/user-a-old" } }), { new: true });
    expect(response.body.user).toMatchObject({ id: "user-a", avatarId: "avatar_001", avatarBackground: "sage" });
    expect(response.body.user.profileImagePublicId).toBeUndefined();
  });

  it.each([
    { avatarId: "avatar_000", avatarBackground: "gold" },
    { avatarId: "avatar_001", avatarBackground: "unknown" },
    { avatarId: "../private", avatarBackground: "gold" },
  ])("rejects unknown preset and background selections", async (selection) => {
    const response = await request(app).patch("/profile/appearance").set("Authorization", "Bearer test")
      .send({ profileAppearance: "avatar", ...selection });
    expect(response.status).toBe(400);
    expect(mocks.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("skipping setup preserves the existing photo", async () => {
    const response = await request(app).patch("/profile/appearance").set("Authorization", "Bearer test").send({ skip: true });
    expect(response.status).toBe(200);
    expect(mocks.findOneAndUpdate.mock.calls[0][1]).toEqual({ $set: { profileSetupComplete: true } });
  });

  it("uploads verified image bytes and stores the returned Cloudinary reference", async () => {
    const response = await request(app).post("/profile/photo").set("Authorization", "Bearer test").attach("image", png, "photo.png");
    expect(response.status).toBe(200);
    expect(mocks.upload).toHaveBeenCalledWith(png, "image/png", "user-a");
    expect(mocks.findOneAndUpdate.mock.calls[0][1].$set).toMatchObject({ profileAppearance: "photo",
      profileImagePublicId: "profile/user-a-new", profileSetupComplete: true });
  });

  it("rejects disguised non-image data before uploading", async () => {
    const response = await request(app).post("/profile/photo").set("Authorization", "Bearer test")
      .attach("image", Buffer.from("<script>not an image</script>"), { filename: "photo.png", contentType: "image/png" });
    expect(response.status).toBe(400);
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("rejects oversized photos", async () => {
    const response = await request(app).post("/profile/photo").set("Authorization", "Bearer test")
      .attach("image", Buffer.alloc(4 * 1024 * 1024 + 1), "photo.png");
    expect(response.status).toBe(400);
    expect(mocks.upload).not.toHaveBeenCalled();
  });

  it("cleans up a losing upload if another device changes the profile concurrently", async () => {
    mocks.findOneAndUpdate.mockResolvedValue(null);
    const response = await request(app).post("/profile/photo").set("Authorization", "Bearer test").attach("image", png, "photo.png");
    expect(response.status).toBe(409);
    expect(mocks.destroy).toHaveBeenCalledWith("profile/user-a-new");
  });

  it("retains the existing profile on Cloudinary failure", async () => {
    mocks.upload.mockRejectedValue(new Error("timeout"));
    const response = await request(app).post("/profile/photo").set("Authorization", "Bearer test").attach("image", png, "photo.png");
    expect(response.status).toBe(503);
    expect(mocks.findOneAndUpdate).not.toHaveBeenCalled();
  });
});
