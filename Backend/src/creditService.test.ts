import { beforeEach, describe, expect, it, vi } from "vitest";

const creditMocks = vi.hoisted(() => {
  const session: {
    withTransaction: ReturnType<typeof vi.fn>;
    endSession: ReturnType<typeof vi.fn>;
  } = {
    withTransaction: vi.fn(),
    endSession: vi.fn(),
  };

  return {
    session,
    startSession: vi.fn(),
    userCreate: vi.fn(),
    userFindOneAndUpdate: vi.fn(),
    userFindById: vi.fn(),
    userFindByIdAndUpdate: vi.fn(),
    transactionCreate: vi.fn(),
    generationFindOne: vi.fn(),
    generationCreate: vi.fn(),
    generationFindOneAndUpdate: vi.fn(),
    generationUpdateOne: vi.fn(),
    rewardedAdAttemptCreate: vi.fn(),
    rewardedAdAttemptFindOne: vi.fn(),
    rewardedAdAttemptFindOneAndUpdate: vi.fn(),
    rewardedAdAttemptUpdateOne: vi.fn(),
  };
});

vi.mock("mongoose", () => ({
  default: {
    startSession: creditMocks.startSession,
  },
}));

vi.mock("./models/User.js", () => ({
  User: {
    create: creditMocks.userCreate,
    findOneAndUpdate: creditMocks.userFindOneAndUpdate,
    findById: creditMocks.userFindById,
    findByIdAndUpdate: creditMocks.userFindByIdAndUpdate,
  },
}));

vi.mock("./models/CreditTransaction.js", () => ({
  CreditTransaction: {
    create: creditMocks.transactionCreate,
  },
}));

vi.mock("./models/Generation.js", () => ({
  Generation: {
    findOne: creditMocks.generationFindOne,
    create: creditMocks.generationCreate,
    findOneAndUpdate: creditMocks.generationFindOneAndUpdate,
    updateOne: creditMocks.generationUpdateOne,
  },
}));

vi.mock("./models/RewardedAdAttempt.js", () => ({
  RewardedAdAttempt: {
    create: creditMocks.rewardedAdAttemptCreate,
    findOne: creditMocks.rewardedAdAttemptFindOne,
    findOneAndUpdate: creditMocks.rewardedAdAttemptFindOneAndUpdate,
    updateOne: creditMocks.rewardedAdAttemptUpdateOne,
  },
}));

import {
  createUserWithWelcomeCredits,
  createRewardedAdAttempt,
  fingerprintGenerationRequest,
  grantRewardedAdCredits,
  IdempotencyConflictError,
  InsufficientCreditsError,
  refundGeneration,
  reserveGenerationCredits,
} from "./services/credits/creditService.js";

function generationQuery(result: unknown) {
  return {
    session: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue(result),
  };
}

function currentUserQuery(result: unknown) {
  return {
    select: vi.fn().mockReturnThis(),
    session: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue(result),
  };
}

function rewardedAdAttemptQuery(result: unknown) {
  return {
    session: vi.fn().mockReturnThis(),
    lean: vi.fn().mockResolvedValue(result),
  };
}

describe("generation request fingerprint", () => {
  it("distinguishes custom prompts and uploaded image contents", () => {
    const images = [{ buffer: Buffer.from("image-a") }];

    expect(fingerprintGenerationRequest("custom-prompt", images, "paint a forest"))
      .not.toBe(fingerprintGenerationRequest("custom-prompt", images, "paint a city"));
    expect(fingerprintGenerationRequest("custom-prompt", images, "paint a forest"))
      .not.toBe(fingerprintGenerationRequest("custom-prompt", [{ buffer: Buffer.from("image-b") }], "paint a forest"));
  });
});

