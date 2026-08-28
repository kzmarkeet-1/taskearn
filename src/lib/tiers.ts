import "server-only";
import type { UserTier } from "@prisma/client";
import { prisma } from "./prisma";
import { Err } from "./errors";
import { randomReference } from "./crypto";
import { notify } from "./notifications";
import { DEFAULT_TIER_PLANS, assertPlanIsNotYield, type TierEntitlements } from "./tier-plans";

/**
 * Membership tiers.
 *
 * A tier is a subscription to a larger daily allowance. A member pays a fixed
 * fee, gets a fixed term, and during that term may complete more tasks and
 * surveys per day. That is the whole product.
 *
 * Three invariants keep it a subscription rather than an investment, and every
 * one of them is enforced in code below rather than left to good intentions:
 *
 *  1. A tier grants CAPACITY, never money. Nothing is credited on purchase and
 *     nothing accrues for holding one. `activateSubscription` writes no reward.
 *  2. A tier must not be able to pay for itself. `assertPlanIsNotYield` refuses
 *     to activate a plan whose daily earnings cap could clear its own price
 *     inside the term — the point at which a subscription becomes a
 *     deposit-funded yield product, which is securities fraud in most
 *     jurisdictions and an instant termination under every card network's and
 *     survey provider's terms.
 *  3. Referral rewards are untouched by tier. A higher tier pays no downline
 *     commission and unlocks no recruitment bonus.
 */

export {
  TIER_ORDER,
  tierRank,
  DEFAULT_TIER_PLANS,
  assertPlanIsNotYield,
  type TierEntitlements,
} from "./tier-plans";

const FREE_FALLBACK: TierEntitlements = {
  tier: "FREE",
  planName: "Free",
  dailyTaskLimit: DEFAULT_TIER_PLANS[0].dailyTaskLimit,
  dailySurveyLimit: DEFAULT_TIER_PLANS[0].dailySurveyLimit,
  withdrawalFeeDiscountBps: 0,
  maxDailyEarnings: DEFAULT_TIER_PLANS[0].maxDailyEarnings,
  expiresAt: null,
};

export async function seedTierPlans() {
  for (const plan of DEFAULT_TIER_PLANS) {
    await prisma.tierPlan.upsert({
      where: { tier: plan.tier },
      update: {
        name: plan.name,
        description: plan.description,
        dailyTaskLimit: plan.dailyTaskLimit,
        dailySurveyLimit: plan.dailySurveyLimit,
        withdrawalFeeDiscountBps: plan.withdrawalFeeDiscountBps,
        maxDailyEarnings: plan.maxDailyEarnings,
        sortOrder: plan.sortOrder,
      },
      create: plan,
    });
  }
}

export async function listTierPlans() {
  const plans = await prisma.tierPlan.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } });
  return plans.length > 0 ? plans : [];
}

/**
 * What a member is entitled to right now.
 *
 * An expired `tierExpiresAt` is treated as FREE here as well as by the expiry
 * job. Relying on the job alone would leave a member on a paid allowance for
 * however long it takes the schedule to come round, which is the kind of gap
 * that only ever gets noticed in the wrong direction.
 */
export async function getEntitlements(userId: string): Promise<TierEntitlements> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { tier: true, tierExpiresAt: true },
  });
  if (!user) return FREE_FALLBACK;

  const lapsed = user.tier !== "FREE" && (!user.tierExpiresAt || user.tierExpiresAt <= new Date());
  const effective: UserTier = lapsed ? "FREE" : user.tier;

  const plan = await prisma.tierPlan.findUnique({ where: { tier: effective } });
  if (!plan) return { ...FREE_FALLBACK, tier: effective };

  return {
    tier: effective,
    planName: plan.name,
    dailyTaskLimit: plan.dailyTaskLimit,
    dailySurveyLimit: plan.dailySurveyLimit,
    withdrawalFeeDiscountBps: plan.withdrawalFeeDiscountBps,
    maxDailyEarnings: plan.maxDailyEarnings,
    expiresAt: lapsed ? null : user.tierExpiresAt,
  };
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export type DailyUsage = {
  tasksToday: number;
  taskLimit: number;
  tasksRemaining: number;
  surveysToday: number;
  surveyLimit: number;
  surveysRemaining: number;
  earnedToday: number;
  earningsCap: number;
};

