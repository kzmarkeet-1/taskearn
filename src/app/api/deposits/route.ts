import { handler, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * The member's own payment history.
 *
 * Deliberately narrow: a deposit here only ever bought a membership, so there
 * is no balance to report and nothing to withdraw from. The transaction hash is
 * returned so a member can check the chain themselves.
 */
export const GET = handler(async () => {
  const user = await requireUser();

  const deposits = await prisma.deposit.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 25,
    select: {
      reference: true,
      method: true,
      tier: true,
      amount: true,
      currency: true,
      status: true,
      network: true,
      cryptoAsset: true,
      cryptoAmount: true,
      depositAddress: true,
      checkoutUrl: true,
      txHash: true,
      confirmations: true,
      requiredConfirmations: true,
      failureReason: true,
      expiresAt: true,
      paidAt: true,
      createdAt: true,
    },
  });

  return ok({ deposits });
});
