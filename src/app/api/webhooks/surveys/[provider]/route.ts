import { NextResponse } from "next/server";
import { processSurveyWebhook } from "@/lib/surveys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Survey provider callbacks.
 *
 * Excluded from the auth middleware because providers call it server-to-server.
 * Authentication is the signature check inside each adapter — an unsigned or
 * mis-signed delivery is recorded and rejected, never credited.
 *
 * Both GET and POST are handled since providers differ on which they use.
 */
async function receive(request: Request, context: { params: Promise<{ provider: string }> }) {
  const { provider } = await context.params;
  try {
    const outcome = await processSurveyWebhook(provider, request);
    return NextResponse.json(outcome.body, { status: outcome.status });
  } catch (error) {
    console.error("[webhook:surveys]", provider, error);
    // A 500 tells the provider to retry, which the idempotency layer can absorb.
    return NextResponse.json({ received: false, message: "Processing failed." }, { status: 500 });
  }
}

export const GET = receive;
export const POST = receive;