export async function getDailyUsage(userId: string, entitlements?: TierEntitlements): Promise<DailyUsage> {
  const ent = entitlements ?? (await getEntitlements(userId));
  const since = startOfToday();

  const [tasksToday, surveysToday, earned] = await Promise.all([
    prisma.taskCompletion.count({ where: { userId, createdAt: { gte: since } } }),
    prisma.surveyCompletion.count({
      where: { userId, startedAt: { gte: since }, status: { in: ["STARTED", "COMPLETED"] } },
    }),
    prisma.walletTransaction.aggregate({
      where: {
        userId,
        createdAt: { gte: since },
        amount: { gt: 0 },
        type: { in: ["VIDEO_REWARD", "SURVEY_REWARD", "REFERRAL_REWARD", "BONUS"] },
        bucket: "PENDING",
      },
      _sum: { amount: true },
    }),
  ]);

  const earnedToday = earned._sum.amount ?? 0;

  return {
    tasksToday,
    taskLimit: ent.dailyTaskLimit,
    tasksRemaining: Math.max(0, ent.dailyTaskLimit - tasksToday),
    surveysToday,
    surveyLimit: ent.dailySurveyLimit,
    surveysRemaining: Math.max(0, ent.dailySurveyLimit - surveysToday),
    earnedToday,
    earningsCap: ent.maxDailyEarnings,
  };
}

/** Throws when the member has used up today's task allowance. */
export async function assertTaskAllowance(userId: string) {
  const ent = await getEntitlements(userId);
  const usage = await getDailyUsage(userId, ent);

  if (usage.tasksRemaining <= 0) {
    throw Err.conflict(
      `You have completed today's ${usage.taskLimit} tasks on the ${ent.planName} membership. Your allowance resets at midnight.`,
    );
  }
  if (ent.maxDailyEarnings > 0 && usage.earnedToday >= ent.maxDailyEarnings) {
    throw Err.conflict("You have reached today's earnings cap. It resets at midnight.");
  }
  return { entitlements: ent, usage };
}

/** Throws when the member has used up today's survey allowance. */
export async function assertSurveyAllowance(userId: string) {
  const ent = await getEntitlements(userId);
  const usage = await getDailyUsage(userId, ent);

  if (usage.surveysRemaining <= 0) {
    throw Err.conflict(
      `You have started today's ${usage.surveyLimit} surveys on the ${ent.planName} membership. Your allowance resets at midnight.`,
    );
  }
  return { entitlements: ent, usage };
}

/**
 * Turns a paid subscription on.
 *
 * Deliberately writes no wallet movement. Buying a tier does not credit
 * anything — it raises a limit. If a future change makes this function touch
 * the ledger in the member's favour, the product has stopped being a
 * subscription and the invariants at the top of this file no longer hold.
 */
