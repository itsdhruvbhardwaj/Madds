import { createHash, randomUUID } from "node:crypto";
import { env } from "../config/env.js";
import { WatermarkSettings } from "../models/WatermarkSettings.js";
import { cloudinaryIsConfigured, isManagedWatermarkImageId } from "./cloudinaryAssets.js";
import { queueStyleImages } from "./styleImageCleanup.js";

export const watermarkDefaults = { enabled: false, logoUrl: "", logoPublicId: "", widthPercent: 18, opacityPercent: 85, paddingPercent: 2, revision: 0 };
export async function getWatermarkSettings() {
  const saved = await WatermarkSettings.findById("exports").lean();
  return { ...watermarkDefaults, ...saved };
}
export function publicWatermarkSettings(saved: any) {
  const { enabled, logoUrl, widthPercent, opacityPercent, paddingPercent, revision } = saved;
  return { enabled, logoUrl, widthPercent, opacityPercent, paddingPercent, revision };
}
export function validWatermarkLogo(url: unknown, publicId: unknown): boolean {
  if (typeof publicId !== "string" || !isManagedWatermarkImageId(publicId) || typeof url !== "string") return false;
  // Only immutable, versioned PNGs in our own Cloudinary cloud are export assets.
  const prefix = `https://res.cloudinary.com/${env.cloudinaryCloudName}/image/upload/`;
  return url.startsWith(prefix) && new RegExp(`^v[0-9]+/${publicId}\\.png$`).test(url.slice(prefix.length));
}
export function validWatermarkValues(body: any): boolean {
  return body && typeof body.enabled === "boolean" && typeof body.logoUrl === "string" && typeof body.logoPublicId === "string" && Number.isSafeInteger(body.expectedRevision) && body.expectedRevision >= 0 &&
    [[body.widthPercent, 5, 35], [body.opacityPercent, 10, 100], [body.paddingPercent, 1, 10]].every(([n,min,max]) => Number.isInteger(n) && n >= min && n <= max) &&
    ((!body.logoUrl && !body.logoPublicId && !body.enabled) || validWatermarkLogo(body.logoUrl, body.logoPublicId));
}

export async function uploadWatermarkLogo(buffer: Buffer) {
  if (!cloudinaryIsConfigured()) throw new Error("Cloudinary uploads are not configured on the backend.");
  const parameters = { folder: "picmee/branding/watermarks", public_id: `logo-${randomUUID()}`,
    timestamp: String(Math.floor(Date.now() / 1000)), format: "png" };
  const publicId = `${parameters.folder}/${parameters.public_id}`;
  // Queue before upload: timeouts and abandoned edits must not leave permanent orphans.
  await queueStyleImages([publicId], "pending-upload", "Watermark logo awaiting save");
  const form = new FormData();
  for (const [key,value] of Object.entries(parameters)) form.set(key,value);
  form.set("api_key", env.cloudinaryApiKey);
  form.set("signature", createHash("sha1").update(Object.keys(parameters).sort().map(key => `${key}=${parameters[key as keyof typeof parameters]}`).join("&") + env.cloudinaryApiSecret).digest("hex"));
  form.set("file", new Blob([new Uint8Array(buffer)], { type: "image/png" }), "watermark.png");
  const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(env.cloudinaryCloudName)}/image/upload`, {
    method: "POST", body: form, signal: AbortSignal.timeout(20_000),
  });
  const data = await response.json() as any;
  if (!response.ok || data.public_id !== publicId || !validWatermarkLogo(data.secure_url, publicId)) throw new Error("Couldn't upload the logo. Please try again.");
  return { logoUrl: data.secure_url as string, logoPublicId: publicId };
}
