import { createHash, randomBytes } from "node:crypto";

import mongoose, { type ClientSession } from "mongoose";

import { CreditTransaction } from "../../models/CreditTransaction.js";
import { Generation } from "../../models/Generation.js";
import { RewardedAdAttempt } from "../../models/RewardedAdAttempt.js";
import { User } from "../../models/User.js";

export const WELCOME_CREDITS = 100;

export function hashIdempotencyKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function fingerprintGenerationRequest(
  styleId: string,
  images: Array<{ buffer: Buffer }>,
  customPrompt?: string,
): string {
  const hash = createHash("sha256")
    .update(String(Buffer.byteLength(styleId)))
    .update(":")
    .update(styleId);
  if (customPrompt !== undefined) {
    hash
      .update("\0custom-prompt\0")
      .update(String(Buffer.byteLength(customPrompt)))
      .update(":")
      .update(customPrompt);
  }
  for (const image of images) {
    hash.update(String(image.buffer.length));
    hash.update(":");
    hash.update(image.buffer);
  }
  return hash.digest("hex");
}

export type NewUserDetails = {
  name: string;
  email: string;
  passwordHash?: string;
  googleId?: string;
  profileImage?: string;
  emailVerified: boolean;
  isActive: boolean;
};

export class InsufficientCreditsError extends Error {
  constructor(
    readonly requiredCredits: number,
    readonly availableCredits: number,
  ) {
    super("Not enough credits.");
    this.name = "InsufficientCreditsError";
  }
}

export class IdempotencyConflictError extends Error {
  constructor(
    readonly generationId: string,
    readonly status: "processing" | "completed" | "failed" | "outcome_unknown",
    readonly sameRequest: boolean,
  ) {
    super("An operation already exists for this idempotency key.");
    this.name = "IdempotencyConflictError";
  }
}

export class UserNotFoundError extends Error {
  constructor() {
    super("User not found.");
    this.name = "UserNotFoundError";
  }
}

export type RewardedAdCreditResult =
  | { status: "granted" }
  | { status: "duplicate" }
  | { status: "invalid_attempt" }
  | { status: "expired" }
  | { status: "transaction_conflict" };

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
}

export async function createRewardedAdAttempt(
  userId: string,
  expiresAt: Date,
): Promise<{ customData: string; expiresAt: Date }> {
  const customData = randomBytes(32).toString("base64url");
  const ticketHash = createHash("sha256").update(customData).digest("hex");

  await RewardedAdAttempt.create({
    userId,
    ticketHash,
    status: "pending",
    expiresAt,
  });

  return { customData, expiresAt };
}

