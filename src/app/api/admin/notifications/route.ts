import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { handler, ok, parseBody, assertSameOrigin } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { broadcastSchema } from "@/lib/validation";
import { notifyMany } from "@/lib/notifications";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";

export const POST = handler(async (request) => {
  await assertSameOrigin(request);
  const admin = await requireAdmin();
  const body = await parseBody(request, broadcastSchema);

  const where: Prisma.UserWhereInput = (() => {
    switch (body.audience) {
      case "ALL":
        return { role: "USER" };
      case "UNDER_REVIEW":
        return { role: "USER", status: "UNDER_REVIEW" };
      case "WITH_BALANCE":
        return { role: "USER", wallet: { availableBalance: { gt: 0 } } };
      default:
        return { role: "USER", status: "ACTIVE" };
    }
  })();

  const recipients = await prisma.user.findMany({ where, select: { id: true } });

  const result = await notifyMany(
    recipients.map((user) => user.id),
    {
      type: "SYSTEM_ANNOUNCEMENT",
      title: body.title,
      body: body.body,
      href: body.href || undefined,
      email: body.email,
    },
  );

  await audit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "admin.notifications.broadcast",
    entityType: "Notification",
    after: { audience: body.audience, title: body.title, recipients: result.count },
  });

  return ok({ count: result.count });
});
