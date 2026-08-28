import { prisma } from "@/lib/prisma";
import { handler, ok } from "@/lib/api";
import { sha256, randomToken } from "@/lib/crypto";
import { requireUser } from "@/lib/auth";
import { Err } from "@/lib/errors";
import { notify } from "@/lib/notifications";

export const runtime = "nodejs";

/** Issues a verification token for the signed-in user. */
export const POST = handler(async () => {
  const user = await requireUser();
  if (user.emailVerifiedAt) return ok({ alreadyVerified: true });

  const raw = randomToken(32);
  await prisma.verificationToken.create({
    data: {
      userId: user.id,
      tokenHash: sha256(raw),
      purpose: "EMAIL_VERIFICATION",
      expiresAt: new Date(Date.now() + 24 * 3600_000),
    },
  });

  await notify({
    userId: user.id,
    type: "SECURITY_ALERT",
    title: "Confirm your email address",
    body: "We have queued a confirmation link to your inbox.",
    email: true,
  });

  const verifyUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/auth/verify-email?token=${raw}`;
  const exposeLink = process.env.NODE_ENV !== "production" && !process.env.EMAIL_PROVIDER_API_KEY;

  return ok({ queued: true, ...(exposeLink ? { verifyUrl } : {}) });
});

/** Consumes a verification token from the emailed link. */
export const GET = handler(async (request) => {
  const url = new URL(request.url);
  const raw = url.searchParams.get("token");
  if (!raw) throw Err.invalid("That confirmation link is incomplete.");

  const token = await prisma.verificationToken.findUnique({ where: { tokenHash: sha256(raw) } });
  if (!token || token.purpose !== "EMAIL_VERIFICATION" || token.consumedAt || token.expiresAt < new Date()) {
    throw Err.invalid("This confirmation link has expired. Request a new one from your dashboard.");
  }

  await prisma.$transaction([
    prisma.user.update({ where: { id: token.userId }, data: { emailVerifiedAt: new Date() } }),
    prisma.verificationToken.update({ where: { id: token.id }, data: { consumedAt: new Date() } }),
  ]);

  return ok({ verified: true });
});
