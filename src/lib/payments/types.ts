import type { CryptoNetwork, DepositMethod, UserTier } from "@prisma/client";

/**
 * Deposit gateway contract.
 *
 * A deposit here has exactly one purpose: paying a membership fee. There is no
 * "top up your balance" path, and no adapter may create one. Money that comes
 * in must either buy a membership or be refunded through the gateway that took
 * it — it never becomes a withdrawable wallet balance, because holding member
 * funds on account and paying them back out is money transmission, and that
 * needs a licence this platform does not have.
 *
 * As with the survey adapters, an unconfigured gateway reports
 * `isConfigured(): false` and refuses, rather than simulating a payment.
 */

export type DepositRequest = {
  depositId: string;
  reference: string;
  userId: string;
  tier: UserTier;
  /** Fee in platform minor units. */
  amount: number;
  currency: string;
  /** Where the member should land after paying. */
  returnUrl: string;
  cancelUrl: string;
  network?: CryptoNetwork;
};

export type DepositIntent = {
  providerReference: string;
  /** Card rails: where to send the member. */
  checkoutUrl?: string;
  /** Crypto rails: the address to pay, and what to send. */
  depositAddress?: string;
  cryptoAsset?: string;
  /** Decimal string. Never a float — 0.1 + 0.2 has no place near money. */
  cryptoAmount?: string;
  network?: CryptoNetwork;
  requiredConfirmations?: number;
  expiresAt?: Date;
};

export type DepositIntentResult =
  | { ok: true; intent: DepositIntent }
  | { ok: false; reason: string };

/** What a gateway callback means, once the signature has been verified. */
export type NormalizedPaymentEvent = {
  eventId: string;
  eventType: string;
  /** Our deposit reference, echoed back by the gateway. */
  reference?: string;
  providerReference?: string;
  status: "PENDING" | "CONFIRMING" | "CONFIRMED" | "FAILED" | "EXPIRED" | "REFUNDED";
  /** Amount the gateway actually settled, in platform minor units, when known. */
  settledAmount?: number;
  txHash?: string;
  fromAddress?: string;
  network?: CryptoNetwork;
  confirmations?: number;
  failureReason?: string;
  raw: Record<string, unknown>;
};

export type DepositEventStatus = NormalizedPaymentEvent["status"];

export type PaymentVerification =
  | { ok: true; event: NormalizedPaymentEvent }
  | { ok: false; reason: string; eventId?: string };

export interface DepositGateway {
  readonly method: DepositMethod;
  readonly name: string;
  isConfigured(): boolean;
  createDeposit(request: DepositRequest): Promise<DepositIntentResult>;
  verifyWebhook(rawBody: string, headers: Headers, url: URL): Promise<PaymentVerification>;
}

export const GATEWAY_NOT_CONFIGURED = "This payment method is not configured yet.";
