import { prisma } from "@/lib/prisma";
import { handler, ok, parseBody, assertSameOrigin } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { z } from "zod";
import { notify } from "@/lib/notifications";
import { audit } from "@/lib/audit";
import { Err } from "@/lib/errors";

export const runtime = "nodejs";

const schema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "WAITING_FOR_USER", "RESOLVED", "CLOSED"]).optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH"]).optional(),
  reply: z.string().trim().min(1).max(4000).optional(),
});

export const PATCH = handler(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  await assertSameOrigin(request);
  const admin = await requireAdmin();
  const { id } = await context.params;
  const body = await parseBody(request, schema);

  const ticket = await prisma.supportTicket.findUnique({ where: { id } });
  if (!ticket) throw Err.notFound("That ticket does not exist.");

  if (body.reply) {
    await prisma.supportMessage.create({
      data: { ticketId: id, authorId: admin.id, isStaff: true, body: body.reply },
    });
    await notify({
      userId: ticket.userId,
      type: "SYSTEM_ANNOUNCEMENT",
      title: `Support replied to ${ticket.reference}`,
      body: "Open your support tab to read the reply.",
      href: "/dashboard/support",
    });
  }

  const updated = await prisma.supportTicket.update({
    where: { id },
    data: {
      ...(body.status ? { status: body.status } : body.reply ? { status: "WAITING_FOR_USER" } : {}),
      ...(body.priority ? { priority: body.priority } : {}),
      ...(body.status === "CLOSED" ? { closedAt: new Date() } : {}),
    },
  });

  await audit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "admin.support.update",
    entityType: "SupportTicket",
    entityId: id,
    before: { status: ticket.status },
    after: { status: updated.status, replied: Boolean(body.reply) },
  });

  return ok(updated);
});