export async function grantRewardedAdCredits(input: {
  ticketHash: string;
  transactionId: string;
  credits: number;
  now?: Date;
}): Promise<RewardedAdCreditResult> {
  if (!Number.isSafeInteger(input.credits) || input.credits <= 0) {
    throw new Error("Rewarded-ad credit amount must be a positive integer.");
  }

  const now = input.now ?? new Date();
  const session: ClientSession = await mongoose.startSession();

  try {
    try {
      const result = await session.withTransaction(async () => {
        const existingTransaction = await RewardedAdAttempt.findOne({
          transactionId: input.transactionId,
        }).session(session).lean();

        if (existingTransaction) {
          return existingTransaction.ticketHash === input.ticketHash &&
            existingTransaction.status === "redeemed"
            ? { status: "duplicate" as const }
            : { status: "transaction_conflict" as const };
        }

        const attempt = await RewardedAdAttempt.findOne({
          ticketHash: input.ticketHash,
        }).session(session).lean();

        if (!attempt) {
          return { status: "invalid_attempt" as const };
        }
        if (attempt.status === "redeemed") {
          return attempt.transactionId === input.transactionId
            ? { status: "duplicate" as const }
            : { status: "transaction_conflict" as const };
        }
        if (attempt.status !== "pending") {
          return { status: "expired" as const };
        }
        if (new Date(attempt.expiresAt).getTime() <= now.getTime()) {
          await RewardedAdAttempt.updateOne(
            { _id: attempt._id, status: "pending", expiresAt: { $lte: now } },
            { $set: { status: "expired" } },
            { session },
          );
          return { status: "expired" as const };
        }

        const claimedAttempt = await RewardedAdAttempt.findOneAndUpdate(
          {
            _id: attempt._id,
            ticketHash: input.ticketHash,
            status: "pending",
            expiresAt: { $gt: now },
            transactionId: { $exists: false },
          },
          {
            $set: {
              status: "redeemed",
              transactionId: input.transactionId,
              redeemedAt: now,
            },
          },
          { new: true, session },
        ).lean();

        if (!claimedAttempt) {
          const latestAttempt = await RewardedAdAttempt.findOne({
            ticketHash: input.ticketHash,
          }).session(session).lean();
          if (latestAttempt?.status === "redeemed") {
            return latestAttempt.transactionId === input.transactionId
              ? { status: "duplicate" as const }
              : { status: "transaction_conflict" as const };
          }
          return { status: "expired" as const };
        }

        const user = await User.findByIdAndUpdate(
          attempt.userId,
          { $inc: { credits: input.credits } },
          { new: true, session },
        );
        if (!user) {
          throw new UserNotFoundError();
        }

        await CreditTransaction.create(
          [{
            userId: attempt.userId,
            amount: input.credits,
            type: "REWARDED_AD",
            balanceAfter: user.credits,
            referenceId: input.transactionId,
            description: "Verified AdMob rewarded ad",
          }],
          { session },
        );

        return { status: "granted" as const };
      });

      if (!result) {
        throw new Error("Rewarded-ad credit transaction did not complete.");
      }
      return result;
    } catch (error) {
      if (!isDuplicateKeyError(error)) {
        throw error;
      }

      const existingTransaction = await RewardedAdAttempt.findOne({
        transactionId: input.transactionId,
      }).lean();
      if (existingTransaction) {
        return existingTransaction.ticketHash === input.ticketHash &&
          existingTransaction.status === "redeemed"
          ? { status: "duplicate" }
          : { status: "transaction_conflict" };
      }

      const attempt = await RewardedAdAttempt.findOne({
        ticketHash: input.ticketHash,
      }).lean();
      if (attempt?.status === "redeemed") {
        return attempt.transactionId === input.transactionId
          ? { status: "duplicate" }
          : { status: "transaction_conflict" };
      }
      throw error;
    }
  } finally {
    await session.endSession();
  }
}

function generationConflict(
  generation: {
    _id: { toString(): string } | string;
    status: "processing" | "completed" | "failed" | "outcome_unknown";
    requestFingerprint: string;
  },
  requestFingerprint: string,
): IdempotencyConflictError {
  return new IdempotencyConflictError(
    String(generation._id),
    generation.status,
    generation.requestFingerprint === requestFingerprint,
  );
}

async function findGenerationByKey(userId: string, idempotencyKeyHash: string) {
  return Generation.findOne({ userId, idempotencyKeyHash }).lean();
}

export async function createUserWithWelcomeCredits(details: NewUserDetails) {
  const session = await mongoose.startSession();

  try {
    const createdUser = await session.withTransaction(async () => {
      const [user] = await User.create(
        [{ ...details, credits: WELCOME_CREDITS, profileSetupComplete: false }],
        { session },
      );
      if (!user) {
        throw new Error("User creation did not return a document.");
      }

      await CreditTransaction.create(
        [{
          userId: user._id,
          amount: WELCOME_CREDITS,
          type: "INITIAL_GRANT",
          balanceAfter: WELCOME_CREDITS,
          referenceId: String(user._id),
          description: "New-account welcome credits",
        }],
        { session },
      );

      return user;
    });

    if (!createdUser) {
      throw new Error("Welcome-credit transaction did not complete.");
    }
    return createdUser;
  } finally {
    await session.endSession();
  }
}

