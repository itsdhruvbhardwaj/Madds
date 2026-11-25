import { createHmac } from "node:crypto";
import { env } from "../config/env.js";
import { hashRefreshToken, getRefreshSessionExpiryDate } from "../lib/auth.js";
import { Session } from "../models/Session.js";

export function refreshLookup(token: string, attempt?: string, now = new Date()) {
  return { revokedAt: null, expiresAt: { $gt: now }, $or: [
    { refreshTokenHash: hashRefreshToken(token) },
    { previousRefreshTokenHash: hashRefreshToken(token), ...(attempt
      ? { previousRefreshAttemptHash: hashRefreshToken(attempt) }
      : { previousRefreshValidUntil: { $gt: now }, previousRefreshAttemptHash: null }) },
  ] };
}

/** CAS keeps logout authoritative. Only the immediately preceding attempt can be recovered. */
export async function rotateRefresh(session: any, token: string, attempt?: string): Promise<string | null> {
  if (!env.jwtRefreshSecret) throw new Error("Refresh secret missing");
  const next = createHmac("sha256", env.jwtRefreshSecret)
    .update(JSON.stringify([String(session._id), token, attempt ?? ""])).digest("hex");
  const hash = hashRefreshToken(token);
  const canReplay = (candidate: any) => candidate && !candidate.revokedAt &&
    new Date(candidate.expiresAt).getTime() > Date.now() &&
    candidate.previousRefreshTokenHash === hash && candidate.refreshTokenHash === hashRefreshToken(next) &&
    (attempt ? candidate.previousRefreshAttemptHash === hashRefreshToken(attempt) :
      !candidate.previousRefreshAttemptHash && new Date(candidate.previousRefreshValidUntil).getTime() > Date.now());
  if (session.refreshTokenHash !== hash) return canReplay(session) ? next : null;
  const update = await Session.updateOne({ _id: session._id, refreshTokenHash: hash,
    revokedAt: null, expiresAt: { $gt: new Date() }, authVersion: session.authVersion ?? 0 }, {
    $set: { refreshTokenHash: hashRefreshToken(next), previousRefreshTokenHash: hash,
      previousRefreshAttemptHash: attempt ? hashRefreshToken(attempt) : null,
      previousRefreshValidUntil: new Date(Date.now() + 120_000),
      expiresAt: getRefreshSessionExpiryDate(), lastUsedAt: new Date() },
  });
  if (update.modifiedCount === 1) return next;
  const current = await Session.findOne({ _id: session._id }).lean();
  return canReplay(current) ? next : null;
}
