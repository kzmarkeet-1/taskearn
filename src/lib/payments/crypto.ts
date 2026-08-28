import "server-only";
import type { CryptoNetwork } from "@prisma/client";
import type {
  DepositEventStatus,
  DepositGateway,
  DepositIntentResult,
  DepositRequest,
  PaymentVerification,
} from "./types";
import { GATEWAY_NOT_CONFIGURED } from "./types";
import { hmacSha256Hex, safeCompare } from "../crypto";
import { env } from "../env";

/**
 * USDT deposits through a custodial gateway.
 *
 * Why custodial: the platform holds no private keys, signs no transactions and
 * never has unilateral control of anyone's coins. It asks a gateway for a
 * deposit address, the gateway watches the chain, and the gateway calls back
 * when the transfer is final. Self-custody would mean key management, hot
 * wallet risk and, in most jurisdictions, a licence — none of which belong in
 * an app whose actual business is surveys.
 *
 * The gateway contract assumed below is the common shape offered by hosted
 * crypto processors (NOWPayments, Coinbase Commerce, BitPay and similar):
 *
 *   POST {CRYPTO_GATEWAY_API_URL}/v1/payments
 *     Authorization: Bearer {CRYPTO_GATEWAY_API_KEY}
 *     { order_id, price_amount, price_currency, pay_currency, network,
 *       ipn_callback_url, success_url, cancel_url }
 *   -> { payment_id, pay_address, pay_amount, network, expiration_estimate_date }
 *
 *   callback (POST, JSON):
 *     x-gateway-signature: hex HMAC-SHA256 of the raw body
 *     { payment_id, order_id, payment_status, pay_amount, actually_paid,
 *       tx_hash, network, confirmations, outcome_amount }
 *
 * Field names differ between processors. If yours does not match, change the
 * mapping in `mapStatus` and `verifyWebhook` and nothing else — the rest of the
 * system only sees the normalised event.
 */

const CONFIRM_STATUSES = new Set(["finished", "confirmed", "completed", "settled"]);
const PENDING_STATUSES = new Set(["waiting", "created", "pending", "new"]);
const CONFIRMING_STATUSES = new Set(["confirming", "sending", "partially_paid"]);
const FAILED_STATUSES = new Set(["failed", "cancelled", "canceled"]);

type GatewayCreateResponse = {
  payment_id?: string;
  id?: string;
  pay_address?: string;
  address?: string;
  pay_amount?: string | number;
  amount?: string | number;
  pay_currency?: string;
  network?: string;
  expiration_estimate_date?: string;
  expires_at?: string;
};

export function allowedNetworks(): CryptoNetwork[] {
  const valid: CryptoNetwork[] = ["TRC20", "ERC20", "BEP20", "POLYGON"];
  const configured = env()
    .CRYPTO_NETWORKS.split(",")
    .map((v) => v.trim().toUpperCase())
    .filter((v): v is CryptoNetwork => (valid as string[]).includes(v));
  return configured.length > 0 ? configured : ["TRC20"];
}

/** Platform minor units -> a USDT decimal string, at the configured rate. */
export function minorToUsdt(amountMinor: number): string {
  const rate = env().CRYPTO_USDT_RATE_MINOR;
  // Six decimal places: USDT's own precision on every chain listed above.
  return (amountMinor / rate).toFixed(6);
}

function mapStatus(raw: string): DepositEventStatus {
  const status = raw.toLowerCase();
  if (CONFIRM_STATUSES.has(status)) return "CONFIRMED";
  if (CONFIRMING_STATUSES.has(status)) return "CONFIRMING";
  if (PENDING_STATUSES.has(status)) return "PENDING";
  if (FAILED_STATUSES.has(status)) return "FAILED";
  if (status === "expired") return "EXPIRED";
  if (status === "refunded") return "REFUNDED";
  // An unrecognised status is treated as still in flight. Guessing "confirmed"
  // would credit a membership nobody paid for; guessing "failed" would strand a
  // real payment. Neither is acceptable, so the deposit simply waits.
  return "CONFIRMING";
}

export class CryptoUsdtGateway implements DepositGateway {
  readonly method = "CRYPTO_USDT" as const;
  readonly name = "USDT (crypto)";

  isConfigured() {
    return Boolean(process.env.CRYPTO_GATEWAY_API_KEY && process.env.CRYPTO_GATEWAY_API_URL);
  }

  async createDeposit(request: DepositRequest): Promise<DepositIntentResult> {
    if (!this.isConfigured()) return { ok: false, reason: GATEWAY_NOT_CONFIGURED };

    const network = request.network ?? allowedNetworks()[0];
    const payAmount = minorToUsdt(request.amount);
    const base = (process.env.CRYPTO_GATEWAY_API_URL ?? "").replace(/\/+$/, "");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);

