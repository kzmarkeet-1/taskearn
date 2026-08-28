import type { CryptoNetwork } from "@prisma/client";

/**
 * Exchange rails for USDT in and out.
 *
 * Three things about this design are consequences of how exchanges actually
 * work, not preferences, and each one is worth understanding before touching
 * the code below.
 *
 * 1. DEPOSITS CANNOT BE ATTRIBUTED BY ADDRESS.
 *    A gateway issues one address per payment. An exchange account has ONE
 *    deposit address per coin per network, shared by every member who ever
 *    pays you. The deposit record tells you an amount and a transaction hash;
 *    it does not tell you which member sent it. Attribution therefore happens
 *    by quoting each member a unique amount and matching on it — see
 *    `quoteUniqueAmount` in ./matching.ts, including the cases where that is
 *    not good enough.
 *
 * 2. THERE ARE NO DEPOSIT WEBHOOKS.
 *    Neither exchange pushes spot deposit events. Everything here is polled on
 *    the maintenance schedule, so a deposit is recognised within one poll
 *    interval rather than instantly. "Instant" is not a word this integration
 *    can honestly use.
 *
 * 3. A WITHDRAWAL-ENABLED API KEY IS THE KEYS TO THE ACCOUNT.
 *    If it leaks, the balance leaves. There is no undo and no chargeback. The
 *    mitigations — IP allowlist, a float account rather than the main one, a
 *    per-run ceiling — are enforced in ./index.ts and are not optional.
 */

export type ExchangeId = "binance" | "okx";

export type WithdrawRequest = {
  /** Our withdrawal id. Doubles as the exchange-side client order id. */
  withdrawalId: string;
  network: CryptoNetwork;
  address: string;
  /** Decimal string of USDT to send. Never a float. */
  amount: string;
  /** Recipient details. Some jurisdictions require these under the Travel Rule. */
  recipient: { name: string; country?: string | null };
};

export type WithdrawResult =
  | { ok: true; providerReference: string }
  | { ok: false; reason: string; retryable: boolean };

/** One completed on-chain deposit as the exchange reports it. */
export type ExchangeDeposit = {
  /** Stable per-exchange id for this credit. The idempotency anchor. */
  id: string;
  amount: string;
  network: CryptoNetwork | null;
  txHash: string | null;
  address: string | null;
  /** True only when the exchange considers the funds fully credited. */
  credited: boolean;
  at: Date;
};

/** The settlement state of a withdrawal we submitted earlier. */
export type ExchangeWithdrawalStatus = {
  providerReference: string;
  state: "PENDING" | "SENT" | "COMPLETED" | "FAILED";
  txHash: string | null;
  failureReason?: string;
};

export interface ExchangeClient {
  readonly id: ExchangeId;
  readonly name: string;
  isConfigured(): boolean;
  /** The exchange's own code for a chain, e.g. "TRX" or "USDT-TRC20". */
  networkCode(network: CryptoNetwork): string | null;
  withdraw(request: WithdrawRequest): Promise<WithdrawResult>;
  listDeposits(since: Date): Promise<ExchangeDeposit[]>;
  getWithdrawalStatus(providerReference: string): Promise<ExchangeWithdrawalStatus | null>;
  /** Spendable USDT, so a payout run can refuse before it half-empties the float. */
  availableBalance(): Promise<number | null>;
}

export const USDT = "USDT";
