import { prisma } from "@/lib/prisma";
import { handler, ok, parseBody, guard, clientFingerprint, assertSameOrigin } from "@/lib/api";
import { forgotPasswordSchema } from "@/lib/validation";
import { randomToken, sha256 } from "@/lib/crypto";
import { notify } from "@/lib/notifications";

export const runtime = "nodejs";

/**
 * Always answers the same way, whether or not the email exists, so the
 * endpoint cannot be used to enumerate accounts.
 */
export const POST = handler(async (request) => {
  await assertSameOrigin(request);
  const fingerprint = await clientFingerprint();
  await guard("passwordReset", fingerprint.ip);

  const body = await parseBody(request, forgotPasswordSchema);
  const user = await prisma.user.findUnique({ where: { email: body.email } });

  if (!user) return ok({ sent: true });

  const raw = randomToken(32);
  await prisma.verificationToken.create({
    data: {
      userId: user.id,
      tokenHash: sha256(raw),
      purpose: "PASSWORD_RESET",
      expiresAt: new Date(Date.now() + 3600_000),
    },
  });

  const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/reset-password?token=${raw}`;

  await notify({
    userId: user.id,
    type: "SECURITY_ALERT",
    title: "Password reset requested",
    body: "If this was not you, sign in and change your password.",
    email: true,
  });

  // With no email provider wired, development returns the link so the flow is testable.
  const exposeLink = process.env.NODE_ENV !== "production" && !process.env.EMAIL_PROVIDER_API_KEY;
  return ok({ sent: true, ...(exposeLink ? { resetUrl } : {}) });
});
