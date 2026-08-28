import { prisma } from "@/lib/prisma";
import { handler, ok, parseBody, assertSameOrigin } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { adminAdjustmentSchema } from "@/lib/validation";
import { adminAdjustment } from "@/lib/wallet";
import { notify } from "@/lib/notifications";
import { audit } from "@/lib/audit";
import { Err } from "@/lib/errors";
import { formatMoney } from "@/lib/money";

export const runtime = "nodejs";

export const POST = handler(async (request) => {
  await assertSameOrigin(request);
  const admin = await requireAdmin();
  const body = await parseBody(request, adminAdjustmentSchema);

  const user = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() }, select: { id: true } });
  if (!user) throw Err.notFound("No account uses that email address.");

  const transaction = await adminAdjustment({
    userId: user.id,
    amount: body.amount,
    bucket: body.bucket,
    reason: body.reason,
    adminId: admin.id,
    requestId: body.requestId,
  });

  await notify({
    userId: user.id,
    type: "SYSTEM_ANNOUNCEMENT",
    title: body.amount > 0 ? "A credit was added to your wallet" : "An adjustment was made to your wallet",
    body: `${formatMoney(Math.abs(body.amount))} — ${body.reason}`,
    href: "/dashboard/wallet",
    email: true,
  });

  await audit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "admin.wallet.adjust",
    entityType: "Wallet",
    entityId: user.id,
    after: { amount: body.amount, reason: body.reason, transactionId: transaction.id },
  });

  return ok({ transactionId: transaction.id });
});
