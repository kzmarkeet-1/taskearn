import "server-only";
import type { CryptoNetwork, PayoutMethod } from "@prisma/client";
import { allowedNetworks } from "../payments";
import { stripePayoutsEnabled } from "../payments/stripe";
import { getExchange } from "../payments/exchanges";
import { env } from "../env";

/**
 * Payout provider contract.
 *
 * Nothing here simulates a transfer. Until real merchant credentials exist,
 * every adapter reports itself unconfigured and withdrawals stay in manual
 * admin processing, which is the honest state of the MVP.
 */

export type PayoutRequest = {
  withdrawalId: string;
  reference: string;
  method: PayoutMethod;
  accountName: string;
  /** Mobile number, IBAN, wallet address or Stripe account id, per method. */
  accountNumber: string;
  bankName?: string | null;
  /** Set for CRYPTO_USDT. Sending USDT to the wrong chain destroys it. */
  network?: CryptoNetwork | null;
  /** Minor units the recipient should receive. */
  netAmount: number;
};

export type PayoutResult =
  | {
      ok: true;
      providerReference: string;
      status: "PROCESSING" | "COMPLETED";
      /** On-chain hash, when the rail is a blockchain. */
      txHash?: string;
      network?: CryptoNetwork;
    }
  | { ok: false; reason: string; retryable: boolean };

export interface PayoutProvider {
  readonly method: PayoutMethod;
  readonly name: string;
  isConfigured(): boolean;
  send(request: PayoutRequest): Promise<PayoutResult>;
}

class JazzCashProvider implements PayoutProvider {
  readonly method = "JAZZCASH" as const;
  readonly name = "JazzCash";
  isConfigured() {
    return Boolean(process.env.JAZZCASH_API_KEY && process.env.JAZZCASH_MERCHANT_ID);
  }
  async send(_request: PayoutRequest): Promise<PayoutResult> {
    if (!this.isConfigured()) {
      return { ok: false, reason: "JazzCash disbursement is not configured.", retryable: false };
    }
    // Call the JazzCash disbursement API here and return its reference.
    return { ok: false, reason: "JazzCash disbursement is not implemented yet.", retryable: false };
  }
}

class EasypaisaProvider implements PayoutProvider {
  readonly method = "EASYPAISA" as const;
  readonly name = "Easypaisa";
  isConfigured() {
    return Boolean(process.env.EASYPAISA_API_KEY && process.env.EASYPAISA_MERCHANT_ID);
  }
  async send(_request: PayoutRequest): Promise<PayoutResult> {
    if (!this.isConfigured()) {
      return { ok: false, reason: "Easypaisa disbursement is not configured.", retryable: false };
    }
    return { ok: false, reason: "Easypaisa disbursement is not implemented yet.", retryable: false };
  }
}

class BankTransferProvider implements PayoutProvider {
  readonly method = "BANK_TRANSFER" as const;
  readonly name = "Bank transfer";
  isConfigured() {
    return false; // Bank payouts are handled by an operator in the MVP.
  }
  async send(_request: PayoutRequest): Promise<PayoutResult> {
    return { ok: false, reason: "Bank transfers are processed manually.", retryable: false };
  }
}

/**
 * USDT withdrawals.
 *
 * Disbursement is delegated to the same custodial gateway that takes deposits,
 * for the same reason: the platform holds no keys and signs nothing. A payout
 * here is a request to that gateway, and the transaction hash it returns is
 * written back onto the withdrawal so a member can verify it on a block
 * explorer themselves rather than taking the platform's word for it.
 *
 * Two things this provider refuses to do, both learned the expensive way by
 * everyone who has shipped crypto payouts:
 *   1. Send without a network. USDT on the wrong chain is unrecoverable.
 *   2. Report COMPLETED on submission. A broadcast transaction is not a settled
 *      one, so it returns PROCESSING and waits for the gateway's callback.
 */
