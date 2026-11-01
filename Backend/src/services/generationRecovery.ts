import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "../config/env.js";
import { Generation } from "../models/Generation.js";
import { GenerationResult } from "../models/GenerationResult.js";

const RETENTION_MS = 24 * 60 * 60_000;
function key() {
  const secret = process.env.GENERATION_RESULT_SECRET || env.jwtRefreshSecret;
  if (!secret) throw new Error("A persistent generation result secret is required.");
  return createHash("sha256").update(`madds-generation-result-v1:${secret}`).digest();
}
export function sealResult(image: string, owner: string): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(owner));
  const bytes = Buffer.concat([cipher.update(image, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), bytes]);
}
export function openResult(bytes: Buffer, owner: string): string {
  const cipher = createDecipheriv("aes-256-gcm", key(), bytes.subarray(0, 12));
  cipher.setAuthTag(bytes.subarray(12, 28));
  cipher.setAAD(Buffer.from(owner));
  return Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString("utf8");
}
export async function saveGenerationResult(userId: string, generationId: string, image: string) {
  const bytes = sealResult(image, `${userId}:${generationId}`);
  const expiresAt = new Date(Date.now() + RETENTION_MS);
  const size = 512 * 1024;
  // Retrying storage never retries the paid provider operation.
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const parts = [];
      for (let offset = 0, part = 0; offset < bytes.length; offset += size, part++) {
        parts.push({ updateOne: { filter: { generationId, part }, update: { $set: {
          userId, generationId, part, data: bytes.subarray(offset, offset + size), expiresAt,
        } }, upsert: true } });
      }
      await GenerationResult.bulkWrite(parts);
      await Generation.updateOne({ _id: generationId, userId, status: "processing" }, {
        $set: { resultParts: parts.length, resultExpiresAt: expiresAt, providerCompletedAt: new Date() },
      });
      return;
    } catch (error) { lastError = error; }
  }
  throw lastError;
}
export async function readGenerationResult(userId: string, generation: any): Promise<string | null> {
  if (!generation.resultParts || !generation.resultExpiresAt || new Date(generation.resultExpiresAt).getTime() <= Date.now()) return null;
  const parts = await GenerationResult.find({ userId, generationId: generation._id, expiresAt: { $gt: new Date() } }).sort({ part: 1 });
  if (parts.length !== generation.resultParts) return null;
  return openResult(Buffer.concat(parts.map((part: any) => Buffer.from(part.data))), `${userId}:${generation._id}`);
}
