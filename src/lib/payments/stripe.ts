import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import type {
  DepositEventStatus,
  DepositGateway,
  DepositIntentResult,
  DepositRequest,
  PaymentVerification,
} from "./types";
import { GATEWAY_NOT_CONFIGURED } from "./types";
import { env } from "../env";

/**
 * Stripe Checkout for membership fees.
 *
 * Called over Stripe's REST API directly rather than through the SDK: this
 * project has no npm access in its build environment, and the two calls it
 * needs — create a Checkout Session, verify a webhook — are small enough that a
 * dependency would cost more than it saves.
 *
 * A compliance note that belongs next to the code rather than in a document
 * nobody opens: Stripe's prohibited business list covers get-rich-quick
 * schemes, and an account that sells "investment packages" or anything paying a
 * return on a deposit is closed on discovery, with the balance held. What is
 * being sold through this integration is a fixed-term subscription to a larger
 * daily task allowance. Keep the product description on the Checkout Session
 * saying exactly that, because it is what a reviewer reads first.
 */

type StripeSessionResponse = {
  id?: string;
  url?: string;
  error?: { message?: string };
};

type StripeEvent = {
  id?: string;
  type?: string;
  data?: { object?: Record<string, unknown> };
};

const API_BASE = "https://api.stripe.com/v1";

/** Stripe's tolerance for clock skew on the signed timestamp. */
const SIGNATURE_TOLERANCE_SECONDS = 300;

function mapEventType(type: string): DepositEventStatus | null {
  switch (type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
    case "payment_intent.succeeded":
      return "CONFIRMED";
    case "checkout.session.async_payment_failed":
    case "payment_intent.payment_failed":
      return "FAILED";
    case "checkout.session.expired":
      return "EXPIRED";
    case "charge.refunded":
    case "charge.dispute.created":
      return "REFUNDED";
    default:
      // Stripe sends a great many event types. Anything not listed is
      // acknowledged and ignored rather than guessed at.
      return null;
  }
}

export class StripeGateway implements DepositGateway {
  readonly method = "STRIPE" as const;
  readonly name = "Card (Stripe)";

  isConfigured() {
    return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
  }

  async createDeposit(request: DepositRequest): Promise<DepositIntentResult> {
    if (!this.isConfigured()) return { ok: false, reason: GATEWAY_NOT_CONFIGURED };

    // Stripe's API is form-encoded, including for nested structures.
    const form = new URLSearchParams({
      mode: "payment",
      client_reference_id: request.reference,
      success_url: request.returnUrl,
      cancel_url: request.cancelUrl,
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": request.currency.toLowerCase(),
      // Stripe also works in the smallest currency unit, so the platform's
      // minor units pass straight through with no conversion to get wrong.
      "line_items[0][price_data][unit_amount]": String(request.amount),
      "line_items[0][price_data][product_data][name]": `${request.tier} membership — 30 days`,
      "line_items[0][price_data][product_data][description]":
        "Subscription to a higher daily task and survey allowance. Not an investment; no return is offered or implied.",
      "metadata[deposit_id]": request.depositId,
      "metadata[user_id]": request.userId,
      "metadata[tier]": request.tier,
      "metadata[reference]": request.reference,
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);

    try {
      const response = await fetch(`${API_BASE}/checkout/sessions`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
          "content-type": "application/x-www-form-urlencoded",
          // Stripe deduplicates on this, so a retried request cannot create a
          // second session — or a second charge — for one deposit.
          "idempotency-key": `deposit:${request.depositId}`,
        },
        body: form.toString(),
        signal: controller.signal,
        cache: "no-store",
      });

      const data = (await response.json()) as StripeSessionResponse;

      if (!response.ok || !data.url || !data.id) {
        console.error("[payments:stripe] session creation failed:", data.error?.message ?? response.status);
        return { ok: false, reason: "The card gateway could not start this payment. Try again shortly." };
      }

      return {
        ok: true,
        intent: {
          providerReference: data.id,
          checkoutUrl: data.url,
          expiresAt: new Date(Date.now() + 24 * 3600_000),
        },
      };
    } catch (error) {
      const aborted = error instanceof Error && error.name === "AbortError";
      console.error("[payments:stripe] create failed:", error);
      return {
        ok: false,
        reason: aborted ? "The card gateway timed out. Try again shortly." : "The card gateway could not be reached.",
      };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Verifies Stripe's `Stripe-Signature` header.
   *
   * The header looks like `t=1699999999,v1=abc...,v1=def...`. The signed
   * payload is `${timestamp}.${rawBody}`, so the raw bytes matter — anything
   * that re-serialises the body before it gets here will break verification,
   * which is why the route reads `request.text()` and passes it through
   * untouched.
   */
  async verifyWebhook(rawBody: string, headers: Headers): Promise<PaymentVerification> {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!secret) return { ok: false, reason: "STRIPE_WEBHOOK_SECRET is not set." };

    const header = headers.get("stripe-signature") ?? "";
    if (!header) return { ok: false, reason: "The callback carried no Stripe signature." };

    const parts = header.split(",").map((p) => p.trim());
    const timestamp = parts.find((p) => p.startsWith("t="))?.slice(2) ?? "";
    const signatures = parts.filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));

    if (!timestamp || signatures.length === 0) {
      return { ok: false, reason: "The Stripe signature header was malformed." };
    }

    // Replay window. Without this, a signature captured once stays valid
    // forever, and a resent delivery could re-activate a cancelled membership.
    const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
    if (!Number.isFinite(age) || age > SIGNATURE_TOLERANCE_SECONDS) {
      return { ok: false, reason: "The Stripe signature is outside the accepted time window." };
    }

    const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
    const expectedBuffer = Buffer.from(expected);

    const matched = signatures.some((candidate) => {
      const candidateBuffer = Buffer.from(candidate);
      if (candidateBuffer.length !== expectedBuffer.length) return false;
      return timingSafeEqual(candidateBuffer, expectedBuffer);
    });

    if (!matched) return { ok: false, reason: "Signature did not match." };

    let event: StripeEvent;
    try {
      event = JSON.parse(rawBody) as StripeEvent;
    } catch {
      return { ok: false, reason: "The callback body was not valid JSON." };
    }

    const eventType = event.type ?? "unknown";
    const status = mapEventType(eventType);
    const object = event.data?.object ?? {};
    const metadata = (object.metadata ?? {}) as Record<string, unknown>;

    if (!status) {
      // Acknowledged, not processed. Returning an error would make Stripe retry
      // an event that will never be actionable.
      return {
        ok: true,
        event: {
          eventId: String(event.id ?? `${eventType}:${Date.now()}`),
          eventType,
          status: "PENDING",
          raw: { ignored: true, type: eventType },
        },
      };
    }

    return {
      ok: true,
      event: {
        eventId: String(event.id ?? `${eventType}:${Date.now()}`),
        eventType,
        reference: metadata.reference ? String(metadata.reference) : (object.client_reference_id ? String(object.client_reference_id) : undefined),
        providerReference: object.id ? String(object.id) : undefined,
        status,
        settledAmount: Number.isFinite(Number(object.amount_total)) ? Number(object.amount_total) : undefined,
        failureReason: status === "FAILED" ? `Stripe reported ${eventType}.` : undefined,
        raw: object,
      },
    };
  }
}

/** Stripe payouts are opt-in and need a Connect account per recipient. */
export function stripePayoutsEnabled() {
  return Boolean(process.env.STRIPE_SECRET_KEY) && env().STRIPE_PAYOUT_ENABLED;
}
