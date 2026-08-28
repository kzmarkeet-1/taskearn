import "server-only";
import {
  Prisma,
  type BalanceBucket,
  type PayoutMethod,
  type TransactionType,
  type WithdrawalStatus,
} from "@prisma/client";
import type { CryptoNetwork } from "@prisma/client";
import { prisma, type Tx } from "./prisma";
import { AppError, Err } from "./errors";
import { randomReference } from "./crypto";
import { getSettings } from "./settings";
import { getEntitlements } from "./tiers";

/**
 * Wallet service — the only sanctioned way to move money.
 *
 * Rules enforced here:
 *  1. Every balance change writes a WalletTransaction row.
 *  2. Every write happens inside a database transaction.
 *  3. Every write carries an idempotencyKey with a unique index behind it, so a
 *     replayed webhook or a double-clicked button can never credit twice.
 *  4. Debits use conditional updateMany guards, so two concurrent requests can
 *     never drive a balance below zero.
 *  5. Existing rows are never edited or deleted. Corrections are new rows.
 */

const BUCKET_FIELD = {
  AVAILABLE: "availableBalance",
  PENDING: "pendingBalance",
  BONUS: "bonusBalance",
  REFERRAL: "referralBalance",
} as const satisfies Record<BalanceBucket, string>;

/** Buckets a withdrawal may draw from, in draw order. */
export const WITHDRAWABLE_BUCKETS: BalanceBucket[] = ["AVAILABLE", "BONUS", "REFERRAL"];

export type WalletBalances = {
  availableBalance: number;
  pendingBalance: number;
  bonusBalance: number;
  referralBalance: number;
  withdrawableBalance: number;
  lifetimeEarned: number;
  lifetimeWithdrawn: number;
  currency: string;
};

export function withdrawableTotal(w: {
  availableBalance: number;
  bonusBalance: number;
  referralBalance: number;
}) {
  return w.availableBalance + w.bonusBalance + w.referralBalance;
}

export async function getOrCreateWallet(userId: string, client: Tx = prisma) {
  const existing = await client.wallet.findUnique({ where: { userId } });
  if (existing) return existing;
  return client.wallet.create({ data: { userId } });
}

