import { prisma } from "@/lib/prisma";
import { handler, ok, parseBody, guard, assertSameOrigin, paginate } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { withdrawalSchema } from "@/lib/validation";
import { createWithdrawal } from "@/lib/wallet";
import { checkWithdrawalRisk } from "@/lib/fraud";
import { notify } from "@/lib/notifications";
import { audit } from "@/lib/audit";
import { Err } from "@/lib/errors";
import { formatMoney } from "@/lib/money";

export const runtime = "nodejs";

export const GET = handler(async (request) => {
  const user = await requireUser();
  const { page, size, skip, take } = paginate(new URL(request.url).searchParams);

  const [rows, total] = await Promise.all([
    prisma.withdrawal.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, skip, take }),
    prisma.withdrawal.count({ where: { userId: user.id } }),
  ]);

  return ok({ rows, page, size, total });
});

export const POST = handler(async (request) => {
  await assertSameOrigin(request);
  const user = await requireUser();
  await guard("withdrawal", user.id);

  const account = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { createdAt: true, status: true },
  });
  if (account.status !== "ACTIVE") {
    throw Err.forbidden("Withdrawals are paused while your account is reviewed. Open a support ticket for details.");
  }

  const body = await parseBody(request, withdrawalSchema);

  const withdrawal = await createWithdrawal({
    userId: user.id,
    netAmountRequested: body.amount,
    method: body.method,
    accountName: body.accountName,
    accountNumber: body.accountNumber,
    bankName: body.bankName,
    network: body.network,
  });

  const risky = await checkWithdrawalRisk({
    userId: user.id,
    accountNumber: body.accountNumber,
    grossAmount: withdrawal.grossAmount,
    accountAgeMs: Date.now() - account.createdAt.getTime(),
  });

  if (risky) {
    await prisma.withdrawal.update({ where: { id: withdrawal.id }, data: { status: "UNDER_REVIEW" } });
  }

  if (body.saveAccount) {
    await prisma.payoutAccount
      .create({
        data: {
          userId: user.id,
          method: body.method,
          accountName: body.accountName,
          accountNumber: body.accountNumber,
          bankName: body.bankName,
          network: body.network,
        },
      })
      .catch(() => undefined); // already saved
  }

  await notify({
    userId: user.id,
    type: "WITHDRAWAL_SUBMITTED",
    title: "Withdrawal requested",
    body: `${formatMoney(withdrawal.netAmount)} is on its way to review. Reference ${withdrawal.reference}.`,
    href: "/dashboard/withdraw",
  });

  await audit({
    actorId: user.id,
    actorEmail: user.email,
    action: "withdrawal.create",
    entityType: "Withdrawal",
    entityId: withdrawal.id,
    after: { reference: withdrawal.reference, netAmount: withdrawal.netAmount, method: withdrawal.method },
  });

  return ok({ id: withdrawal.id, reference: withdrawal.reference, status: withdrawal.status }, { status: 201 });
});