    try {
      const response = await fetch(`${base}/v1/payments`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${process.env.CRYPTO_GATEWAY_API_KEY}`,
        },
        body: JSON.stringify({
          order_id: request.reference,
          price_amount: payAmount,
          price_currency: "usdt",
          pay_currency: "usdt",
          network: network.toLowerCase(),
          ipn_callback_url: `${env().NEXT_PUBLIC_APP_URL}/api/webhooks/payments/crypto`,
          success_url: request.returnUrl,
          cancel_url: request.cancelUrl,
        }),
        signal: controller.signal,
        cache: "no-store",
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        console.error(`[payments:crypto] gateway returned ${response.status}: ${detail.slice(0, 500)}`);
        return { ok: false, reason: "The crypto gateway could not create this payment. Try again shortly." };
      }

      const data = (await response.json()) as GatewayCreateResponse;
      const address = data.pay_address ?? data.address;
      const providerReference = String(data.payment_id ?? data.id ?? "");

      if (!address || !providerReference) {
        return { ok: false, reason: "The crypto gateway did not return a deposit address." };
      }

      const expiryRaw = data.expiration_estimate_date ?? data.expires_at;
      const parsedExpiry = expiryRaw ? new Date(expiryRaw) : null;

      return {
        ok: true,
        intent: {
          providerReference,
          depositAddress: address,
          cryptoAsset: "USDT",
          cryptoAmount: String(data.pay_amount ?? data.amount ?? payAmount),
          network,
          requiredConfirmations: env().CRYPTO_MIN_CONFIRMATIONS,
          expiresAt:
            parsedExpiry && !Number.isNaN(parsedExpiry.getTime())
              ? parsedExpiry
              : new Date(Date.now() + 60 * 60_000),
        },
      };
    } catch (error) {
      const aborted = error instanceof Error && error.name === "AbortError";
      console.error("[payments:crypto] create failed:", error);
      return {
        ok: false,
        reason: aborted
          ? "The crypto gateway timed out. Try again shortly."
          : "The crypto gateway could not be reached.",
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async verifyWebhook(rawBody: string, headers: Headers): Promise<PaymentVerification> {
    const secret = process.env.CRYPTO_GATEWAY_WEBHOOK_SECRET;
    if (!secret) return { ok: false, reason: "CRYPTO_GATEWAY_WEBHOOK_SECRET is not set." };

    const signature =
      headers.get("x-gateway-signature") ??
      headers.get("x-nowpayments-sig") ??
      headers.get("x-signature") ??
      "";
    if (!signature) return { ok: false, reason: "The callback carried no signature." };

    const expected = hmacSha256Hex(secret, rawBody);
    if (!safeCompare(signature.toLowerCase(), expected)) {
      return { ok: false, reason: "Signature did not match." };
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      return { ok: false, reason: "The callback body was not valid JSON." };
    }

    const providerReference = String(payload.payment_id ?? payload.id ?? "");
    const reference = payload.order_id ? String(payload.order_id) : undefined;
    const rawStatus = String(payload.payment_status ?? payload.status ?? "");
    const status = mapStatus(rawStatus);
    const txHash = payload.tx_hash ? String(payload.tx_hash) : undefined;
    const confirmations = Number(payload.confirmations ?? 0);

    if (!providerReference && !reference) {
      return { ok: false, reason: "The callback identified no payment." };
    }

    const networkRaw = String(payload.network ?? "").toUpperCase();
    const network = (["TRC20", "ERC20", "BEP20", "POLYGON"] as const).find((n) => n === networkRaw);

    // Confirmation depth is enforced here rather than trusted from the status
    // string. A gateway that calls a payment "finished" after one confirmation
    // is describing its own risk appetite, not ours — a re-org that deep is
    // rare but it is the platform that eats it.
    const required = env().CRYPTO_MIN_CONFIRMATIONS;
    const effectiveStatus =
      status === "CONFIRMED" && Number.isFinite(confirmations) && confirmations > 0 && confirmations < required
        ? "CONFIRMING"
        : status;

    return {
      ok: true,
      event: {
        // Status is part of the id so each state change is its own delivery.
        eventId: `${providerReference || reference}:${rawStatus || "unknown"}:${txHash ?? ""}`,
        eventType: rawStatus || "unknown",
        reference,
        providerReference: providerReference || undefined,
        status: effectiveStatus,
        settledAmount: undefined,
        txHash,
        fromAddress: payload.payin_address ? String(payload.payin_address) : undefined,
        network,
        confirmations: Number.isFinite(confirmations) ? confirmations : 0,
        failureReason: status === "FAILED" ? `Gateway reported ${rawStatus}.` : undefined,
        raw: payload,
      },
    };
  }
}