export async function activateSubscription(args: {
  userId: string;
  tier: UserTier;
  pricePaid: number;
  paidFrom: "wallet" | "deposit";
  depositId?: string;
}) {
  const plan = await prisma.tierPlan.findUnique({ where: { tier: args.tier } });
  if (!plan || !plan.active) throw Err.notFound("That membership is not available.");
  assertPlanIsNotYield(plan);

  const now = new Date();

  // Stacking on an unexpired term extends it rather than discarding what is
  // left. Silently shortening a member's paid time is the kind of thing that
  // shows up as a support ticket and a chargeback.
  const current = await prisma.user.findUnique({
    where: { id: args.userId },
    select: { tier: true, tierExpiresAt: true },
  });
  const carryOver =
    current && current.tier === args.tier && current.tierExpiresAt && current.tierExpiresAt > now
      ? current.tierExpiresAt.getTime()
      : now.getTime();
  const expiresAt = new Date(carryOver + plan.durationDays * 24 * 3600_000);

  const subscription = await prisma.$transaction(async (tx) => {
    // Close any live subscription on a different tier so history stays readable.
    await tx.tierSubscription.updateMany({
      where: { userId: args.userId, status: "ACTIVE" },
      data: { status: "CANCELLED", cancelledAt: now },
    });

    const row = await tx.tierSubscription.create({
      data: {
        userId: args.userId,
        planId: plan.id,
        tier: plan.tier,
        status: "ACTIVE",
        pricePaid: args.pricePaid,
        paidFrom: args.paidFrom,
        startedAt: now,
        expiresAt,
        reference: randomReference("SUB"),
        depositId: args.depositId,
      },
    });

    await tx.user.update({
      where: { id: args.userId },
      data: { tier: plan.tier, tierExpiresAt: expiresAt },
    });

    return row;
  });

  await notify({
    userId: args.userId,
    type: "TIER_ACTIVATED",
    title: `${plan.name} membership active`,
    body: `You can now complete up to ${plan.dailyTaskLimit} tasks and ${plan.dailySurveyLimit} surveys a day until ${expiresAt.toDateString()}.`,
    href: "/dashboard/membership",
  });

  return subscription;
}

/**
 * Moves lapsed members back to FREE. Safe to run repeatedly.
 *
 * The update is guarded on the same condition it selects on, so two overlapping
 * runs cannot both act on one member.
 */
export async function expireSubscriptions() {
  const now = new Date();

  const lapsed = await prisma.tierSubscription.findMany({
    where: { status: "ACTIVE", expiresAt: { lte: now } },
    select: { id: true, userId: true, tier: true },
    take: 500,
  });

  let expired = 0;
  for (const sub of lapsed) {
    const moved = await prisma.tierSubscription.updateMany({
      where: { id: sub.id, status: "ACTIVE" },
      data: { status: "EXPIRED" },
    });
    if (moved.count === 0) continue;

    await prisma.user.updateMany({
      where: { id: sub.userId, tierExpiresAt: { lte: now } },
      data: { tier: "FREE", tierExpiresAt: null },
    });

    await notify({
      userId: sub.userId,
      type: "TIER_EXPIRED",
      title: "Your membership has ended",
      body: "You are back on the Free allowance. Your balance and earnings history are unchanged.",
      href: "/dashboard/membership",
    });
    expired += 1;
  }

  // Belt and braces: a user row whose expiry passed but whose subscription row
  // was lost or never written should not keep a paid allowance.
  const orphaned = await prisma.user.updateMany({
    where: { tier: { not: "FREE" }, tierExpiresAt: { lte: now } },
    data: { tier: "FREE", tierExpiresAt: null },
  });

  return { expired, orphaned: orphaned.count };
}

/** Warns members three days out so a lapse is never a surprise. */
export async function notifyExpiringSubscriptions() {
  const now = new Date();
  const soon = new Date(now.getTime() + 3 * 24 * 3600_000);

  const ending = await prisma.tierSubscription.findMany({
    where: { status: "ACTIVE", expiresAt: { gt: now, lte: soon } },
    select: { userId: true, tier: true, expiresAt: true },
    take: 500,
  });

  let notified = 0;
  for (const sub of ending) {
    const already = await prisma.notification.findFirst({
      where: { userId: sub.userId, type: "TIER_EXPIRING", createdAt: { gte: new Date(now.getTime() - 3 * 24 * 3600_000) } },
      select: { id: true },
    });
    if (already) continue;

    await notify({
      userId: sub.userId,
      type: "TIER_EXPIRING",
      title: "Your membership ends soon",
      body: `Your ${sub.tier.toLowerCase()} membership ends on ${sub.expiresAt?.toDateString()}. Renew if you want to keep the larger daily allowance.`,
      href: "/dashboard/membership",
    });
    notified += 1;
  }

  return { notified };
}