export async function reserveGenerationCredits(input: {
  userId: string;
  styleId: string;
  idempotencyKeyHash: string;
  requestFingerprint: string;
  creditsCost: number;
}): Promise<{ generationId: string; balanceAfter: number }> {
  const session = await mongoose.startSession();

  try {
    try {
      const reservation = await session.withTransaction(async () => {
        const existing = await Generation.findOne({
          userId: input.userId,
          idempotencyKeyHash: input.idempotencyKeyHash,
        }).session(session).lean();

        if (existing) {
          throw generationConflict(existing, input.requestFingerprint);
        }

        const user = await User.findOneAndUpdate(
          { _id: input.userId, credits: { $gte: input.creditsCost } },
          { $inc: { credits: -input.creditsCost } },
          { new: true, session },
        );

        if (!user) {
          const currentUser = await User.findById(input.userId)
            .select("credits")
            .session(session)
            .lean();
          if (!currentUser) {
            throw new UserNotFoundError();
          }
          throw new InsufficientCreditsError(
            input.creditsCost,
            Number.isFinite(currentUser.credits) ? currentUser.credits : 0,
          );
        }

        const [generation] = await Generation.create(
          [{
            userId: input.userId,
            styleId: input.styleId,
            idempotencyKeyHash: input.idempotencyKeyHash,
            requestFingerprint: input.requestFingerprint,
            creditsCost: input.creditsCost,
            status: "processing",
          }],
          { session },
        );
        if (!generation) {
          throw new Error("Generation reservation was not created.");
        }

        await CreditTransaction.create(
          [{
            userId: input.userId,
            amount: -input.creditsCost,
            type: "GENERATION",
            balanceAfter: user.credits,
            referenceId: String(generation._id),
            description: `Generation using style ${input.styleId}`,
          }],
          { session },
        );

        return {
          generationId: String(generation._id),
          balanceAfter: user.credits as number,
        };
      });

      if (!reservation) {
        throw new Error("Credit reservation transaction did not complete.");
      }
      return reservation;
    } catch (error) {
      if (error instanceof IdempotencyConflictError) {
        throw error;
      }
      if (isDuplicateKeyError(error)) {
        const existing = await findGenerationByKey(input.userId, input.idempotencyKeyHash);
        if (existing) {
          throw generationConflict(existing, input.requestFingerprint);
        }
      }
      throw error;
    }
  } finally {
    await session.endSession();
  }
}

export async function completeGeneration(generationId: string): Promise<boolean> {
  const result = await Generation.updateOne(
    { _id: generationId, status: "processing" },
    { $set: { status: "completed" } },
  );
  return result.modifiedCount === 1;
}

export async function markGenerationOutcomeUnknown(
  generationId: string,
  failureCode: string,
): Promise<boolean> {
  const result = await Generation.updateOne(
    { _id: generationId, status: "processing" },
    { $set: { status: "outcome_unknown", failureCode } },
  );
  return result.modifiedCount === 1;
}

export async function refundGeneration(
  generationId: string,
  failureCode: string,
): Promise<boolean> {
  const session: ClientSession = await mongoose.startSession();

  try {
    const refunded = await session.withTransaction(async () => {
      const generation = await Generation.findOneAndUpdate(
        { _id: generationId, status: "processing" },
        { $set: { status: "failed", failureCode } },
        { new: true, session },
      );

      if (!generation) {
        return false;
      }

      const user = await User.findByIdAndUpdate(
        generation.userId,
        { $inc: { credits: generation.creditsCost } },
        { new: true, session },
      );
      if (!user) {
        throw new UserNotFoundError();
      }

      await CreditTransaction.create(
        [{
          userId: generation.userId,
          amount: generation.creditsCost,
          type: "REFUND",
          balanceAfter: user.credits,
          referenceId: String(generation._id),
          description: "Refund for confirmed generation failure",
        }],
        { session },
      );
      return true;
    });

    return refunded === true;
  } finally {
    await session.endSession();
  }
}
