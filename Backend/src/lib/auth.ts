import crypto from "node:crypto";

import bcrypt from "bcryptjs";
import type { JwtPayload } from "jsonwebtoken";
import jwt from "jsonwebtoken";

import { env } from "../config/env.js";

export type AuthenticatedUser = {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
  isActive: boolean;
  credits: number;
  profileImage?: string | null;
};

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export function comparePassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

export function createRandomToken(sizeInBytes = 32): string {
  return crypto.randomBytes(sizeInBytes).toString("hex");
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function createAccessToken(userId: string, sessionId?: string): string {
  const secret = env.jwtAccessSecret;
  if (!secret) {
    throw new Error("JWT access secret is not configured.");
  }

  return jwt.sign(
    {
      sub: userId,
      sid: sessionId,
      type: "access",
    },
    secret as any,
    {
      expiresIn: env.jwtAccessExpiresIn,
      issuer: "picme-ai-backend",
    } as any,
  );
}

export function verifyAccessToken(token: string): JwtPayload & { sub?: string; sid?: string } {
  const secret = env.jwtAccessSecret;
  if (!secret) {
    throw new Error("JWT access secret is not configured.");
  }

  return jwt.verify(token, secret as any, {
    issuer: "picme-ai-backend",
  } as any) as JwtPayload & { sub?: string; sid?: string };
}

export function parseDurationToMs(value: string): number {
  const raw = value.trim();
  if (!raw) return 30 * 24 * 60 * 60 * 1000;

  const match = /^(\d+)(ms|s|m|h|d)?$/i.exec(raw);
  if (!match) return 30 * 24 * 60 * 60 * 1000;

  const amount = Number(match[1]);
  const unit = (match[2] ?? "ms").toLowerCase();
  const multipliers: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return amount * (multipliers[unit] ?? 1);
}

export function getRefreshSessionExpiryDate(): Date {
  return new Date(Date.now() + parseDurationToMs(env.jwtRefreshExpiresIn || "30d"));
}

export function createRefreshToken(): string {
  return createRandomToken(32);
}

export function hashRefreshToken(token: string): string {
  return hashToken(token);
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function isStrongPassword(value: string): boolean {
  return value.length >= 8 && /[A-Z]/.test(value) && /[a-z]/.test(value) && /\d/.test(value);
}

export function sanitizeUser(user: {
  _id?: { toString(): string } | string;
  id?: string;
  name?: string;
  email?: string;
  emailVerified?: boolean;
  profileImage?: string | null;
  isActive?: boolean;
  credits?: number;
}): AuthenticatedUser {
  const id = typeof user._id === "string" ? user._id : user._id?.toString?.() ?? user.id ?? "";

  return {
    id,
    email: user.email ?? "",
    name: user.name ?? "",
    emailVerified: Boolean(user.emailVerified),
    isActive: Boolean(user.isActive),
    credits: typeof user.credits === "number" && Number.isFinite(user.credits)
      ? user.credits
      : 0,
    profileImage: user.profileImage ?? null,
  };
}
