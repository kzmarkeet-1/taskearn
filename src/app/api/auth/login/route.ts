import { prisma } from "@/lib/prisma";
import { handler, ok, parseBody, guard, clientFingerprint, assertSameOrigin } from "@/lib/api";
import { loginSchema } from "@/lib/validation";
import { verifyPassword } from "@/lib/password";
import { createSession } from "@/lib/auth";
import { Err } from "@/lib/errors";
import { audit } from "@/lib/audit";

export const runtime = "nodejs";

export const POST = handler(async (request) => {
  await assertSameOrigin(request);
  const fingerprint = await clientFingerprint();
  const body = await parseBody(request, loginSchema);

  await guard("login", `${fingerprint.ip}:${body.email}`);

  const user = await prisma.user.findUnique({ where: { email: body.email } });

  // The same message either way, so the form cannot be used to discover which emails exist.
  const invalid = Err.unauthorized("That email and password do not match.");
  if (!user) throw invalid;

  const passwordOk = await verifyPassword(body.password, user.passwordHash);
  if (!passwordOk) {
    await audit({ actorEmail: body.email, action: "user.login_failed", entityType: "User", entityId: user.id });
    throw invalid;
  }

  if (user.status === "BANNED") {
    throw Err.forbidden("This account has been closed. Contact support if you believe that is a mistake.");
  }
  if (user.status === "SUSPENDED") {
    throw Err.forbidden("This account is suspended while it is reviewed. Contact support for the details.");
  }

  await createSession(user.id, user.role);
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date(), lastLoginIpHash: fingerprint.ipHash },
  });

  await audit({ actorId: user.id, actorEmail: user.email, action: "user.login", entityType: "User", entityId: user.id });

  return ok({ role: user.role, status: user.status });
});
