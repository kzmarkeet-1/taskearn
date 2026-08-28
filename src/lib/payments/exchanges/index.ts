import "server-only";
import { Prisma, type CryptoNetwork } from "@prisma/client";
import { prisma } from "../../prisma";
import { env } from "../../env";
import { notify } from "../../notifications";
import { recordSettlementHash, completeWithdrawal, markWithdrawalProcessing } from "../../wallet";
import { settleConfirmedDeposit } from "../index";
import { BinanceExchange } from "./binance";
import { OkxExchange } from "./okx";
import type { ExchangeClient, ExchangeId } from "./types";

export * from "./types";
export { BinanceExchange } from "./binance";
export { OkxExchange } from "./okx";

/**
 * Exchange rails, wired up.
 *
 * The single most important thing in this file is what it refuses to do:
 * nothing here sends money without a per-run ceiling, a balance check, and an
 * idempotency key that the exchange itself enforces. A double-sent withdrawal
 * is the one error in this entire codebase that cannot be corrected afterwards
 * — there is no chargeback on a settled chain transfer — so every guard is
 * belt and braces on purpose.
 */

const EXCHANGES: ExchangeClient[] = [new BinanceExchange(), new OkxExchange()];

export function getExchange(): ExchangeClient | null {
  const id = (process.env.CRYPTO_EXCHANGE ?? "").toLowerCase() as ExchangeId;
  const exchange = EXCHANGES.find((candidate) => candidate.id === id);
  return exchange && exchange.isConfigured() ? exchange : null;
}

export function exchangeStatuses() {
  return EXCHANGES.map((exchange) => ({
    id: exchange.id,
    name: exchange.name,
    configured: exchange.isConfigured(),
    selected: (process.env.CRYPTO_EXCHANGE ?? "").toLowerCase() === exchange.id,
  }));
}

// ----------------------------------------------------------------------
// Deposit attribution
// ----------------------------------------------------------------------

/**
 * Quotes an amount that identifies one member's payment.
 *
 * WHY THIS EXISTS, because it is the compromise at the heart of the exchange
 * approach and it should not be discovered later by surprise.
 *
 * A payment gateway hands out one address per payment, so attribution is
 * trivial. An exchange account has ONE USDT deposit address per chain, shared
 * by everybody. The deposit record gives an amount and a hash and no hint of
 * who sent it. So the amount itself becomes the identifier: each open deposit
 * is quoted a slightly different figure, and an incoming credit is matched
 * against it.
 *
 * WHERE THIS BREAKS, honestly:
 *   - A member who rounds the amount, or whose wallet deducts the network fee
 *     from the amount sent, will not match and needs manual reconciliation.
 *   - At high concurrency the 0.0001-step space runs out and quoting starts
 *     failing rather than risking a collision — which is the correct failure,
 *     but it is a ceiling.
 *   - Two members quoted the same figure would be indistinguishable, which is
 *     exactly why `quoteUniqueAmount` refuses rather than reusing one.
 *
 * If this platform grows past a handful of concurrent deposits, move to a
 * gateway with per-payment addresses, or to exchange sub-accounts (Binance
 * broker program, OKX sub-accounts), which do give one address per member.
 */
const MATCH_STEP = 0.0001;
const MAX_QUOTE_ATTEMPTS = 400;

export async function quoteUniqueAmount(baseUsdt: number, network: CryptoNetwork): Promise<string | null> {
  const open = await prisma.deposit.findMany({
    where: {
      method: "CRYPTO_USDT",
      network,
      status: { in: ["AWAITING_PAYMENT", "CONFIRMING"] },
      expiresAt: { gt: new Date() },
    },
    select: { cryptoAmount: true },
  });

  const taken = new Set(open.map((row) => row.cryptoAmount).filter(Boolean));

  for (let step = 0; step < MAX_QUOTE_ATTEMPTS; step += 1) {
    const candidate = (baseUsdt + step * MATCH_STEP).toFixed(6);
    if (!taken.has(candidate)) return candidate;
  }

  // Refusing beats issuing an ambiguous quote: a collision here would credit
  // one member's membership from another member's money.
  return null;
}

