import { createHash, randomUUID } from "node:crypto";
import { env } from "../config/env.js";
import { User } from "../models/User.js";
import { cloudinaryIsConfigured } from "./cloudinaryAssets.js";

function signature(parameters: Record<string, string>) {
  return createHash("sha1").update(Object.keys(parameters).sort()
    .map((key) => `${key}=${parameters[key]}`).join("&") + env.cloudinaryApiSecret).digest("hex");
}

export async function uploadProfileImage(buffer: Buffer, mime: string, userId: string) {
  if (!cloudinaryIsConfigured()) throw new Error("Profile photo uploads are not configured.");
  const publicId = `${userId}-${randomUUID()}`;
  const parameters = {
    folder: "profile", public_id: publicId,
    timestamp: String(Math.floor(Date.now() / 1000)),
    transformation: "c_fill,g_center,w_512,h_512/q_85,f_jpg",
  };
  const form = new FormData();
  for (const [key, value] of Object.entries(parameters)) form.set(key, value);
  form.set("api_key", env.cloudinaryApiKey);
  form.set("signature", signature(parameters));
  form.set("file", new Blob([new Uint8Array(buffer)], { type: mime }), "profile");
  try {
    const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(env.cloudinaryCloudName)}/image/upload`, {
      method: "POST", body: form, signal: AbortSignal.timeout(20_000),
    });
    const result = await response.json() as { public_id?: string; secure_url?: string; width?: number; height?: number };
    if (!response.ok || result.public_id !== `profile/${publicId}` || !result.secure_url?.startsWith(
      `https://res.cloudinary.com/${env.cloudinaryCloudName}/image/upload/`,
    )) throw new Error("Couldn't upload the profile photo. Please try again.");
    return { publicId: result.public_id, url: result.secure_url };
  } catch (error) {
    // A timed-out upload may still have completed remotely. Its server-chosen
    // ID lets the cleanup task remove it later without changing the profile.
    await User.updateOne({ _id: userId, profileImagePublicId: { $ne: `profile/${publicId}` } },
      { $addToSet: { profileImageCleanupIds: `profile/${publicId}` } });
    throw error;
  }
}

export async function destroyProfileImage(publicId: string) {
  if (!/^profile\/[a-zA-Z0-9-]+$/.test(publicId)) throw new Error("Invalid managed profile image.");
  if (!cloudinaryIsConfigured()) throw new Error("Profile photo uploads are not configured.");
  const parameters = { invalidate: "true", public_id: publicId, timestamp: String(Math.floor(Date.now() / 1000)) };
  const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(env.cloudinaryCloudName)}/image/destroy`, {
    method: "POST", body: new URLSearchParams({ ...parameters, api_key: env.cloudinaryApiKey, signature: signature(parameters) }),
    signal: AbortSignal.timeout(12_000),
  });
  const result = await response.json() as { result?: string };
  if (!response.ok || !["ok", "not found"].includes(result.result ?? "")) throw new Error("Profile image cleanup failed.");
}

/** Failed deletions stay on the user record and are retried by the hourly task. */
export async function cleanupPendingProfileImages() {
  const users = await User.find({ "profileImageCleanupIds.0": { $exists: true } })
    .select("_id profileImagePublicId profileImageCleanupIds").limit(100).lean();
  for (const user of users) {
    for (const publicId of user.profileImageCleanupIds ?? []) {
      if (publicId === user.profileImagePublicId) continue;
      try {
        await destroyProfileImage(publicId);
        await User.updateOne({ _id: user._id, profileImagePublicId: { $ne: publicId } },
          { $pull: { profileImageCleanupIds: publicId } });
      } catch {
        console.warn("Profile image cleanup will be retried.");
      }
    }
  }
}
