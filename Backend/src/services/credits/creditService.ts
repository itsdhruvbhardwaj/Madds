import { createHash } from "node:crypto";

import mongoose, { type ClientSession } from "mongoose";

import { CreditTransaction } from "../../models/CreditTransaction.js";
import { Generation } from "../../models/Generation.js";
import { User } from "../../models/User.js";

export const WELCOME_CREDITS = 100;

export function hashIdempotencyKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function fingerprintGenerationRequest(
  styleId: string,
  images: Array<{ buffer: Buffer }>,
): string {
  const hash = createHash("sha256")
    .update(String(Buffer.byteLength(styleId)))
    .update(":")
    .update(styleId);
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

function isDuplicateKeyError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === 11000;
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
        [{ ...details, credits: WELCOME_CREDITS }],
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
