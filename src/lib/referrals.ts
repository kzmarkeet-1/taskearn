import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { getSettings } from "./settings";
import { creditReferralReward } from "./wallet";
import { notify } from "./notifications";
import { checkReferralVelocity } from "./fraud";

/**
 * Single-level referrals only.
 *
 * A referrer earns from the people they personally invite and from nobody else.
 * There is no downline, no tier, no commission on a referral's referrals, and
 * no reward for signing someone up on its own — the invited user has to do real
 * qualifying work first.
 */

export async function attachReferral(args: { refereeId: string; code: string }) {
  const settings = await getSettings();
  if (!settings.enableReferrals) return null;

  const referrer = await prisma.user.findUnique({
    where: { referralCode: args.code.toUpperCase() },
    select: { id: true, status: true },
  });

  if (!referrer || referrer.id === args.refereeId) return null;
  if (referrer.status !== "ACTIVE") return null;

  try {
    const referral = await prisma.referral.create({
      data: { referrerId: referrer.id, refereeId: args.refereeId, code: args.code.toUpperCase() },
    });
    await checkReferralVelocity(referrer.id);
    return referral;
  } catch (error) {
    // `refereeId` is unique, so a second attach for the same member loses the
    // race. That is the correct outcome — one member has one referrer — but it
    // must not surface as a failed registration.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return prisma.referral.findUnique({ where: { refereeId: args.refereeId } });
    }
    throw error;
  }
}

/**
 * Called after a referred user earns a reward. Pays the referrer once the
 * referee passes the qualifying threshold, then a capped share of subsequent
 * earnings.
 */
export async function handleRefereeEarning(args: {
  refereeId: string;
  rewardAmount: number;
  sourceKey: string;
}) {
  const settings = await getSettings();
  if (!settings.enableReferrals) return;

  const referral = await prisma.referral.findUnique({
    where: { refereeId: args.refereeId },
    include: { referrer: { select: { id: true, status: true } } },
  });
  if (!referral || referral.status === "REJECTED") return;
  if (referral.referrer.status !== "ACTIVE") return;

  const wallet = await prisma.wallet.findUnique({ where: { userId: args.refereeId } });
  const lifetimeEarned = wallet?.lifetimeEarned ?? 0;

  // Stage one: the one-off reward, paid the first time the referee qualifies.
  if (referral.status === "PENDING" && lifetimeEarned >= settings.referralQualifyingEarnings) {
    const result = await creditReferralReward({
      userId: referral.referrerId,
      amount: settings.referralReward,
      description: "Referral reward — an invited member reached the qualifying amount",
      idempotencyKey: `referral:${referral.id}:qualify`,
      referenceType: "referral",
      referenceId: referral.id,
    });

    if (!result.duplicate) {
      await prisma.referral.update({
        where: { id: referral.id },
        data: {
          status: "QUALIFIED",
          qualifiedAt: new Date(),
          rewardedAt: new Date(),
          rewardAmount: { increment: settings.referralReward },
        },
      });
      await notify({
        userId: referral.referrerId,
        type: "REWARD_CREDITED",
        title: "Referral reward on the way",
        body: "Someone you invited reached the qualifying amount. Your reward is pending verification.",
        href: "/dashboard/referrals",
      });
    }
    return;
  }

  // Stage two: a capped share of what the referee earns afterwards.
  if (referral.status !== "QUALIFIED" && referral.status !== "REWARDED") return;
  if (settings.referralPercentage <= 0) return;

  const share = Math.floor((args.rewardAmount * settings.referralPercentage) / 10_000);
  if (share <= 0) return;

  const headroom = settings.maximumReferralReward - referral.rewardAmount;
  if (headroom <= 0) return;

  const payable = Math.min(share, headroom);
  const result = await creditReferralReward({
    userId: referral.referrerId,
    amount: payable,
    description: "Referral share of an invited member's reward",
    idempotencyKey: `referral:${referral.id}:share:${args.sourceKey}`,
    referenceType: "referral",
    referenceId: referral.id,
  });

  if (!result.duplicate) {
    await prisma.referral.update({
      where: { id: referral.id },
      data: { status: "REWARDED", rewardAmount: { increment: payable }, rewardedAt: new Date() },
    });
  }
}

export async function getReferralSummary(userId: string) {
  const [user, referrals, earnings] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { referralCode: true } }),
    prisma.referral.findMany({
      where: { referrerId: userId },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { referee: { select: { fullName: true, createdAt: true, status: true } } },
    }),
    prisma.walletTransaction.aggregate({
      where: { userId, type: "REFERRAL_REWARD", amount: { gt: 0 }, bucket: "PENDING" },
      _sum: { amount: true },
    }),
  ]);

  const activeCount = referrals.filter((r) => r.status === "QUALIFIED" || r.status === "REWARDED").length;
  const totalEarned = referrals.reduce((sum, r) => sum + r.rewardAmount, 0);

  return {
    code: user.referralCode,
    link: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/register?ref=${user.referralCode}`,
    total: referrals.length,
    active: activeCount,
    totalEarned,
    pendingEarned: earnings._sum.amount ?? 0,
    referrals,
  };
}
