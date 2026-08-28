import { prisma } from "@/lib/prisma";
import { handler, ok, parseBody, assertSameOrigin } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { adminWithdrawalUpdateSchema } from "@/lib/validation";
import { approveWithdrawal, completeWithdrawal, markWithdrawalProcessing, refundWithdrawal } from "@/lib/wallet";
import { getPayoutProvider } from "@/lib/payouts";
import { notify } from "@/lib/notifications";
import { audit } from "@/lib/audit";
import { Err } from "@/lib/errors";
import { formatMoney } from "@/lib/money";

export const runtime = "nodejs";

export const PATCH = handler(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  await assertSameOrigin(request);
  const admin = await requireAdmin();
  const { id } = await context.params;
  const body = await parseBody(request, adminWithdrawalUpdateSchema);

  const before = await prisma.withdrawal.findUnique({ where: { id } });
  if (!before) throw Err.notFound("That withdrawal does not exist.");

  let after;
  let providerNote: string | undefined;

  switch (body.action) {
    case "APPROVE": {
      after = await approveWithdrawal(id, admin.id);
      await notify({
        userId: before.userId,
        type: "WITHDRAWAL_APPROVED",
        title: "Withdrawal approved",
        body: `${formatMoney(before.netAmount)} has been approved and is queued for payout.`,
        href: "/dashboard/withdraw",
        email: true,
      });
      break;
    }
    case "PROCESS": {
      // Try the real provider; if none is configured this stays a manual payout.
      const provider = getPayoutProvider(before.method);
      const result = await provider?.send({
        withdrawalId: before.id,
        reference: before.reference,
        method: before.method,
        accountName: before.accountName,
        accountNumber: before.accountNumber,
        bankName: before.bankName,
        netAmount: before.netAmount,
      });
      providerNote = result?.ok ? undefined : result?.reason;
      after = await markWithdrawalProcessing(id, result?.ok ? result.providerReference : body.providerReference);
      break;
    }
    case "COMPLETE": {
      after = await completeWithdrawal(id, body.providerReference);
      await notify({
        userId: before.userId,
        type: "WITHDRAWAL_COMPLETED",
        title: "Withdrawal sent",
        body: `${formatMoney(before.netAmount)} has been sent to your ${before.accountNumber.slice(-4)} account.`,
        href: "/dashboard/withdraw",
        email: true,
      });
      break;
    }
    case "REJECT": {
      if (!body.reason) throw Err.invalid("Give a reason so the member knows what to fix.");
      after = await refundWithdrawal({ id, status: "REJECTED", reason: body.reason, actorId: admin.id });
      await notify({
        userId: before.userId,
        type: "WITHDRAWAL_REJECTED",
        title: "Withdrawal returned",
        body: `${body.reason} The full amount, including the fee, is back in your wallet.`,
        href: "/dashboard/withdraw",
        email: true,
      });
      break;
    }
  }

  await audit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: `admin.withdrawal.${body.action.toLowerCase()}`,
    entityType: "Withdrawal",
    entityId: id,
    before: { status: before.status },
    after: { status: after.status, reason: body.reason },
  });

  return ok({ withdrawal: after, providerNote });
});
