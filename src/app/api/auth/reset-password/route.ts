import { prisma } from "@/lib/prisma";
import { handler, ok, parseBody, guard, clientFingerprint, assertSameOrigin } from "@/lib/api";
import { resetPasswordSchema } from "@/lib/validation";
import { sha256 } from "@/lib/crypto";
import { hashPassword } from "@/lib/password";
import { revokeAllSessions } from "@/lib/auth";
import { Err } from "@/lib/errors";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notifications";

export const runtime = "nodejs";

export const POST = handler(async (request) => {
  await assertSameOrigin(request);
  const fingerprint = await clientFingerprint();
  await guard("passwordReset", fingerprint.ip);

  const body = await parseBody(request, resetPasswordSchema);

  const token = await prisma.verificationToken.findUnique({
    where: { tokenHash: sha256(body.token) },
    include: { user: { select: { id: true, email: true } } },
  });

  if (!token || token.purpose !== "PASSWORD_RESET" || token.consumedAt || token.expiresAt < new Date()) {
    throw Err.invalid("This reset link has expired. Request a new one.");
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: token.userId },
      data: { passwordHash: await hashPassword(body.password) },
    }),
    prisma.verificationToken.update({ where: { id: token.id }, data: { consumedAt: new Date() } }),
  ]);

  // Any session opened with the old password is no longer trusted.
  await revokeAllSessions(token.userId);

  await notify({
    userId: token.userId,
    type: "SECURITY_ALERT",
    title: "Your password was changed",
    body: "You have been signed out everywhere. If this was not you, contact support immediately.",
    email: true,
  });

  await audit({
    actorId: token.userId,
    actorEmail: token.user.email,
    action: "user.password_reset",
    entityType: "User",
    entityId: token.userId,
  });

  return ok({ reset: true });
});
