import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  creditPendingReward,
  releasePendingReward,
  getBalances,
  createWithdrawal,
  refundWithdrawal,
  adminAdjustment,
  releaseMaturedRewards,
  approveWithdrawal,
  markWithdrawalProcessing,
  completeWithdrawal,
} from "@/lib/wallet";
import { seedSettings } from "@/lib/settings";
import { createTestUser, cleanupUser, prisma } from "./helpers";

let userId: string;
let adminId: string;

beforeEach(async () => {
  await seedSettings();
  const user = await createTestUser();
  const admin = await createTestUser();
  userId = user.id;
  adminId = admin.id;
});

afterEach(async () => {
  await cleanupUser(userId);
  await cleanupUser(adminId);
});

describe("reward crediting", () => {
  it("puts a reward in the pending bucket, not the available one", async () => {
    await creditPendingReward({
      userId,
      amount: 5_000,
      type: "VIDEO_REWARD",
      description: "Test reward",
      idempotencyKey: randomUUID(),
    });

    const balances = await getBalances(userId);
    expect(balances.pendingBalance).toBe(5_000);
    expect(balances.availableBalance).toBe(0);
    expect(balances.withdrawableBalance).toBe(0);
  });

  it("ignores a replayed credit with the same idempotency key", async () => {
    const key = randomUUID();
    const input = {
      userId,
      amount: 5_000,
      type: "VIDEO_REWARD" as const,
      description: "Test reward",
      idempotencyKey: key,
    };

    await creditPendingReward(input);
    const second = await creditPendingReward(input);

    expect(second).toMatchObject({ duplicate: true });

    const balances = await getBalances(userId);
    expect(balances.pendingBalance).toBe(5_000);

    const rows = await prisma.walletTransaction.count({ where: { userId, idempotencyKey: key } });
    expect(rows).toBe(1);
  });

  it("survives concurrent replays of the same credit", async () => {
    const key = randomUUID();
    const input = {
      userId,
      amount: 2_000,
      type: "SURVEY_REWARD" as const,
      description: "Concurrent reward",
      idempotencyKey: key,
    };

    // Five simultaneous attempts. The unique constraint is the real guard here;
    // the pre-check alone would let some of these through.
    await Promise.allSettled(Array.from({ length: 5 }, () => creditPendingReward(input)));

    const balances = await getBalances(userId);
    expect(balances.pendingBalance).toBe(2_000);
  });

  it("refuses a reward of zero or less", async () => {
    await expect(
      creditPendingReward({
        userId,
        amount: 0,
        type: "VIDEO_REWARD",
        description: "Nothing",
        idempotencyKey: randomUUID(),
      }),
    ).rejects.toThrow();
  });
});

describe("releasing a pending reward", () => {
  it("moves the amount from pending to available exactly once", async () => {
    const sourceKey = randomUUID();

    await creditPendingReward({
      userId,
      amount: 8_000,
      type: "VIDEO_REWARD",
      description: "Test reward",
      idempotencyKey: sourceKey,
    });

    const release = {
      userId,
      amount: 8_000,
      type: "VIDEO_REWARD" as const,
      sourceKey,
      description: "Cleared",
    };

    await releasePendingReward(release);
    const second = await releasePendingReward(release);

    expect(second).toMatchObject({ duplicate: true });

    const balances = await getBalances(userId);
    expect(balances.pendingBalance).toBe(0);
    expect(balances.availableBalance).toBe(8_000);
  });

  it("sends a referral reward to the referral bucket", async () => {
    const sourceKey = randomUUID();

    await creditPendingReward({
      userId,
      amount: 10_000,
      type: "REFERRAL_REWARD",
      description: "Referral",
      idempotencyKey: sourceKey,
    });
    await releasePendingReward({
      userId,
      amount: 10_000,
      type: "REFERRAL_REWARD",
      sourceKey,
      description: "Referral cleared",
    });

    const balances = await getBalances(userId);
    expect(balances.referralBalance).toBe(10_000);
    expect(balances.availableBalance).toBe(0);
    // Referral money is still withdrawable, just tracked separately.
    expect(balances.withdrawableBalance).toBe(10_000);
  });
});

