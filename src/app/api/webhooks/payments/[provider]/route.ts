import { NextResponse } from "next/server";
import { processPaymentWebhook } from "@/lib/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Payment gateway callbacks: /api/webhooks/payments/crypto and /stripe.
 *
 * Excluded from the auth middleware because gateways call it server-to-server.
 * Authentication is the signature check inside each adapter — an unsigned or
 * mis-signed delivery is recorded and rejected, never acted on.
 *
 * POST only. Neither gateway uses GET, and accepting one would mean a signed
 * delivery could be replayed from a browser address bar.
 */
export async function POST(request: Request, context: { params: Promise<{ provider: string }> }) {
  const { provider } = await context.params;
  try {
    const outcome = await processPaymentWebhook(provider, request);
    return NextResponse.json(outcome.body, { status: outcome.status });
  } catch (error) {
    console.error("[webhook:payments]", provider, error);
    // A 500 asks the gateway to retry, which the idempotency layer absorbs.
    return NextResponse.json({ received: false, message: "Processing failed." }, { status: 500 });
  }
}
