import { prisma } from "@/lib/prisma";
import { handler, ok, parseBody, assertSameOrigin } from "@/lib/api";
import { requireAdmin, revokeAllSessions } from "@/lib/auth";
import { adminUserUpdateSchema } from "@/lib/validation";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notifications";
import { Err } from "@/lib/errors";

export const runtime = "nodejs";

export const GET = handler(async (_request: Request, context: { params: Promise<{ id: string }> }) => {
  await requireAdmin();
  const { id } = await context.params;

  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      wallet: true,
      riskScore: true,
      profile: true,
      referralsMade: { include: { referee: { select: { fullName: true } } }, take: 25 },
      transactions: { orderBy: { createdAt: "desc" }, take: 25 },
      withdrawals: { orderBy: { createdAt: "desc" }, take: 25 },
      taskCompletions: { orderBy: { createdAt: "desc" }, take: 25, include: { campaign: { select: { name: true } } } },
      surveyCompletions: { orderBy: { createdAt: "desc" }, take: 25, include: { provider: { select: { name: true } } } },
      fraudEvents: { orderBy: { createdAt: "desc" }, take: 25 },
    },
  });

  if (!user) throw Err.notFound("That user does not exist.");

  const { passwordHash: _ignored, ...safe } = user;
  return ok(safe);
});

export const PATCH = handler(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  await assertSameOrigin(request);
  const admin = await requireAdmin();
  const { id } = await context.params;
  const body = await parseBody(request, adminUserUpdateSchema);

  const before = await prisma.user.findUnique({ where: { id }, select: { status: true, emailVerifiedAt: true } });
  if (!before) throw Err.notFound("That user does not exist.");

  const user = await prisma.user.update({
    where: { id },
    data: {
      ...(body.status ? { status: body.status } : {}),
      ...(body.verifyEmail ? { emailVerifiedAt: new Date() } : {}),
    },
    select: { id: true, status: true, email: true, emailVerifiedAt: true },
  });

  // A suspended or banned account should not keep a live session.
  if (body.status === "SUSPENDED" || body.status === "BANNED") {
    await revokeAllSessions(id);
    await notify({
      userId: id,
      type: "SECURITY_ALERT",
      title: body.status === "BANNED" ? "Your account has been closed" : "Your account has been suspended",
      body: body.note ?? "Open a support ticket if you would like this reviewed.",
      email: true,
    });
  }

  await audit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "admin.user.update",
    entityType: "User",
    entityId: id,
    before,
    after: { status: user.status, emailVerifiedAt: user.emailVerifiedAt, note: body.note },
  });

  return ok(user);
});
