import { prisma } from "@/lib/prisma";
import { handler, ok, parseBody, guard, assertSameOrigin } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { supportReplySchema } from "@/lib/validation";
import { Err } from "@/lib/errors";

export const runtime = "nodejs";

export const POST = handler(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  await assertSameOrigin(request);
  const user = await requireUser();
  await guard("support", user.id);

  const { id } = await context.params;
  const body = await parseBody(request, supportReplySchema);

  const ticket = await prisma.supportTicket.findUnique({ where: { id } });
  if (!ticket || ticket.userId !== user.id) throw Err.notFound("That ticket is not on your account.");
  if (ticket.status === "CLOSED") throw Err.conflict("This ticket is closed. Open a new one to continue.");

  await prisma.$transaction([
    prisma.supportMessage.create({ data: { ticketId: ticket.id, authorId: user.id, body: body.message } }),
    prisma.supportTicket.update({ where: { id: ticket.id }, data: { status: "OPEN" } }),
  ]);

  return ok({ replied: true });
});