describe("credit accounting transactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    creditMocks.session.withTransaction.mockImplementation(
      async (operation: (session: unknown) => Promise<unknown>) => operation(creditMocks.session),
    );
    creditMocks.session.endSession.mockResolvedValue(undefined);
    creditMocks.startSession.mockResolvedValue(creditMocks.session);
    creditMocks.userCreate.mockResolvedValue([{
      _id: "user-new",
      credits: 100,
    }]);
    creditMocks.transactionCreate.mockResolvedValue([]);
    creditMocks.generationFindOne.mockImplementation(() => generationQuery(null));
    creditMocks.userFindOneAndUpdate.mockResolvedValue({ credits: 90 });
    creditMocks.userFindById.mockReturnValue(currentUserQuery({ credits: 4 }));
    creditMocks.generationCreate.mockResolvedValue([{ _id: "generation-new" }]);
    creditMocks.generationFindOneAndUpdate.mockResolvedValue({
      _id: "generation-1",
      userId: "user-1",
      creditsCost: 10,
    });
    creditMocks.userFindByIdAndUpdate.mockResolvedValue({ credits: 100 });
    creditMocks.generationUpdateOne.mockResolvedValue({ modifiedCount: 1 });
    creditMocks.rewardedAdAttemptCreate.mockResolvedValue({ _id: "attempt-new" });
    creditMocks.rewardedAdAttemptFindOne.mockImplementation(() => rewardedAdAttemptQuery(null));
    creditMocks.rewardedAdAttemptFindOneAndUpdate.mockReturnValue({
      lean: vi.fn().mockResolvedValue({ _id: "attempt-1" }),
    });
    creditMocks.rewardedAdAttemptUpdateOne.mockResolvedValue({ modifiedCount: 1 });
  });

  it("creates the new user and one initial-grant ledger record in the same transaction", async () => {
    await createUserWithWelcomeCredits({
      name: "New User",
      email: "new@example.com",
      emailVerified: false,
      isActive: true,
    });

    expect(creditMocks.userCreate).toHaveBeenCalledWith(
      [expect.objectContaining({ email: "new@example.com", credits: 100 })],
      { session: creditMocks.session },
    );
    expect(creditMocks.transactionCreate).toHaveBeenCalledWith(
      [expect.objectContaining({
        userId: "user-new",
        amount: 100,
        type: "INITIAL_GRANT",
        balanceAfter: 100,
      })],
      { session: creditMocks.session },
    );
    expect(creditMocks.session.withTransaction).toHaveBeenCalledTimes(1);
    expect(creditMocks.session.endSession).toHaveBeenCalledTimes(1);
  });

  it("uses a conditional atomic balance update and records the matching debit", async () => {
    const reservation = await reserveGenerationCredits({
      userId: "user-1",
      styleId: "professional-portrait",
      idempotencyKeyHash: "key-hash",
      requestFingerprint: "request-hash",
      creditsCost: 10,
    });

    expect(reservation).toEqual({ generationId: "generation-new", balanceAfter: 90 });
    expect(creditMocks.userFindOneAndUpdate).toHaveBeenCalledWith(
      { _id: "user-1", credits: { $gte: 10 } },
      { $inc: { credits: -10 } },
      { new: true, session: creditMocks.session },
    );
    expect(creditMocks.generationCreate).toHaveBeenCalledWith(
      [expect.objectContaining({
        idempotencyKeyHash: "key-hash",
        requestFingerprint: "request-hash",
        creditsCost: 10,
        status: "processing",
      })],
      { session: creditMocks.session },
    );
    expect(creditMocks.transactionCreate).toHaveBeenCalledWith(
      [expect.objectContaining({
        type: "GENERATION",
        amount: -10,
        balanceAfter: 90,
        referenceId: "generation-new",
      })],
      { session: creditMocks.session },
    );
  });

  it("does not reserve or create ledger entries when a concurrent spend leaves too few credits", async () => {
    creditMocks.userFindOneAndUpdate.mockResolvedValue(null);
    creditMocks.userFindById.mockReturnValue(currentUserQuery({ credits: 4 }));

    await expect(reserveGenerationCredits({
      userId: "user-1",
      styleId: "professional-portrait",
      idempotencyKeyHash: "key-hash",
      requestFingerprint: "request-hash",
      creditsCost: 10,
    })).rejects.toEqual(new InsufficientCreditsError(10, 4));

    expect(creditMocks.userFindOneAndUpdate).toHaveBeenCalledWith(
      { _id: "user-1", credits: { $gte: 10 } },
      { $inc: { credits: -10 } },
      { new: true, session: creditMocks.session },
    );
    expect(creditMocks.generationCreate).not.toHaveBeenCalled();
    expect(creditMocks.transactionCreate).not.toHaveBeenCalled();
  });

  it("allows only one simultaneous reservation when the balance covers one generation", async () => {
    let currentBalance = 10;
    let generationNumber = 0;
    creditMocks.startSession.mockImplementation(async () => {
      const session = {
        withTransaction: async (operation: (session: unknown) => Promise<unknown>) =>
          operation(session),
        endSession: vi.fn().mockResolvedValue(undefined),
      };
      return session;
    });
    creditMocks.userFindOneAndUpdate.mockImplementation(async (
      filter: { credits: { $gte: number } },
      update: { $inc: { credits: number } },
    ) => {
      await Promise.resolve();
      if (currentBalance < filter.credits.$gte) {
        return null;
      }
      currentBalance += update.$inc.credits;
      return { credits: currentBalance };
    });
    creditMocks.userFindById.mockImplementation(() =>
      currentUserQuery({ credits: currentBalance }),
    );
    creditMocks.generationCreate.mockImplementation(async () => [{
      _id: `generation-${++generationNumber}`,
    }]);

    const requests = ["key-one", "key-two"].map((idempotencyKeyHash) =>
      reserveGenerationCredits({
        userId: "user-1",
        styleId: "professional-portrait",
        idempotencyKeyHash,
        requestFingerprint: idempotencyKeyHash,
        creditsCost: 10,
      }),
    );
    const results = await Promise.allSettled(requests);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(
      (result) => result.status === "rejected" && result.reason instanceof InsufficientCreditsError,
    )).toHaveLength(1);
    expect(currentBalance).toBe(0);
    expect(creditMocks.generationCreate).toHaveBeenCalledTimes(1);
    expect(creditMocks.transactionCreate).toHaveBeenCalledTimes(1);
  });

  it("rejects an existing key without a second debit", async () => {
    creditMocks.generationFindOne.mockImplementation(() => generationQuery({
      _id: "generation-existing",
      status: "completed",
      requestFingerprint: "request-hash",
    }));

    await expect(reserveGenerationCredits({
      userId: "user-1",
      styleId: "professional-portrait",
      idempotencyKeyHash: "key-hash",
      requestFingerprint: "request-hash",
      creditsCost: 10,
    })).rejects.toEqual(
      new IdempotencyConflictError("generation-existing", "completed", true),
    );

    expect(creditMocks.userFindOneAndUpdate).not.toHaveBeenCalled();
    expect(creditMocks.generationCreate).not.toHaveBeenCalled();
    expect(creditMocks.transactionCreate).not.toHaveBeenCalled();
  });

  it("refunds a processing generation once and records the restored balance atomically", async () => {
    expect(await refundGeneration("generation-1", "PROVIDER_REJECTED")).toBe(true);
    expect(creditMocks.generationFindOneAndUpdate).toHaveBeenCalledWith(
      { _id: "generation-1", status: "processing" },
      { $set: { status: "failed", failureCode: "PROVIDER_REJECTED" } },
      { new: true, session: creditMocks.session },
    );
    expect(creditMocks.userFindByIdAndUpdate).toHaveBeenCalledWith(
      "user-1",
      { $inc: { credits: 10 } },
      { new: true, session: creditMocks.session },
    );
    expect(creditMocks.transactionCreate).toHaveBeenCalledWith(
      [expect.objectContaining({
        type: "REFUND",
        amount: 10,
        balanceAfter: 100,
        referenceId: "generation-1",
      })],
      { session: creditMocks.session },
    );

    creditMocks.generationFindOneAndUpdate.mockResolvedValueOnce(null);
    expect(await refundGeneration("generation-1", "PROVIDER_REJECTED")).toBe(false);
    expect(creditMocks.userFindByIdAndUpdate).toHaveBeenCalledTimes(1);
  });

  it("stores a hash of a random attempt ticket without granting credits", async () => {
    const expiresAt = new Date("2026-10-12T12:00:00.000Z");
    const first = await createRewardedAdAttempt("user-1", expiresAt);
    const second = await createRewardedAdAttempt("user-1", expiresAt);

    expect(first.customData).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second.customData).not.toBe(first.customData);
    expect(creditMocks.rewardedAdAttemptCreate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        userId: "user-1",
        ticketHash: expect.not.stringContaining(first.customData),
        status: "pending",
        expiresAt,
      }),
    );
    expect(creditMocks.userFindByIdAndUpdate).not.toHaveBeenCalled();
    expect(creditMocks.transactionCreate).not.toHaveBeenCalled();
  });

  it("credits a verified rewarded ad and redeems its attempt in one transaction", async () => {
    const now = new Date("2026-10-12T11:00:00.000Z");
    const attempt = {
      _id: "attempt-1",
      userId: "user-1",
      ticketHash: "ticket-hash",
      status: "pending",
      expiresAt: new Date(now.getTime() + 60_000),
    };
    creditMocks.rewardedAdAttemptFindOne.mockImplementation(
      (filter: { transactionId?: string }) =>
        rewardedAdAttemptQuery(filter.transactionId ? null : attempt),
    );
    creditMocks.rewardedAdAttemptFindOneAndUpdate.mockReturnValue({
      lean: vi.fn().mockResolvedValue(attempt),
    });
    creditMocks.userFindByIdAndUpdate.mockResolvedValue({ credits: 11 });

    await expect(grantRewardedAdCredits({
      ticketHash: "ticket-hash",
      transactionId: "a".repeat(32),
      credits: 1,
      now,
    })).resolves.toEqual({ status: "granted" });

    expect(creditMocks.rewardedAdAttemptFindOneAndUpdate).toHaveBeenCalledWith(
      {
        _id: "attempt-1",
        ticketHash: "ticket-hash",
        status: "pending",
        expiresAt: { $gt: now },
        transactionId: { $exists: false },
      },
      {
        $set: {
          status: "redeemed",
          transactionId: "a".repeat(32),
          redeemedAt: now,
        },
      },
      { new: true, session: creditMocks.session },
    );
    expect(creditMocks.userFindByIdAndUpdate).toHaveBeenCalledWith(
      "user-1",
      { $inc: { credits: 1 } },
      { new: true, session: creditMocks.session },
    );
    expect(creditMocks.transactionCreate).toHaveBeenCalledWith(
      [expect.objectContaining({
        userId: "user-1",
        amount: 1,
        type: "REWARDED_AD",
        balanceAfter: 11,
        referenceId: "a".repeat(32),
      })],
      { session: creditMocks.session },
    );
    expect(creditMocks.session.withTransaction).toHaveBeenCalledTimes(1);
  });

  it("treats an already-redeemed matching transaction as an idempotent duplicate", async () => {
    creditMocks.rewardedAdAttemptFindOne.mockImplementation(() =>
      rewardedAdAttemptQuery({
        ticketHash: "ticket-hash",
        status: "redeemed",
      }),
    );

    await expect(grantRewardedAdCredits({
      ticketHash: "ticket-hash",
      transactionId: "b".repeat(32),
      credits: 1,
    })).resolves.toEqual({ status: "duplicate" });
    expect(creditMocks.userFindByIdAndUpdate).not.toHaveBeenCalled();
    expect(creditMocks.transactionCreate).not.toHaveBeenCalled();
  });

  it("rejects a transaction ID already attached to another attempt", async () => {
    creditMocks.rewardedAdAttemptFindOne.mockImplementation(() =>
      rewardedAdAttemptQuery({
        ticketHash: "another-ticket",
        status: "redeemed",
      }),
    );

    await expect(grantRewardedAdCredits({
      ticketHash: "ticket-hash",
      transactionId: "c".repeat(32),
      credits: 1,
    })).resolves.toEqual({ status: "transaction_conflict" });
    expect(creditMocks.userFindByIdAndUpdate).not.toHaveBeenCalled();
    expect(creditMocks.transactionCreate).not.toHaveBeenCalled();
  });

  it("does not let a different AdMob transaction redeem an already-used ticket", async () => {
    creditMocks.rewardedAdAttemptFindOne.mockImplementation(
      (filter: { transactionId?: string }) =>
        rewardedAdAttemptQuery(filter.transactionId ? null : {
          ticketHash: "ticket-hash",
          status: "redeemed",
          transactionId: "f".repeat(32),
        }),
    );

    await expect(grantRewardedAdCredits({
      ticketHash: "ticket-hash",
      transactionId: "0".repeat(32),
      credits: 1,
    })).resolves.toEqual({ status: "transaction_conflict" });
    expect(creditMocks.userFindByIdAndUpdate).not.toHaveBeenCalled();
    expect(creditMocks.transactionCreate).not.toHaveBeenCalled();
  });

  it("expires stale pending attempts without crediting the user", async () => {
    const now = new Date("2026-10-12T11:00:00.000Z");
    creditMocks.rewardedAdAttemptFindOne.mockImplementation(
      (filter: { transactionId?: string }) =>
        rewardedAdAttemptQuery(filter.transactionId ? null : {
        _id: "attempt-old",
        userId: "user-1",
        status: "pending",
        expiresAt: new Date(now.getTime() - 1),
        }),
    );

    await expect(grantRewardedAdCredits({
      ticketHash: "ticket-hash",
      transactionId: "d".repeat(32),
      credits: 1,
      now,
    })).resolves.toEqual({ status: "expired" });
    expect(creditMocks.rewardedAdAttemptUpdateOne).toHaveBeenCalledWith(
      { _id: "attempt-old", status: "pending", expiresAt: { $lte: now } },
      { $set: { status: "expired" } },
      { session: creditMocks.session },
    );
    expect(creditMocks.userFindByIdAndUpdate).not.toHaveBeenCalled();
    expect(creditMocks.transactionCreate).not.toHaveBeenCalled();
  });

  it("does not report success when a rewarded-ad ledger write fails", async () => {
    const now = new Date("2026-10-12T11:00:00.000Z");
    const attempt = {
      _id: "attempt-1",
      userId: "user-1",
      status: "pending",
      expiresAt: new Date(now.getTime() + 60_000),
    };
    creditMocks.rewardedAdAttemptFindOne.mockImplementation(
      (filter: { transactionId?: string }) =>
        rewardedAdAttemptQuery(filter.transactionId ? null : attempt),
    );
    creditMocks.rewardedAdAttemptFindOneAndUpdate.mockReturnValue({
      lean: vi.fn().mockResolvedValue(attempt),
    });
    creditMocks.userFindByIdAndUpdate.mockResolvedValue({ credits: 11 });
    creditMocks.transactionCreate.mockRejectedValue(new Error("ledger unavailable"));

    await expect(grantRewardedAdCredits({
      ticketHash: "ticket-hash",
      transactionId: "e".repeat(32),
      credits: 1,
      now,
    })).rejects.toThrow("ledger unavailable");
    expect(creditMocks.session.withTransaction).toHaveBeenCalledTimes(1);
    expect(creditMocks.session.endSession).toHaveBeenCalledTimes(1);
  });
});