describe("balances can never go negative", () => {
  it("refuses a withdrawal larger than the withdrawable balance", async () => {
    const sourceKey = randomUUID();
    await creditPendingReward({
      userId,
      amount: 60_000,
      type: "VIDEO_REWARD",
      description: "Reward",
      idempotencyKey: sourceKey,
    });
    await releasePendingReward({ userId, amount: 60_000, type: "VIDEO_REWARD", sourceKey, description: "Cleared" });

    await expect(
      createWithdrawal({
        userId,
        netAmountRequested: 500_000,
        method: "JAZZCASH",
        accountName: "Test User",
        accountNumber: "03001234567",
      }),
    ).rejects.toThrow();

    const balances = await getBalances(userId);
    expect(balances.availableBalance).toBe(60_000);
  });

  it("refuses an admin debit that would overdraw the wallet", async () => {
    await expect(
      adminAdjustment({
        userId,
        amount: -100_000,
        bucket: "AVAILABLE",
        reason: "Overdraw attempt",
        adminId,
        requestId: randomUUID(),
      }),
    ).rejects.toThrow();

    const balances = await getBalances(userId);
    expect(balances.availableBalance).toBe(0);
  });

  it("treats a retried admin adjustment as one movement", async () => {
    const requestId = randomUUID();
    const args = {
      userId,
      amount: 25_000,
      bucket: "AVAILABLE" as const,
      reason: "Goodwill credit",
      adminId,
      requestId,
    };

    const first = await adminAdjustment(args);
    const retry = await adminAdjustment(args);

    // The retry must return the original row, not create a second one.
    expect(retry.id).toBe(first.id);

    const balances = await getBalances(userId);
    expect(balances.availableBalance).toBe(25_000);

    const rows = await prisma.walletTransaction.count({
      where: { userId, type: "ADMIN_ADJUSTMENT" },
    });
    expect(rows).toBe(1);
  });

  it("only lets one of two simultaneous withdrawals through", async () => {
    const sourceKey = randomUUID();
    await creditPendingReward({
      userId,
      amount: 60_000,
      type: "VIDEO_REWARD",
      description: "Reward",
      idempotencyKey: sourceKey,
    });
    await releasePendingReward({ userId, amount: 60_000, type: "VIDEO_REWARD", sourceKey, description: "Cleared" });

    // Balance covers one request of 50,000 plus the fee, but not two.
    const request = () =>
      createWithdrawal({
        userId,
        netAmountRequested: 50_000,
        method: "JAZZCASH",
        accountName: "Test User",
        accountNumber: "03001234567",
      });

    const results = await Promise.allSettled([request(), request()]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");

    expect(fulfilled).toHaveLength(1);

    const balances = await getBalances(userId);
    expect(balances.withdrawableBalance).toBeGreaterThanOrEqual(0);
  });
});

describe("withdrawal refunds", () => {
  it("returns the gross amount, fee included, when a request is rejected", async () => {
    const sourceKey = randomUUID();
    await creditPendingReward({
      userId,
      amount: 100_000,
      type: "VIDEO_REWARD",
      description: "Reward",
      idempotencyKey: sourceKey,
    });
    await releasePendingReward({ userId, amount: 100_000, type: "VIDEO_REWARD", sourceKey, description: "Cleared" });

    const before = await getBalances(userId);

    const withdrawal = await createWithdrawal({
      userId,
      netAmountRequested: 50_000,
      method: "EASYPAISA",
      accountName: "Test User",
      accountNumber: "03001234567",
    });

    const during = await getBalances(userId);
    expect(during.withdrawableBalance).toBe(before.withdrawableBalance - withdrawal.grossAmount);

    await refundWithdrawal({
      id: withdrawal.id,
      status: "REJECTED",
      reason: "Account details did not match",
    });

    const after = await getBalances(userId);
    expect(after.withdrawableBalance).toBe(before.withdrawableBalance);
  });
});

describe("withdrawal state transitions", () => {
  async function fundedWithdrawal() {
    const sourceKey = randomUUID();
    await creditPendingReward({
      userId,
      amount: 200_000,
      type: "VIDEO_REWARD",
      description: "Reward",
      idempotencyKey: sourceKey,
    });
    await releasePendingReward({ userId, amount: 200_000, type: "VIDEO_REWARD", sourceKey, description: "Cleared" });

    return createWithdrawal({
      userId,
      netAmountRequested: 50_000,
      method: "JAZZCASH",
      accountName: "Test User",
      accountNumber: "03001234567",
    });
  }

  it("refuses a transition the state machine does not allow", async () => {
    const withdrawal = await fundedWithdrawal();

    // PENDING cannot jump straight to COMPLETED.
    await expect(completeWithdrawal(withdrawal.id)).rejects.toThrow();

    const row = await prisma.withdrawal.findUniqueOrThrow({ where: { id: withdrawal.id } });
    expect(row.status).toBe("PENDING");
  });

  it("counts a completed withdrawal against lifetime totals exactly once", async () => {
    const withdrawal = await fundedWithdrawal();
    await approveWithdrawal(withdrawal.id, adminId);
    await markWithdrawalProcessing(withdrawal.id);

    // Two operators confirming the same payout at the same moment. Only one
    // may land, or the lifetime figure would double-count what was paid.
    const results = await Promise.allSettled([
      completeWithdrawal(withdrawal.id, "REF-1"),
      completeWithdrawal(withdrawal.id, "REF-2"),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);

    const balances = await getBalances(userId);
    expect(balances.lifetimeWithdrawn).toBe(withdrawal.netAmount);
  });

  it("cannot refund the same withdrawal twice", async () => {
    const withdrawal = await fundedWithdrawal();
    const before = await getBalances(userId);

    const results = await Promise.allSettled([
      refundWithdrawal({ id: withdrawal.id, status: "REJECTED", reason: "Details did not match" }),
      refundWithdrawal({ id: withdrawal.id, status: "REJECTED", reason: "Details did not match" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);

    const after = await getBalances(userId);
    expect(after.withdrawableBalance).toBe(before.withdrawableBalance + withdrawal.grossAmount);
  });

  it("cannot complete a withdrawal that was already rejected", async () => {
    const withdrawal = await fundedWithdrawal();
    await refundWithdrawal({ id: withdrawal.id, status: "REJECTED", reason: "Returned" });

    await expect(completeWithdrawal(withdrawal.id)).rejects.toThrow();
  });
});

describe("maturing pending rewards", () => {
  /** Credits a reward and backdates it so it counts as matured. */
  async function maturedReward(amount: number) {
    const key = randomUUID();
    await creditPendingReward({
      userId,
      amount,
      type: "VIDEO_REWARD",
      description: "Matured reward",
      idempotencyKey: key,
    });
    await prisma.walletTransaction.update({
      where: { idempotencyKey: key },
      data: { createdAt: new Date(Date.now() - 30 * 24 * 3600_000) },
    });
    return key;
  }

  it("does not rescan rewards it has already released", async () => {
    await maturedReward(1_000);
    await maturedReward(2_000);

    const first = await releaseMaturedRewards(userId);
    expect(first.released).toBe(2);
    expect(first.scanned).toBe(2);

    // Second pass: both are released, so there is nothing left to look at.
    // If already-released rows were still being returned here, a large enough
    // backlog of them would crowd new rewards out of the batch window and
    // release would silently stall.
    const second = await releaseMaturedRewards(userId);
    expect(second.scanned).toBe(0);
    expect(second.released).toBe(0);

    // A newly matured reward is still picked up afterwards.
    await maturedReward(3_000);
    const third = await releaseMaturedRewards(userId);
    expect(third.scanned).toBe(1);
    expect(third.released).toBe(1);

    const balances = await getBalances(userId);
    expect(balances.availableBalance).toBe(6_000);
    expect(balances.pendingBalance).toBe(0);
  });

  it("leaves rewards that are still inside the hold period alone", async () => {
    await creditPendingReward({
      userId,
      amount: 4_000,
      type: "VIDEO_REWARD",
      description: "Fresh reward",
      idempotencyKey: randomUUID(),
    });

    const result = await releaseMaturedRewards(userId);
    expect(result.released).toBe(0);

    const balances = await getBalances(userId);
    expect(balances.pendingBalance).toBe(4_000);
    expect(balances.availableBalance).toBe(0);
  });
});

describe("the ledger is append-only", () => {
  it("records a row for every movement, each carrying the balance it left behind", async () => {
    const sourceKey = randomUUID();
    await creditPendingReward({
      userId,
      amount: 7_000,
      type: "VIDEO_REWARD",
      description: "Reward",
      idempotencyKey: sourceKey,
    });
    await releasePendingReward({ userId, amount: 7_000, type: "VIDEO_REWARD", sourceKey, description: "Cleared" });

    const rows = await prisma.walletTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });

    // Credit into pending, debit out of pending, credit into available.
    expect(rows.length).toBeGreaterThanOrEqual(3);
    for (const row of rows) {
      expect(row.balanceAfter).toBeGreaterThanOrEqual(0);
    }
  });
});
