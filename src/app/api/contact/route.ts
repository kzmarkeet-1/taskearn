import { prisma } from "@/lib/prisma";
import { handler, ok, parseBody, guard, clientFingerprint, assertSameOrigin } from "@/lib/api";
import { contactSchema } from "@/lib/validation";
import { randomReference } from "@/lib/crypto";
import { getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

/**
 * Public contact form. A signed-in sender gets a real support ticket so the
 * thread stays with their account; anyone else is recorded as an audit entry
 * for the team to pick up.
 */
export const POST = handler(async (request) => {
  await assertSameOrigin(request);
  const fingerprint = await clientFingerprint();
  await guard("support", fingerprint.ip);

  const body = await parseBody(request, contactSchema);
  const user = await getCurrentUser();

  if (user) {
    const ticket = await prisma.supportTicket.create({
      data: {
        userId: user.id,
        reference: randomReference("TK"),
        subject: body.subject,
        messages: { create: { authorId: user.id, body: body.message } },
      },
    });
    return ok({ ticketReference: ticket.reference });
  }

  await prisma.auditLog.create({
    data: {
      actorEmail: body.email,
      action: "contact.message",
      entityType: "ContactMessage",
      after: { name: body.name, subject: body.subject, message: body.message },
    },
  });

  return ok({ received: true });
});
