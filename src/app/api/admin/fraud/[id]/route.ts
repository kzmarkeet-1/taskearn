import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { handler, ok, parseBody, assertSameOrigin } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { recalculateRiskScore } from "@/lib/fraud";
import { audit } from "@/lib/audit";
import { Err } from "@/lib/errors";

export const runtime = "nodejs";

const schema = z.object({ resolved: z.boolean() });

export const PATCH = handler(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  await assertSameOrigin(request);
  const admin = await requireAdmin();
  const { id } = await context.params;
  const body = await parseBody(request, schema);

  const event = await prisma.fraudEvent.findUnique({ where: { id } });
  if (!event) throw Err.notFound("That signal does not exist.");

  await prisma.fraudEvent.update({
    where: { id },
    data: {
      resolvedAt: body.resolved ? new Date() : null,
      resolvedById: body.resolved ? admin.id : null,
    },
  });

  // Closing a signal changes the account's standing, so the score is rebuilt.
  if (event.userId) await recalculateRiskScore(event.userId);

  await audit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "admin.fraud.resolve",
    entityType: "FraudEvent",
    entityId: id,
    before: { resolvedAt: event.resolvedAt },
    after: { resolved: body.resolved },
  });

  return ok({ resolved: body.resolved });
});
