import { prisma } from "@/lib/prisma";
import { handler, ok, assertSameOrigin } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { Err } from "@/lib/errors";

export const runtime = "nodejs";

export const PATCH = handler(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  await assertSameOrigin(request);
  const user = await requireUser();
  const { id } = await context.params;

  const result = await prisma.notification.updateMany({
    where: { id, userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });

  if (result.count === 0) {
    const exists = await prisma.notification.findFirst({ where: { id, userId: user.id }, select: { id: true } });
    if (!exists) throw Err.notFound("That notification is not on your account.");
  }

  return ok({ read: true });
});
