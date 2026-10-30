import { createHash, randomUUID } from "node:crypto";

import { env } from "../config/env.js";

export type CloudinaryUploadSignature = {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder: string;
  publicId: string;
  expectedPublicId: string;
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
  const expectedPublicId = `${folder}/${publicId}`;
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
    expectedPublicId,
    tags,
  };
}

/**
 * Notification images are uploaded directly from Madds Studio with a short-lived
 * signature. Keeping the secret on the backend lets Studio upload efficiently
 * without ever exposing Cloudinary credentials to the browser.
 */
export function createNotificationImageUploadSignature(): CloudinaryUploadSignature {
  const folder = "picmee/notifications";
  const timestamp = Math.floor(Date.now() / 1000);
  const publicId = `notification-${randomUUID()}`;
  const expectedPublicId = `${folder}/${publicId}`;
  const tags = "picmee-notification";
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
    expectedPublicId,
    tags,
  };
}

/**
 * Older Studio versions queued the bare `img-<uuid>` before uploading, while
 * Cloudinary prepends the upload folder to the resulting public_id. Resolve
 * those legacy queue IDs through the Admin Search API before retrying deletion.
 */
export async function resolveLegacyStyleImagePublicIds(publicIds: string[]): Promise<Map<string, string>> {
  const wanted = new Set(publicIds.filter((id) => /^img-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)));
  const resolved = new Map<string, string>();
  if (!wanted.size) return resolved;
  if (!cloudinaryIsConfigured()) throw new Error("Cloudinary credentials are not configured.");

  let nextCursor: string | undefined;
  do {
    const body: Record<string, unknown> = {
      expression: "resource_type:image AND public_id=picmee/styles/*",
      max_results: 500,
      sort_by: [{ public_id: "asc" }],
    };
    if (nextCursor) body.next_cursor = nextCursor;
    const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(env.cloudinaryCloudName)}/resources/search`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${env.cloudinaryApiKey}:${env.cloudinaryApiSecret}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12_000),
    });
    const result = await response.json() as {
      resources?: Array<{ public_id?: string }>;
      next_cursor?: string;
      error?: { message?: string };
    };
    if (!response.ok) throw new Error(result.error?.message || `Cloudinary asset lookup failed (${response.status}).`);
    for (const resource of result.resources ?? []) {
      const fullPublicId = resource.public_id;
      if (!fullPublicId?.startsWith("picmee/styles/")) continue;
      const basename = fullPublicId.slice(fullPublicId.lastIndexOf("/") + 1);
      if (wanted.has(basename)) resolved.set(basename, fullPublicId);
    }
    nextCursor = result.next_cursor;
  } while (nextCursor && resolved.size < wanted.size);

  return resolved;
}

export async function destroyManagedStyleImage(publicId: string): Promise<void> {
  if (!publicId.startsWith("picmee/styles/") || publicId.includes("..")) {
    throw new Error("Refusing to delete an image outside the PicMee styles folders.");
  }
  if (!cloudinaryIsConfigured()) throw new Error("Cloudinary credentials are not configured.");

  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signCloudinaryParameters({
    invalidate: "true",
    public_id: publicId,
    timestamp: String(timestamp),
  });
  const body = new URLSearchParams({
    invalidate: "true",
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
