import { prisma } from "@/lib/prisma";
import { handler, ok, assertSameOrigin } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { Err } from "@/lib/errors";

export const runtime = "nodejs";

export const PATCH = handler(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  await assertSameOrigin(request);
  const user = await requireUser();
  const { id } = await context.params;

  const result = await prisma.supportTicket.updateMany({
    where: { id, userId: user.id, status: { not: "CLOSED" } },
    data: { status: "CLOSED", closedAt: new Date() },
  });

  if (result.count === 0) throw Err.notFound("That ticket is not open on your account.");
  return ok({ closed: true });
});
