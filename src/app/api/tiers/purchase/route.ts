import { handler, ok, parseBody, guard, assertSameOrigin } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { tierPurchaseSchema } from "@/lib/validation";
import { activateSubscription } from "@/lib/tiers";
import { createTierDeposit } from "@/lib/payments";
import { debitTierPurchase } from "@/lib/wallet";
import { prisma } from "@/lib/prisma";
import { Err } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { getSettings } from "@/lib/settings";

export const runtime = "nodejs";

/**
 * Buys a membership.
 *
 * Two routes to the same outcome:
 *   payWith: "wallet"  — debit the earned balance, activate immediately.
 *   payWith: "deposit" — open a gateway payment; the webhook activates it.
 *
 * The wallet path activates only after the debit lands, in that order. Doing it
 * the other way round would leave a member holding a membership they did not
 * pay for whenever the debit failed for insufficient funds.
 */
export const POST = handler(async (request) => {
  await assertSameOrigin(request);
  const user = await requireUser();
  await guard("tierPurchase", user.id);

  const settings = await getSettings();
  if (!settings.enableMemberships) {
    throw Err.conflict("Paid memberships are not open right now.");
  }

  const body = await parseBody(request, tierPurchaseSchema);

  const plan = await prisma.tierPlan.findUnique({ where: { tier: body.tier } });
  if (!plan || !plan.active) throw Err.notFound("That membership is not available.");

  if (body.payWith === "deposit") {
    if (!body.method) throw Err.invalid("Choose how you want to pay.");
    const deposit = await createTierDeposit({
      userId: user.id,
      tier: body.tier,
      method: body.method,
      network: body.network,
    });

    return ok({
      mode: "deposit" as const,
      reference: deposit.reference,
      checkoutUrl: deposit.checkoutUrl,
      depositAddress: deposit.depositAddress,
      cryptoAsset: deposit.cryptoAsset,
      cryptoAmount: deposit.cryptoAmount,
      network: deposit.network,
      requiredConfirmations: deposit.requiredConfirmations,
      expiresAt: deposit.expiresAt,
    });
  }

  // --- paid from the wallet ---------------------------------------------
  // requestId makes the whole purchase idempotent: a retried submission finds
  // the same reference already debited and does not charge again.
  const reference = `wallet:${body.requestId}`;

  const debited = await debitTierPurchase({
    userId: user.id,
    amount: plan.priceAmount,
    tier: plan.name,
    subscriptionReference: reference,
  });

  if (debited.duplicate) {
    return ok({ mode: "wallet" as const, alreadyProcessed: true });
  }

  const subscription = await activateSubscription({
    userId: user.id,
    tier: body.tier,
    pricePaid: plan.priceAmount,
    paidFrom: "wallet",
  });

  await audit({
    actorId: user.id,
    actorEmail: user.email,
    action: "TIER_PURCHASED",
    entityType: "TierSubscription",
    entityId: subscription.id,
    after: { tier: body.tier, pricePaid: plan.priceAmount, paidFrom: "wallet" },
  });

  return ok({
    mode: "wallet" as const,
    alreadyProcessed: false,
    tier: subscription.tier,
    expiresAt: subscription.expiresAt,
  });
});
