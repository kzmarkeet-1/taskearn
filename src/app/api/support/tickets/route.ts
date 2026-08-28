import { prisma } from "@/lib/prisma";
import { handler, ok, parseBody, guard, assertSameOrigin } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { supportTicketSchema } from "@/lib/validation";
import { randomReference } from "@/lib/crypto";

export const runtime = "nodejs";

export const GET = handler(async () => {
  const user = await requireUser();
  const tickets = await prisma.supportTicket.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  return ok({ tickets });
});

export const POST = handler(async (request) => {
  await assertSameOrigin(request);
  const user = await requireUser();
  await guard("support", user.id);

  const body = await parseBody(request, supportTicketSchema);

  const ticket = await prisma.supportTicket.create({
    data: {
      userId: user.id,
      reference: randomReference("TK"),
      subject: body.subject,
      category: body.category,
      messages: { create: { authorId: user.id, body: body.message } },
    },
  });

  return ok({ id: ticket.id, reference: ticket.reference }, { status: 201 });
});
