import { handler, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getDailyUsage, getEntitlements, listTierPlans } from "@/lib/tiers";
import { gatewayStatuses } from "@/lib/payments";

export const runtime = "nodejs";

/** The membership catalogue, plus where the member currently stands. */
export const GET = handler(async () => {
  const user = await requireUser();
  const [plans, entitlements] = await Promise.all([listTierPlans(), getEntitlements(user.id)]);
  const usage = await getDailyUsage(user.id, entitlements);

  return ok({
    plans: plans.map((plan) => ({
      tier: plan.tier,
      name: plan.name,
      description: plan.description,
      priceAmount: plan.priceAmount,
      durationDays: plan.durationDays,
      dailyTaskLimit: plan.dailyTaskLimit,
      dailySurveyLimit: plan.dailySurveyLimit,
      withdrawalFeeDiscountBps: plan.withdrawalFeeDiscountBps,
      maxDailyEarnings: plan.maxDailyEarnings,
      current: plan.tier === entitlements.tier,
    })),
    current: {
      tier: entitlements.tier,
      planName: entitlements.planName,
      expiresAt: entitlements.expiresAt,
    },
    usage,
    paymentMethods: gatewayStatuses(),
  });
});