// ----------------------------------------------------------------------
// Deposit polling
// ----------------------------------------------------------------------

/**
 * Reconciles exchange deposits against open payments.
 *
 * Polled rather than pushed, because neither exchange sends spot deposit
 * webhooks. Run it from the maintenance schedule; a shorter interval only
 * changes how quickly a member's membership starts, never whether it does.
 */
export async function pollExchangeDeposits() {
  const exchange = getExchange();
  if (!exchange) return { polled: false as const, reason: "No exchange configured." };

  // A day back each run. Deposits are matched by idempotency, so overlapping
  // windows are free, and a wider window rescues anything a failed run missed.
  const since = new Date(Date.now() - 24 * 3600_000);
  const deposits = await exchange.listDeposits(since);

  let matched = 0;
  let unmatched = 0;

  for (const credit of deposits) {
    if (!credit.credited) continue;

    // Layer one: has this exact credit already been handled?
    try {
      await prisma.paymentWebhookEvent.create({
        data: {
          provider: `exchange:${exchange.id}`,
          eventId: credit.id,
          eventType: "deposit",
          signatureOk: true,
          payload: {
            amount: credit.amount,
            network: credit.network,
            txHash: credit.txHash,
            at: credit.at.toISOString(),
          } as Prisma.InputJsonValue,
          processedAt: new Date(),
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
      throw error;
    }

    // Layer two: which open deposit was quoted this exact figure?
    const normalised = Number(credit.amount).toFixed(6);
    const pending = await prisma.deposit.findFirst({
      where: {
        method: "CRYPTO_USDT",
        status: { in: ["AWAITING_PAYMENT", "CONFIRMING"] },
        cryptoAmount: normalised,
        ...(credit.network ? { network: credit.network } : {}),
      },
      orderBy: { createdAt: "asc" },
    });

    if (!pending) {
      // Real money that belongs to nobody we can name. It is recorded loudly
      // and left for an operator — silently discarding it would be losing a
      // member's payment.
      unmatched += 1;
      console.warn(
        `[exchange:${exchange.id}] unmatched deposit ${credit.txHash ?? credit.id} of ${credit.amount} USDT — needs manual reconciliation`,
      );
      continue;
    }

    await prisma.deposit.update({
      where: { id: pending.id },
      data: {
        txHash: credit.txHash,
        confirmations: pending.requiredConfirmations,
        providerReference: credit.id,
      },
    });

    await settleConfirmedDeposit(pending.id);
    matched += 1;
  }

  return { polled: true as const, seen: deposits.length, matched, unmatched };
}

// ----------------------------------------------------------------------
// Withdrawal dispatch
// ----------------------------------------------------------------------

/**
 * Sends approved USDT withdrawals.
 *
 * Four guards stand between an approval and a transfer, and none is decorative:
 *
 *  1. Only APPROVED rows are picked up, so a human has seen every one.
 *  2. A per-run ceiling caps the blast radius of any bug in this loop.
 *  3. The float balance is checked first, so a run cannot half-empty the
 *     account and leave later members failing for no visible reason.
 *  4. The exchange deduplicates on our withdrawal id, so even a retried
 *     dispatch cannot send twice.
 */
export async function dispatchApprovedWithdrawals() {
  const exchange = getExchange();
  if (!exchange) return { dispatched: 0, skipped: 0, reason: "No exchange configured." };

  const perRun = env().CRYPTO_MAX_PAYOUTS_PER_RUN;

  const queue = await prisma.withdrawal.findMany({
    where: { method: "CRYPTO_USDT", status: "APPROVED", txHash: null },
    orderBy: { createdAt: "asc" },
    take: perRun,
    include: { user: { select: { fullName: true, country: true } } },
  });

  if (queue.length === 0) return { dispatched: 0, skipped: 0 };

  const rate = env().CRYPTO_USDT_RATE_MINOR;
  const balance = await exchange.availableBalance();
  const required = queue.reduce((sum, row) => sum + row.netAmount / rate, 0);

  if (balance !== null && balance < required) {
    console.error(
      `[exchange:${exchange.id}] float is short: ${balance} USDT available, ${required.toFixed(6)} needed for ${queue.length} payouts`,
    );
    return { dispatched: 0, skipped: queue.length, reason: "Float balance is too low." };
  }

  let dispatched = 0;
  let skipped = 0;

  for (const withdrawal of queue) {
    if (!withdrawal.network) {
      skipped += 1;
      console.error(`[exchange] withdrawal ${withdrawal.reference} has no network; refusing to guess a chain.`);
      continue;
    }

    const amount = (withdrawal.netAmount / rate).toFixed(6);

    const result = await exchange.withdraw({
      withdrawalId: withdrawal.id,
      network: withdrawal.network,
      address: withdrawal.accountNumber,
      amount,
      recipient: { name: withdrawal.accountName, country: withdrawal.user.country },
    });

    if (!result.ok) {
      skipped += 1;
      // A retryable failure is left APPROVED so the next run picks it up. A
      // permanent one is recorded on the row rather than retried forever.
      await prisma.withdrawal.update({
        where: { id: withdrawal.id },
        data: { notes: `Payout attempt failed: ${result.reason}` },
      });
      if (!result.retryable) {
        console.error(`[exchange] withdrawal ${withdrawal.reference} rejected: ${result.reason}`);
      }
      continue;
    }

    await markWithdrawalProcessing(withdrawal.id, result.providerReference);
    await prisma.withdrawal.update({
      where: { id: withdrawal.id },
      data: { cryptoAmount: amount, cryptoAsset: "USDT" },
    });
    dispatched += 1;
  }

  return { dispatched, skipped };
}

/**
 * Follows dispatched withdrawals until the chain settles them.
 *
 * The transaction hash is written as soon as it exists, well before the
 * withdrawal is marked complete, so a member can watch their own transfer
 * confirm on a block explorer instead of waiting on a status label.
 */
export async function pollWithdrawalSettlements() {
  const exchange = getExchange();
  if (!exchange) return { checked: 0, completed: 0, failed: 0 };

  const inFlight = await prisma.withdrawal.findMany({
    where: { method: "CRYPTO_USDT", status: "PROCESSING", providerReference: { not: null } },
    take: 100,
  });

  let completed = 0;
  let failed = 0;

  for (const withdrawal of inFlight) {
    const status = await exchange.getWithdrawalStatus(withdrawal.providerReference as string);
    if (!status) continue;

    if (status.txHash && status.txHash !== withdrawal.txHash) {
      await recordSettlementHash({
        withdrawalId: withdrawal.id,
        txHash: status.txHash,
        network: withdrawal.network ?? "TRC20",
      }).catch((error) => console.error(`[exchange] could not record hash for ${withdrawal.reference}:`, error));
    }

    if (status.state === "COMPLETED") {
      await completeWithdrawal(withdrawal.id, withdrawal.providerReference ?? undefined).catch((error) =>
        console.error(`[exchange] could not complete ${withdrawal.reference}:`, error),
      );
      await notify({
        userId: withdrawal.userId,
        type: "WITHDRAWAL_COMPLETED",
        title: "Withdrawal sent",
        body: status.txHash
          ? `Your USDT is on its way. Transaction ${status.txHash.slice(0, 12)}…`
          : "Your USDT withdrawal has been sent.",
        href: "/dashboard/withdraw",
      });
      completed += 1;
    } else if (status.state === "FAILED") {
      // Deliberately not auto-refunded. A failed transfer at the exchange can
      // mean the coins never left, or that they left and the record is wrong.
      // Returning money automatically on that ambiguity is how a platform pays
      // the same withdrawal twice, so an operator decides.
      await prisma.withdrawal.update({
        where: { id: withdrawal.id },
        data: { notes: `Exchange reported failure: ${status.failureReason ?? "unknown"}. Needs operator review.` },
      });
      failed += 1;
    }
  }

  return { checked: inFlight.length, completed, failed };
}
