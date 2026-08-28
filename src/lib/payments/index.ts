import "server-only";
import { Prisma, type CryptoNetwork, type DepositMethod, type UserTier } from "@prisma/client";
import { prisma } from "../prisma";
import { Err } from "../errors";
import { randomReference } from "../crypto";
import { env } from "../env";
import { notify } from "../notifications";
import { getSettings } from "../settings";
import { activateSubscription, assertPlanIsNotYield } from "../tiers";
import { CryptoUsdtGateway, allowedNetworks, minorToUsdt } from "./crypto";
import { getExchange, quoteUniqueAmount } from "./exchanges";
import { StripeGateway } from "./stripe";
import type { DepositGateway, NormalizedPaymentEvent } from "./types";

export * from "./types";
export { allowedNetworks, minorToUsdt } from "./crypto";

/**
 * Deposits.
 *
 * The whole flow, in one place so it can be read at once:
 *
 *   1. A member picks a tier and a payment method.
 *   2. `createTierDeposit` writes a Deposit row and asks the gateway for an
 *      address or a checkout link. Nothing is credited.
 *   3. The gateway calls back. `processPaymentWebhook` verifies the signature,
 *      records the delivery for idempotency, and — only on a confirmed
 *      settlement — activates the membership.
 *   4. The membership is a raised daily limit. No money is ever credited to the
 *      member's wallet by any step of this flow.
 *
 * Step 4 is the one that matters. A deposit that turned into spendable balance
 * would make this a stored-value product, which needs licensing the platform
 * does not hold, and would open the door to the deposit-funded-yield structure
 * the tier system is explicitly built to avoid.
 */

const GATEWAYS: DepositGateway[] = [new CryptoUsdtGateway(), new StripeGateway()];

export function getGateway(method: DepositMethod): DepositGateway | null {
  return GATEWAYS.find((g) => g.method === method) ?? null;
}

export function gatewayStatuses() {
  return GATEWAYS.map((g) => ({
    method: g.method,
    name: g.name,
    configured: g.isConfigured(),
    networks: g.method === "CRYPTO_USDT" ? allowedNetworks() : [],
  }));
}

/** How long an unpaid deposit stays open before it is retired. */
const DEPOSIT_TTL_MS = 60 * 60_000;

export async function createTierDeposit(args: {
  userId: string;
  tier: UserTier;
  method: DepositMethod;
  network?: CryptoNetwork;
}) {
  const settings = await getSettings();
  if (!settings.enableMemberships) {
    throw Err.conflict("Paid memberships are not open right now.");
  }

  const plan = await prisma.tierPlan.findUnique({ where: { tier: args.tier } });
  if (!plan || !plan.active) throw Err.notFound("That membership is not available.");
  if (plan.priceAmount <= 0) throw Err.invalid("The Free membership does not need a payment.");
  assertPlanIsNotYield(plan);

  const gateway = getGateway(args.method);
  if (!gateway) throw Err.invalid("That payment method is not supported.");
  if (!gateway.isConfigured()) {
    throw Err.conflict(`${gateway.name} is not available yet. Try another payment method.`);
  }

  if (args.method === "CRYPTO_USDT" && args.network && !allowedNetworks().includes(args.network)) {
    throw Err.invalid("That network is not accepted. Choose one of the listed chains.");
  }

  // One open deposit per member at a time. Two live addresses for the same
  // upgrade is how a member ends up paying twice and opening a ticket.
  const open = await prisma.deposit.findFirst({
    where: {
      userId: args.userId,
      status: { in: ["AWAITING_PAYMENT", "CONFIRMING"] },
      expiresAt: { gt: new Date() },
    },
  });
  if (open) {
    throw Err.conflict("You already have a payment in progress. Finish or cancel it first.");
  }

  const reference = randomReference("DEP");
  const appUrl = env().NEXT_PUBLIC_APP_URL;

  const deposit = await prisma.deposit.create({
    data: {
      userId: args.userId,
      method: args.method,
      purpose: "TIER_UPGRADE",
      tier: args.tier,
      amount: plan.priceAmount,
      currency: "PKR",
      status: "AWAITING_PAYMENT",
      reference,
      network: args.method === "CRYPTO_USDT" ? (args.network ?? allowedNetworks()[0]) : null,
      requiredConfirmations: args.method === "CRYPTO_USDT" ? env().CRYPTO_MIN_CONFIRMATIONS : 0,
      expiresAt: new Date(Date.now() + DEPOSIT_TTL_MS),
    },
  });

  /*
   * Exchange rail: there is no gateway to ask for an address, because an
   * exchange has exactly one shared USDT address per chain. The member is
   * quoted a unique amount instead, and `pollExchangeDeposits` matches the
   * incoming credit on it. See ./exchanges/index.ts for what that trade costs.
   */
  const exchange = getExchange();
  if (args.method === "CRYPTO_USDT" && exchange && !gateway.isConfigured()) {
    const uniqueAmount = await quoteUniqueAmount(
      Number(minorToUsdt(plan.priceAmount)),
      deposit.network ?? allowedNetworks()[0],
    );

    if (!uniqueAmount) {
      await prisma.deposit.update({
        where: { id: deposit.id },
        data: { status: "FAILED", failureReason: "Too many payments in progress to quote a unique amount." },
      });
      throw Err.conflict("Too many payments are in progress right now. Try again in a few minutes.");
    }

    const address = process.env.CRYPTO_DEPOSIT_ADDRESS;
    if (!address) {
      await prisma.deposit.update({
        where: { id: deposit.id },
        data: { status: "FAILED", failureReason: "No deposit address configured." },
      });
      throw Err.conflict("Crypto payments are not available right now.");
    }

    return prisma.deposit.update({
      where: { id: deposit.id },
      data: {
        depositAddress: address,
        cryptoAsset: "USDT",
        // The exact figure is the identifier. A member who rounds it will not
        // be matched automatically, which is why the UI states it so firmly.
        cryptoAmount: uniqueAmount,
        requiredConfirmations: env().CRYPTO_MIN_CONFIRMATIONS,
        providerReference: `exchange:${exchange.id}`,
      },
    });
  }

  const intent = await gateway.createDeposit({
    depositId: deposit.id,
    reference,
    userId: args.userId,
    tier: args.tier,
    amount: plan.priceAmount,
    currency: "PKR",
    returnUrl: `${appUrl}/dashboard/membership?paid=${reference}`,
    cancelUrl: `${appUrl}/dashboard/membership?cancelled=${reference}`,
    network: deposit.network ?? undefined,
  });

  if (!intent.ok) {
    await prisma.deposit.update({
      where: { id: deposit.id },
      data: { status: "FAILED", failureReason: intent.reason },
    });
    throw Err.conflict(intent.reason);
  }

  const updated = await prisma.deposit.update({
    where: { id: deposit.id },
    data: {
      providerReference: intent.intent.providerReference,
      checkoutUrl: intent.intent.checkoutUrl,
      depositAddress: intent.intent.depositAddress,
      cryptoAsset: intent.intent.cryptoAsset,
      cryptoAmount: intent.intent.cryptoAmount,
      network: intent.intent.network ?? deposit.network,
      requiredConfirmations: intent.intent.requiredConfirmations ?? deposit.requiredConfirmations,
      expiresAt: intent.intent.expiresAt ?? deposit.expiresAt,
    },
  });

  return updated;
}

