import { prisma } from "@/lib/prisma";
import { handler, ok, parseBody, guard, clientFingerprint, assertSameOrigin } from "@/lib/api";
import { registerSchema } from "@/lib/validation";
import { hashPassword } from "@/lib/password";
import { generateReferralCode } from "@/lib/crypto";
import { createSession } from "@/lib/auth";
import { Err } from "@/lib/errors";
import { attachReferral } from "@/lib/referrals";
import { notify } from "@/lib/notifications";
import { audit } from "@/lib/audit";
import { checkSignupVelocity } from "@/lib/fraud";

export const runtime = "nodejs";

export const POST = handler(async (request) => {
  await assertSameOrigin(request);
  const fingerprint = await clientFingerprint();
  await guard("register", fingerprint.ip);

  const body = await parseBody(request, registerSchema);

  const existing = await prisma.user.findUnique({ where: { email: body.email } });
  if (existing) {
    throw Err.conflict("An account already uses that email. Sign in instead, or reset your password.");
  }

  // Referral codes are random; retry on the rare collision.
  let referralCode = generateReferralCode();
  for (let attempt = 0; attempt < 5; attempt++) {
    const taken = await prisma.user.findUnique({ where: { referralCode }, select: { id: true } });
    if (!taken) break;
    referralCode = generateReferralCode();
  }

  const user = await prisma.user.create({
    data: {
      fullName: body.fullName,
      email: body.email,
      phone: body.phone,
      country: body.country,
      passwordHash: await hashPassword(body.password),
      referralCode,
      referredByCode: body.referralCode || null,
      profile: { create: {} },
      wallet: { create: {} },
    },
  });

  if (body.referralCode) {
    await attachReferral({ refereeId: user.id, code: body.referralCode });
  }

  await createSession(user.id, user.role);
  await checkSignupVelocity(fingerprint.ipHash);

  await notify({
    userId: user.id,
    type: "SYSTEM_ANNOUNCEMENT",
    title: "Welcome to TaskEarn",
    body: "Your account is ready. Open Video tasks to see what is available to you right now.",
    href: "/dashboard/tasks",
  });

  await audit({
    actorId: user.id,
    actorEmail: user.email,
    action: "user.register",
    entityType: "User",
    entityId: user.id,
  });

  return ok({ id: user.id, referralCode: user.referralCode }, { status: 201 });
});
