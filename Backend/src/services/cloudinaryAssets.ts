import { createHash, randomUUID } from "node:crypto";

import { env } from "../config/env.js";

export type CloudinaryUploadSignature = {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
  publicId: string;
  tags: string;
};

export function cloudinaryIsConfigured(): boolean {
  return Boolean(env.cloudinaryCloudName && env.cloudinaryApiKey && env.cloudinaryApiSecret);
}

export function createStyleImageUploadSignature(collectionNames: string[]): CloudinaryUploadSignature {
  const names = collectionNames.length ? collectionNames : ["Other"];
  const primarySlug = slugify(names[0]) || "other";
  const folder = `picmee/styles/${primarySlug}`;
  const timestamp = Math.floor(Date.now() / 1000);
  const publicId = `img-${randomUUID()}`;
  const tags = [...new Set(["picmee-style", ...names.map((name) => slugify(name)).filter(Boolean)])].join(",");
  const signature = signCloudinaryParameters({
    folder,
    public_id: publicId,
    tags,
    timestamp: String(timestamp),
  });

  return {
    cloudName: env.cloudinaryCloudName,
    apiKey: env.cloudinaryApiKey,
    timestamp,
    signature,
    folder,
    publicId,
    tags,
  };
}

export async function destroyManagedStyleImage(publicId: string): Promise<void> {
  if (!publicId.startsWith("picmee/styles/") || publicId.includes("..")) {
    throw new Error("Refusing to delete an image outside the PicMee styles folders.");
  }
  if (!cloudinaryIsConfigured()) throw new Error("Cloudinary credentials are not configured.");

  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signCloudinaryParameters({ public_id: publicId, timestamp: String(timestamp) });
  const body = new URLSearchParams({
    public_id: publicId,
    timestamp: String(timestamp),
    api_key: env.cloudinaryApiKey,
    signature,
  });
  const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(env.cloudinaryCloudName)}/image/destroy`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(12_000),
  });
  const result = await response.json() as { result?: string; error?: { message?: string } };
  if (!response.ok || (result.result !== "ok" && result.result !== "not found")) {
    throw new Error(result.error?.message || `Cloudinary image deletion failed (${response.status}).`);
  }
}

function signCloudinaryParameters(parameters: Record<string, string>): string {
  const serialized = Object.keys(parameters).sort()
    .map((key) => `${key}=${parameters[key]}`)
    .join("&");
  return createHash("sha1").update(`${serialized}${env.cloudinaryApiSecret}`).digest("hex");
}

function slugify(value: string): string {
  return value.normalize("NFKD").toLowerCase().trim()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