class CryptoUsdtPayoutProvider implements PayoutProvider {
  readonly method = "CRYPTO_USDT" as const;
  readonly name = "USDT (crypto)";

  isConfigured() {
    // Either rail counts: a hosted gateway, or a configured exchange account.
    return Boolean((process.env.CRYPTO_GATEWAY_API_KEY && process.env.CRYPTO_GATEWAY_API_URL) || getExchange());
  }

  async send(request: PayoutRequest): Promise<PayoutResult> {
    if (!this.isConfigured()) {
      return { ok: false, reason: "No crypto payout rail is configured.", retryable: false };
    }
    if (!request.network) {
      return {
        ok: false,
        reason: "This withdrawal has no network set. USDT sent on the wrong chain cannot be recovered.",
        retryable: false,
      };
    }
    if (!allowedNetworks().includes(request.network)) {
      return { ok: false, reason: `${request.network} is not an accepted network.`, retryable: false };
    }

    const exchange = getExchange();
    if (!exchange) {
      return {
        ok: false,
        reason: "No exchange is configured for USDT payouts.",
        retryable: false,
      };
    }

    const amount = (request.netAmount / env().CRYPTO_USDT_RATE_MINOR).toFixed(6);

    const result = await exchange.withdraw({
      // The exchange deduplicates on this. It is what makes a retried dispatch
      // safe, and it is the only protection against the one mistake that
      // cannot be reversed once the chain accepts it.
      withdrawalId: request.withdrawalId,
      network: request.network,
      address: request.accountNumber,
      amount,
      recipient: { name: request.accountName },
    });

    if (!result.ok) return { ok: false, reason: result.reason, retryable: result.retryable };

    // PROCESSING, never COMPLETED. The exchange has accepted the request; the
    // chain has not settled it. `pollWithdrawalSettlements` moves it on once a
    // transaction hash exists and the transfer confirms.
    return {
      ok: true,
      providerReference: result.providerReference,
      status: "PROCESSING",
      network: request.network,
    };
  }
}

/**
 * Stripe payouts require a Connect account for each recipient, which means
 * onboarding and identity verification per member — not something that can be
 * switched on by setting a key. It stays off unless STRIPE_PAYOUT_ENABLED says
 * that work has been done.
 */
class StripePayoutProvider implements PayoutProvider {
  readonly method = "STRIPE" as const;
  readonly name = "Stripe";

  isConfigured() {
    return stripePayoutsEnabled();
  }

  async send(_request: PayoutRequest): Promise<PayoutResult> {
    if (!this.isConfigured()) {
      return {
        ok: false,
        reason: "Stripe payouts need a connected account for the recipient.",
        retryable: false,
      };
    }
    return { ok: false, reason: "Stripe disbursement is not implemented yet.", retryable: false };
  }
}

const PROVIDERS: PayoutProvider[] = [
  new JazzCashProvider(),
  new EasypaisaProvider(),
  new BankTransferProvider(),
  new CryptoUsdtPayoutProvider(),
  new StripePayoutProvider(),
];

export function getPayoutProvider(method: PayoutMethod): PayoutProvider | null {
  return PROVIDERS.find((p) => p.method === method) ?? null;
}

export function payoutStatuses() {
  return PROVIDERS.map((p) => ({ method: p.method, name: p.name, configured: p.isConfigured() }));
}

export const PAYOUT_METHOD_LABELS: Record<PayoutMethod, string> = {
  JAZZCASH: "JazzCash",
  EASYPAISA: "Easypaisa",
  BANK_TRANSFER: "Bank transfer",
  CRYPTO_USDT: "USDT (crypto)",
  STRIPE: "Stripe",
};

/** Methods that need a chain selected before a withdrawal can be submitted. */
export const CRYPTO_PAYOUT_METHODS: PayoutMethod[] = ["CRYPTO_USDT"];

export function requiresNetwork(method: PayoutMethod) {
  return CRYPTO_PAYOUT_METHODS.includes(method);
}