export async function getBalances(userId: string): Promise<WalletBalances> {
  const wallet = await getOrCreateWallet(userId);
  return {
    availableBalance: wallet.availableBalance,
    pendingBalance: wallet.pendingBalance,
    bonusBalance: wallet.bonusBalance,
    referralBalance: wallet.referralBalance,
    withdrawableBalance: withdrawableTotal(wallet),
    lifetimeEarned: wallet.lifetimeEarned,
    lifetimeWithdrawn: wallet.lifetimeWithdrawn,
    currency: wallet.currency,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function alreadyApplied(key: string): Promise<boolean> {
  const found = await prisma.walletTransaction.findUnique({
    where: { idempotencyKey: key },
    select: { id: true },
  });
  return Boolean(found);
}

type LedgerWrite = {
  walletId: string;
  userId: string;
  type: TransactionType;
  bucket: BalanceBucket;
  /** Signed: positive credits the bucket, negative debits it. */
  amount: number;
  description: string;
  idempotencyKey: string;
  referenceType?: string;
  referenceId?: string;
  /** On-chain hash when this movement settled over a blockchain. */
  externalTxHash?: string;
  externalNetwork?: CryptoNetwork;
  metadata?: Prisma.InputJsonValue;
};

/**
 * Applies one signed movement to one bucket and records it.
 * Debits are guarded so the bucket cannot go negative.
 */
async function applyMovement(tx: Tx, write: LedgerWrite) {
  const field = BUCKET_FIELD[write.bucket];

  if (write.amount === 0) throw Err.invalid("A ledger movement cannot be zero.");

  if (write.amount < 0) {
    const required = Math.abs(write.amount);
    const guarded = await tx.wallet.updateMany({
      where: { id: write.walletId, [field]: { gte: required } } as Prisma.WalletWhereInput,
      data: { [field]: { decrement: required } } as Prisma.WalletUpdateManyMutationInput,
    });
    if (guarded.count === 0) {
      throw new AppError(
        "That balance is too low to cover this amount.",
        409,
        "INSUFFICIENT_FUNDS",
      );
    }
  } else {
    await tx.wallet.update({
      where: { id: write.walletId },
      data: { [field]: { increment: write.amount } } as Prisma.WalletUpdateInput,
    });
  }

  const wallet = await tx.wallet.findUniqueOrThrow({ where: { id: write.walletId } });
  const balanceAfter = wallet[field as keyof typeof wallet] as number;

  return tx.walletTransaction.create({
    data: {
      walletId: write.walletId,
      userId: write.userId,
      type: write.type,
      bucket: write.bucket,
      amount: write.amount,
      balanceAfter,
      description: write.description,
      idempotencyKey: write.idempotencyKey,
      referenceType: write.referenceType,
      referenceId: write.referenceId,
      externalTxHash: write.externalTxHash,
      externalNetwork: write.externalNetwork,
      metadata: write.metadata,
    },
  });
}

/** Debits `amount` across the withdrawable buckets in draw order. */
async function debitWaterfall(
  tx: Tx,
  args: {
    walletId: string;
    userId: string;
    amount: number;
    type: TransactionType;
    description: string;
    keyPrefix: string;
    referenceType?: string;
    referenceId?: string;
  },
) {
  const opening = await tx.wallet.findUniqueOrThrow({ where: { id: args.walletId } });
  if (withdrawableTotal(opening) < args.amount) {
    throw new AppError("Your withdrawable balance is too low for this amount.", 409, "INSUFFICIENT_FUNDS");
  }

  let remaining = args.amount;
  const rows = [];
  for (const bucket of WITHDRAWABLE_BUCKETS) {
    if (remaining <= 0) break;
    // Re-read before each bucket rather than working from the opening snapshot.
    // Earlier movements in this same transaction have already changed the row,
    // so a stale figure here would ask for more than the bucket now holds and
    // trip the guard for no reason.
    const current = await tx.wallet.findUniqueOrThrow({ where: { id: args.walletId } });
    const available = current[BUCKET_FIELD[bucket] as keyof typeof current] as number;
    const take = Math.min(available, remaining);
    if (take <= 0) continue;
    rows.push(
      await applyMovement(tx, {
        walletId: args.walletId,
        userId: args.userId,
        type: args.type,
        bucket,
        amount: -take,
        description: args.description,
        idempotencyKey: `${args.keyPrefix}:${bucket.toLowerCase()}`,
        referenceType: args.referenceType,
        referenceId: args.referenceId,
      }),
    );
    remaining -= take;
  }

  if (remaining > 0) {
    throw new AppError("Your withdrawable balance is too low for this amount.", 409, "INSUFFICIENT_FUNDS");
  }
  return rows;
}

// ----------------------------------------------------------------------
// Public operations
// ----------------------------------------------------------------------

export type RewardInput = {
  userId: string;
  amount: number;
  type: Extract<TransactionType, "VIDEO_REWARD" | "SURVEY_REWARD" | "REFERRAL_REWARD" | "BONUS">;
  description: string;
  idempotencyKey: string;
  referenceType?: string;
  referenceId?: string;
  metadata?: Prisma.InputJsonValue;
};

/** Credits a reward into PENDING, where it waits out the verification cooldown. */
export async function creditPendingReward(input: RewardInput) {
  if (input.amount <= 0) throw Err.invalid("A reward must be greater than zero.");
  if (await alreadyApplied(input.idempotencyKey)) return { duplicate: true as const };

  try {
    const transaction = await prisma.$transaction(async (tx) => {
      const wallet = await getOrCreateWallet(input.userId, tx);
      const row = await applyMovement(tx, {
        walletId: wallet.id,
        userId: input.userId,
        type: input.type,
        bucket: "PENDING",
        amount: input.amount,
        description: input.description,
        idempotencyKey: input.idempotencyKey,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        metadata: input.metadata,
      });
      await tx.wallet.update({
        where: { id: wallet.id },
        data: { lifetimeEarned: { increment: input.amount } },
      });
      return row;
    });
    return { duplicate: false as const, transaction };
  } catch (error) {
    if (isUniqueViolation(error)) return { duplicate: true as const };
    throw error;
  }
}

/**
 * Types that can legitimately sit in PENDING and later mature.
 *
 * Rewards get here through `creditPendingReward`. An admin adjustment can also
 * be placed in PENDING deliberately, and should mature on the same schedule
 * rather than being stranded there.
 */
export type ReleasableType = Extract<
  TransactionType,
  "VIDEO_REWARD" | "SURVEY_REWARD" | "REFERRAL_REWARD" | "BONUS" | "ADMIN_ADJUSTMENT"
>;

const RELEASABLE_TYPES: ReleasableType[] = [
  "VIDEO_REWARD",
  "SURVEY_REWARD",
  "REFERRAL_REWARD",
  "BONUS",
  "ADMIN_ADJUSTMENT",
];

function isReleasable(type: TransactionType): type is ReleasableType {
  return (RELEASABLE_TYPES as TransactionType[]).includes(type);
}

/**
 * Moves a pending reward into its spendable bucket once verified.
 * Writes two rows: the pending debit and the spendable credit.
 */
export async function releasePendingReward(args: {
  userId: string;
  amount: number;
  type: ReleasableType;
  sourceKey: string;
  targetBucket?: BalanceBucket;
  description: string;
  referenceType?: string;
  referenceId?: string;
}) {
  const releaseKey = `${args.sourceKey}:release`;
  if (await alreadyApplied(releaseKey)) return { duplicate: true as const };

  const target: BalanceBucket =
    args.targetBucket ?? (args.type === "REFERRAL_REWARD" ? "REFERRAL" : args.type === "BONUS" ? "BONUS" : "AVAILABLE");

  try {
    await prisma.$transaction(async (tx) => {
      const wallet = await getOrCreateWallet(args.userId, tx);
      await applyMovement(tx, {
        walletId: wallet.id,
        userId: args.userId,
        type: args.type,
        bucket: "PENDING",
        amount: -args.amount,
        description: `${args.description} — cleared from pending`,
        idempotencyKey: `${releaseKey}:pending`,
        referenceType: args.referenceType,
        referenceId: args.referenceId,
      });
      await applyMovement(tx, {
        walletId: wallet.id,
        userId: args.userId,
        type: args.type,
        bucket: target,
        amount: args.amount,
        description: args.description,
        idempotencyKey: releaseKey,
        referenceType: args.referenceType,
        referenceId: args.referenceId,
      });
    });
    return { duplicate: false as const };
  } catch (error) {
    if (isUniqueViolation(error)) return { duplicate: true as const };
    throw error;
  }
}

type MaturedRow = {
  id: string;
  userId: string;
  amount: number;
  type: TransactionType;
  idempotencyKey: string;
  description: string;
  referenceType: string | null;
  referenceId: string | null;
};

const RELEASE_BATCH = 500;

/**
 * Releases every pending reward whose cooldown has elapsed. Safe to run repeatedly.
 *
 * The `NOT EXISTS` clause is load-bearing, not an optimisation. Filtering only
 * on bucket and age would return rewards that were released long ago, and once
 * more than one batch of those had accumulated the window would be permanently
 * full of them — new rewards would never reach the front of the queue and would
 * silently stop clearing. Excluding released rows in SQL keeps the batch made
 * entirely of real work.
 */
export async function releaseMaturedRewards(userId?: string) {
  const settings = await getSettings();
  const cutoff = new Date(Date.now() - settings.pendingRewardCooldown * 60_000);
  const scope = userId ?? null;

  const pending = await prisma.$queryRaw<MaturedRow[]>`
    SELECT t."id", t."userId", t."amount", t."type", t."idempotencyKey",
           t."description", t."referenceType", t."referenceId"
    FROM wallet_transactions t
    WHERE t."bucket"::text = 'PENDING'
      AND t."amount" > 0
      AND t."createdAt" <= ${cutoff}
      AND (${scope}::uuid IS NULL OR t."userId" = ${scope}::uuid)
      AND NOT EXISTS (
        SELECT 1 FROM wallet_transactions r
        WHERE r."idempotencyKey" = t."idempotencyKey" || ':release'
      )
    ORDER BY t."createdAt" ASC
    LIMIT ${RELEASE_BATCH}
  `;

  let released = 0;
  let failed = 0;

  for (const row of pending) {
    if (!isReleasable(row.type)) {
      // A positive PENDING row of any other type is not something this job
      // knows how to mature. Skipping loudly beats guessing.
      console.warn(`[wallet] pending row ${row.id} has non-releasable type ${row.type}; skipped`);
      continue;
    }

    try {
      const result = await releasePendingReward({
        userId: row.userId,
        amount: row.amount,
        type: row.type,
        sourceKey: row.idempotencyKey,
        description: row.description,
        referenceType: row.referenceType ?? undefined,
        referenceId: row.referenceId ?? undefined,
      });
      if (!result.duplicate) released += 1;
    } catch (error) {
      // One reward that cannot be released must not stop the rest of the batch,
      // but it must not vanish either — a swallowed error here looks exactly
      // like money quietly failing to arrive.
      failed += 1;
      console.error(`[wallet] failed to release pending row ${row.id}:`, error);
    }
  }

  return { released, failed, scanned: pending.length, more: pending.length === RELEASE_BATCH };
}

export async function creditReferralReward(input: Omit<RewardInput, "type">) {
  return creditPendingReward({ ...input, type: "REFERRAL_REWARD" });
}

export async function creditBonus(input: Omit<RewardInput, "type">) {
  return creditPendingReward({ ...input, type: "BONUS" });
}

/**
 * Reverses a reward that a provider later invalidated. Takes the money back
 * from PENDING first, then from the spendable buckets. Never edits history.
 */
export async function reverseReward(args: {
  userId: string;
  amount: number;
  description: string;
  idempotencyKey: string;
  referenceType?: string;
  referenceId?: string;
}) {
  if (await alreadyApplied(args.idempotencyKey)) return { duplicate: true as const };

  try {
    await prisma.$transaction(async (tx) => {
      const wallet = await getOrCreateWallet(args.userId, tx);
      let remaining = args.amount;
      const order: BalanceBucket[] = ["PENDING", "AVAILABLE", "BONUS", "REFERRAL"];

      for (const bucket of order) {
        if (remaining <= 0) break;
        const current = await tx.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
        const balance = current[BUCKET_FIELD[bucket] as keyof typeof current] as number;
        const take = Math.min(balance, remaining);
        if (take <= 0) continue;
        await applyMovement(tx, {
          walletId: wallet.id,
          userId: args.userId,
          type: "REVERSAL",
          bucket,
          amount: -take,
          description: args.description,
          idempotencyKey: remaining === args.amount ? args.idempotencyKey : `${args.idempotencyKey}:${bucket.toLowerCase()}`,
          referenceType: args.referenceType,
          referenceId: args.referenceId,
        });
        remaining -= take;
      }
      // A shortfall is recorded rather than forced — balances never go negative.
      if (remaining > 0) {
        await tx.fraudEvent.create({
          data: {
            userId: args.userId,
            type: "UNUSUAL_ACCOUNT_ACTIVITY",
            level: "HIGH",
            score: 40,
            summary: "Reversal could not be fully recovered from the wallet.",
            details: { requested: args.amount, unrecovered: remaining, reference: args.referenceId },
          },
        });
      }
    });
    return { duplicate: false as const };
  } catch (error) {
    if (isUniqueViolation(error)) return { duplicate: true as const };
    throw error;
  }
}

/**
 * Records a manual correction.
 *
 * `requestId` must come from the caller and identify one submission attempt.
 * A timestamp generated in here would make every retry a fresh adjustment,
 * which is the opposite of what an idempotency key is for — a dropped response
 * followed by a retry would move the money twice.
 */
export async function adminAdjustment(args: {
  userId: string;
  amount: number; // signed
  bucket: BalanceBucket;
  reason: string;
  adminId: string;
  requestId: string;
}) {
  if (args.amount === 0) throw Err.invalid("An adjustment of zero does nothing.");

  const key = `admin-adjust:${args.requestId}`;

  const existing = await prisma.walletTransaction.findUnique({ where: { idempotencyKey: key } });
  if (existing) return existing;

  try {
    return await prisma.$transaction(async (tx) => {
      const wallet = await getOrCreateWallet(args.userId, tx);
      return applyMovement(tx, {
        walletId: wallet.id,
        userId: args.userId,
        type: "ADMIN_ADJUSTMENT",
        bucket: args.bucket,
        amount: args.amount,
        description: args.reason,
        idempotencyKey: key,
        referenceType: "admin",
        referenceId: args.adminId,
      });
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      // Two operators submitted the same attempt at once; the first one won.
      return prisma.walletTransaction.findUniqueOrThrow({ where: { idempotencyKey: key } });
    }
    throw error;
  }
}

// ----------------------------------------------------------------------
// Withdrawals
// ----------------------------------------------------------------------

export type CreateWithdrawalInput = {
  userId: string;
  netAmountRequested: number; // amount the user typed
  method: PayoutMethod;
  accountName: string;
  accountNumber: string;
  bankName?: string;
  /** Required for CRYPTO_USDT — the chain the address lives on. */
  network?: CryptoNetwork;
};

/**
 * Debits the withdrawable balance immediately so the same funds cannot be
 * requested twice, and opens a PENDING withdrawal for admin review.
 */
export async function createWithdrawal(input: CreateWithdrawalInput) {
  const settings = await getSettings();
  const net = input.netAmountRequested;

  if (net < settings.minimumWithdrawal) {
    throw Err.invalid(`The smallest withdrawal is ${settings.minimumWithdrawal / 100} PKR.`);
  }
  if (net > settings.maximumWithdrawal) {
    throw Err.invalid(`The largest single withdrawal is ${settings.maximumWithdrawal / 100} PKR.`);
  }

  // Paid memberships discount the flat withdrawal fee. The discount is read
  // from the member's live entitlements rather than from the tier column, so a
  // lapsed membership stops discounting the moment it lapses.
  const entitlements = await getEntitlements(input.userId);
  const discount = Math.floor((settings.withdrawalFee * entitlements.withdrawalFeeDiscountBps) / 10_000);
  const fee = Math.max(0, settings.withdrawalFee - discount);
  const gross = net + fee;

  if (input.method === "CRYPTO_USDT" && !input.network) {
    throw Err.invalid("Choose the network for your USDT address. Coins sent on the wrong chain cannot be recovered.");
  }

  const since = new Date(Date.now() - 24 * 3600_000);
  const todayTotal = await prisma.withdrawal.aggregate({
    where: {
      userId: input.userId,
      createdAt: { gte: since },
      status: { notIn: ["REJECTED", "CANCELLED"] },
    },
    _sum: { grossAmount: true },
  });
  if ((todayTotal._sum.grossAmount ?? 0) + gross > settings.dailyWithdrawalLimit) {
    throw Err.invalid("This would pass your daily withdrawal limit. Try again tomorrow.");
  }

  const reference = randomReference("WD");

  return prisma.$transaction(async (tx) => {
    const wallet = await getOrCreateWallet(input.userId, tx);

    const withdrawal = await tx.withdrawal.create({
      data: {
        userId: input.userId,
        method: input.method,
        accountName: input.accountName,
        accountNumber: input.accountNumber,
        bankName: input.bankName,
        network: input.network ?? null,
        cryptoAsset: input.method === "CRYPTO_USDT" ? "USDT" : null,
        grossAmount: gross,
        fee,
        netAmount: net,
        reference,
        status: "PENDING",
      },
    });

    await debitWaterfall(tx, {
      walletId: wallet.id,
      userId: input.userId,
      amount: net,
      type: "WITHDRAWAL",
      description: `Withdrawal ${reference}`,
      keyPrefix: `withdrawal:${withdrawal.id}:net`,
      referenceType: "withdrawal",
      referenceId: withdrawal.id,
    });

    if (fee > 0) {
      await debitWaterfall(tx, {
        walletId: wallet.id,
        userId: input.userId,
        amount: fee,
        type: "WITHDRAWAL_FEE",
        description: `Withdrawal fee ${reference}`,
        keyPrefix: `withdrawal:${withdrawal.id}:fee`,
        referenceType: "withdrawal",
        referenceId: withdrawal.id,
      });
    }

    return withdrawal;
  });
}

const ALLOWED_TRANSITIONS: Record<WithdrawalStatus, WithdrawalStatus[]> = {
  PENDING: ["UNDER_REVIEW", "APPROVED", "REJECTED", "CANCELLED"],
  UNDER_REVIEW: ["APPROVED", "REJECTED"],
  APPROVED: ["PROCESSING", "REJECTED"],
  PROCESSING: ["COMPLETED", "REJECTED"],
  COMPLETED: [],
  REJECTED: [],
  CANCELLED: [],
};

export function canTransition(from: WithdrawalStatus, to: WithdrawalStatus) {
  return (ALLOWED_TRANSITIONS[from] ?? []).includes(to);
}

/** Statuses that may legally precede `to`. Used to build the update guard. */
function sourcesFor(to: WithdrawalStatus): WithdrawalStatus[] {
  return (Object.keys(ALLOWED_TRANSITIONS) as WithdrawalStatus[]).filter((from) =>
    ALLOWED_TRANSITIONS[from].includes(to),
  );
}

/**
 * Moves a withdrawal to `to` only if it is still in a status that allows it.
 *
 * The status test is part of the UPDATE rather than a separate read, so two
 * operators clicking at the same moment cannot both pass the check and both
 * apply the change. A read followed by an update would let that happen, and for
 * `COMPLETED` it would double-count what the member has been paid.
 */
async function transitionWithdrawal(
  client: Tx,
  args: { id: string; to: WithdrawalStatus; data?: Prisma.WithdrawalUpdateManyMutationInput },
) {
  const result = await client.withdrawal.updateMany({
    where: { id: args.id, status: { in: sourcesFor(args.to) } },
    data: { status: args.to, ...args.data },
  });

  if (result.count === 0) {
    const current = await client.withdrawal.findUnique({ where: { id: args.id }, select: { status: true } });
    if (!current) throw Err.notFound("That withdrawal no longer exists.");
    throw Err.conflict(`A ${current.status.toLowerCase()} withdrawal cannot become ${args.to.toLowerCase()}.`);
  }

  return client.withdrawal.findUniqueOrThrow({ where: { id: args.id } });
}

export async function approveWithdrawal(id: string, adminId: string) {
  return transitionWithdrawal(prisma, {
    id,
    to: "APPROVED",
    data: { reviewedById: adminId, reviewedAt: new Date() },
  });
}

export async function markWithdrawalProcessing(id: string, providerReference?: string) {
  return transitionWithdrawal(prisma, {
    id,
    to: "PROCESSING",
    data: { processedAt: new Date(), ...(providerReference ? { providerReference } : {}) },
  });
}

/**
 * Attaches on-chain settlement evidence to a withdrawal.
 *
 * Separate from `completeWithdrawal` on purpose: a hash exists as soon as the
 * transfer is broadcast, which is well before it is final. Writing the hash
 * early lets an operator and the member both watch it confirm; marking the
 * withdrawal COMPLETED is a separate decision made once it has.
 */
export async function recordSettlementHash(args: {
  withdrawalId: string;
  txHash: string;
  network: CryptoNetwork;
  confirmations?: number;
}) {
  const withdrawal = await prisma.withdrawal.findUnique({ where: { id: args.withdrawalId } });
  if (!withdrawal) throw Err.notFound("That withdrawal no longer exists.");

  // A second, different hash on one withdrawal means the money may have gone
  // out twice. Refusing here beats overwriting the evidence of it.
  if (withdrawal.txHash && withdrawal.txHash !== args.txHash) {
    throw Err.conflict("This withdrawal already carries a different transaction hash.");
  }

  const updated = await prisma.withdrawal.update({
    where: { id: args.withdrawalId },
    data: {
      txHash: args.txHash,
      network: args.network,
      confirmations: args.confirmations ?? withdrawal.confirmations,
    },
  });

  // Mirror it onto the ledger rows for this withdrawal so a transaction export
  // carries the hash without a join.
  await prisma.walletTransaction.updateMany({
    where: { referenceType: "withdrawal", referenceId: args.withdrawalId },
    data: { externalTxHash: args.txHash, externalNetwork: args.network },
  });

  return updated;
}

/**
 * Records a membership fee paid from the wallet.
 *
 * This is a debit and only ever a debit. Buying a tier moves money out of the
 * member's balance in exchange for a higher daily limit; nothing is credited
 * back, now or later. If this function ever grows a credit path, the tier has
 * stopped being a subscription — see the invariants in src/lib/tiers.ts.
 */
export async function debitTierPurchase(args: {
  userId: string;
  amount: number;
  tier: string;
  subscriptionReference: string;
}) {
  if (args.amount <= 0) throw Err.invalid("A membership fee must be greater than zero.");

  const key = `tier:${args.subscriptionReference}`;

  // `debitWaterfall` suffixes the key per bucket, so the bare key never exists
  // as an idempotencyKey. The reference pair is what identifies this purchase.
  const existing = await prisma.walletTransaction.findFirst({
    where: { referenceType: "tier", referenceId: args.subscriptionReference },
    select: { id: true },
  });
  if (existing) return { duplicate: true as const };

  try {
    await prisma.$transaction(async (tx) => {
      const wallet = await getOrCreateWallet(args.userId, tx);
      await debitWaterfall(tx, {
        walletId: wallet.id,
        userId: args.userId,
        amount: args.amount,
        type: "TIER_PURCHASE",
        description: `${args.tier} membership`,
        keyPrefix: key,
        referenceType: "tier",
        referenceId: args.subscriptionReference,
      });
    });
    return { duplicate: false as const };
  } catch (error) {
    if (isUniqueViolation(error)) return { duplicate: true as const };
    throw error;
  }
}

export async function completeWithdrawal(id: string, providerReference?: string) {
  return prisma.$transaction(async (tx) => {
    const updated = await transitionWithdrawal(tx, {
      id,
      to: "COMPLETED",
      data: { completedAt: new Date(), ...(providerReference ? { providerReference } : {}) },
    });

    // Reached only by the one caller whose guarded update actually landed, so
    // the lifetime figure is incremented exactly once.
    const wallet = await getOrCreateWallet(updated.userId, tx);
    await tx.wallet.update({
      where: { id: wallet.id },
      data: { lifetimeWithdrawn: { increment: updated.netAmount } },
    });

    return updated;
  });
}

/** Rejecting or cancelling returns the full gross amount to the available bucket. */
export async function refundWithdrawal(args: {
  id: string;
  status: "REJECTED" | "CANCELLED";
  reason: string;
  actorId?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const withdrawal = await transitionWithdrawal(tx, {
      id: args.id,
      to: args.status,
      data: {
        rejectionReason: args.reason,
        reviewedById: args.actorId,
        reviewedAt: new Date(),
      },
    });

    const wallet = await getOrCreateWallet(withdrawal.userId, tx);
    await applyMovement(tx, {
      walletId: wallet.id,
      userId: withdrawal.userId,
      type: "REVERSAL",
      bucket: "AVAILABLE",
      amount: withdrawal.grossAmount,
      description: `Withdrawal ${withdrawal.reference} returned — ${args.reason}`,
      // The unique index behind this key is a second, independent guard: even
      // if a status race somehow got through, the money can only come back once.
      idempotencyKey: `withdrawal:${withdrawal.id}:refund`,
      referenceType: "withdrawal",
      referenceId: withdrawal.id,
    });

    return withdrawal;
  });
}

/** Total money owed to users. Pending withdrawals are already debited, so they are listed separately. */
export async function pendingLiabilities() {
  const wallets = await prisma.wallet.aggregate({
    _sum: { availableBalance: true, pendingBalance: true, bonusBalance: true, referralBalance: true },
  });
  const inFlight = await prisma.withdrawal.aggregate({
    where: { status: { in: ["PENDING", "UNDER_REVIEW", "APPROVED", "PROCESSING"] } },
    _sum: { netAmount: true },
  });
  const sum = wallets._sum;
  return {
    userBalances:
      (sum.availableBalance ?? 0) + (sum.pendingBalance ?? 0) + (sum.bonusBalance ?? 0) + (sum.referralBalance ?? 0),
    availableBalances: sum.availableBalance ?? 0,
    pendingBalances: sum.pendingBalance ?? 0,
    withdrawalsInFlight: inFlight._sum.netAmount ?? 0,
  };
}