export async function expireStaleDeposits() {
  const result = await prisma.deposit.updateMany({
    where: { status: "AWAITING_PAYMENT", expiresAt: { lt: new Date() } },
    data: { status: "EXPIRED", failureReason: "No payment arrived before the address expired." },
  });
  return { expired: result.count };
}

// ----------------------------------------------------------------------
// Webhook processing
// ----------------------------------------------------------------------

export type PaymentWebhookOutcome = {
  status: number;
  body: { received: boolean; message: string };
};

async function findDeposit(event: NormalizedPaymentEvent, method: DepositMethod) {
  if (event.reference) {
    const byReference = await prisma.deposit.findUnique({ where: { reference: event.reference } });
    if (byReference) return byReference;
  }
  if (event.providerReference) {
    return prisma.deposit.findFirst({
      where: { method, providerReference: event.providerReference },
    });
  }
  return null;
}

/**
 * Processes one gateway callback.
 *
 * Three layers stop a replayed delivery from granting two memberships:
 * the unique index on (provider, eventId) here, the `status` guard on the
 * deposit update, and the one-subscription-per-deposit unique index on
 * TierSubscription.depositId.
 */
export async function processPaymentWebhook(
  providerSlug: string,
  request: Request,
): Promise<PaymentWebhookOutcome> {
  const method: DepositMethod | null =
    providerSlug === "crypto" ? "CRYPTO_USDT" : providerSlug === "stripe" ? "STRIPE" : null;

  if (!method) return { status: 404, body: { received: false, message: "Unknown payment provider." } };

  const gateway = getGateway(method);
  if (!gateway) return { status: 404, body: { received: false, message: "Unknown payment provider." } };

  const rawBody = await request.text();
  const url = new URL(request.url);
  const verification = await gateway.verifyWebhook(rawBody, request.headers, url);

  if (!verification.ok) {
    await prisma.paymentWebhookEvent
      .create({
        data: {
          provider: providerSlug,
          eventId: verification.eventId ?? `rejected:${Date.now()}`,
          signatureOk: false,
          payload: { body: rawBody.slice(0, 2000) },
          error: verification.reason,
        },
      })
      .catch(() => undefined);
    return { status: 401, body: { received: false, message: verification.reason } };
  }

  const event = verification.event;

  let record;
  try {
    record = await prisma.paymentWebhookEvent.create({
      data: {
        provider: providerSlug,
        eventId: event.eventId,
        eventType: event.eventType,
        signatureOk: true,
        payload: event.raw as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { status: 200, body: { received: true, message: "Already processed." } };
    }
    throw error;
  }

  const finish = async (message: string, error?: string) => {
    await prisma.paymentWebhookEvent.update({
      where: { id: record.id },
      data: { processedAt: new Date(), error },
    });
    return { status: 200, body: { received: true, message } };
  };

  const deposit = await findDeposit(event, method);
  if (!deposit) {
    // A 200 with no action: the delivery is real and signed, but it does not
    // belong to anything here. A 500 would put the gateway into a retry loop
    // that can never succeed.
    return finish("No matching deposit.", "No matching deposit.");
  }

  // Crypto evidence is written on every delivery, confirmed or not, so an
  // operator can trace a stuck payment on a block explorer without waiting for
  // it to finalise.
  await prisma.deposit.update({
    where: { id: deposit.id },
    data: {
      txHash: event.txHash ?? deposit.txHash,
      fromAddress: event.fromAddress ?? deposit.fromAddress,
      confirmations: event.confirmations ?? deposit.confirmations,
      network: event.network ?? deposit.network,
      providerReference: event.providerReference ?? deposit.providerReference,
    },
  });

  if (event.status === "PENDING" || event.status === "CONFIRMING") {
    await prisma.deposit.updateMany({
      where: { id: deposit.id, status: "AWAITING_PAYMENT" },
      data: { status: "CONFIRMING" },
    });
    return finish("Payment is still settling.");
  }

  if (event.status === "FAILED" || event.status === "EXPIRED") {
    await prisma.deposit.updateMany({
      where: { id: deposit.id, status: { in: ["AWAITING_PAYMENT", "CONFIRMING"] } },
      data: {
        status: event.status === "EXPIRED" ? "EXPIRED" : "FAILED",
        failureReason: event.failureReason ?? "The gateway reported the payment did not complete.",
      },
    });
    return finish("Payment did not complete.");
  }

  if (event.status === "REFUNDED") {
    // A refund after activation is a business decision, not an automatic one:
    // clawing back a membership someone has already used needs an operator to
    // look at it. The deposit is marked and left for review.
    await prisma.deposit.update({
      where: { id: deposit.id },
      data: { status: "REFUNDED", failureReason: "Refunded or disputed at the gateway." },
    });
    await notify({
      userId: deposit.userId,
      type: "SECURITY_ALERT",
      title: "A membership payment was refunded",
      body: "Support will be in touch about your membership.",
      href: "/dashboard/membership",
    });
    return finish("Refund recorded for review.");
  }

  // --- CONFIRMED --------------------------------------------------------

  const settled = await settleConfirmedDeposit(deposit.id);
  return finish(settled.message, settled.error);
}

/**
 * Turns a paid deposit into an active membership.
 *
 * Shared by both settlement paths — a gateway webhook and the exchange deposit
 * poller — so there is exactly one place where money becomes a membership. Two
 * copies of this logic would eventually disagree, and the way they would
 * disagree is somebody getting a tier twice or not at all.
 *
 * Safe to call repeatedly: the guarded status transition means only the first
 * caller activates anything.
 */
export async function settleConfirmedDeposit(
  depositId: string,
): Promise<{ activated: boolean; message: string; error?: string }> {
  const deposit = await prisma.deposit.findUnique({ where: { id: depositId } });
  if (!deposit) return { activated: false, message: "No matching deposit.", error: "No matching deposit." };

  // Guarded transition: only the caller that finds the deposit still open gets
  // to activate. Two concurrent settlements cannot both pass.
  const claimed = await prisma.deposit.updateMany({
    where: { id: deposit.id, status: { in: ["AWAITING_PAYMENT", "CONFIRMING"] } },
    data: { status: "CONFIRMED", paidAt: new Date() },
  });

  if (claimed.count === 0) return { activated: false, message: "Already credited." };

  if (!deposit.tier) {
    return {
      activated: false,
      message: "Deposit had no tier attached.",
      error: "Deposit had no tier attached.",
    };
  }

  try {
    await activateSubscription({
      userId: deposit.userId,
      tier: deposit.tier,
      pricePaid: deposit.amount,
      paidFrom: "deposit",
      depositId: deposit.id,
    });
  } catch (error) {
    // The money arrived but the membership did not start. This must be loud —
    // a silent failure here is a member who paid for nothing.
    console.error(`[payments] deposit ${deposit.reference} confirmed but activation failed:`, error);
    await prisma.deposit.update({
      where: { id: deposit.id },
      data: { failureReason: "Payment confirmed but the membership did not activate. Support has been notified." },
    });
    return { activated: false, message: "Confirmed, activation pending review.", error: String(error) };
  }

  await notify({
    userId: deposit.userId,
    type: "DEPOSIT_CONFIRMED",
    title: "Payment received",
    body: `Your ${deposit.tier.toLowerCase()} membership is active.`,
    href: "/dashboard/membership",
  });

  return { activated: true, message: "Processed." };
}
