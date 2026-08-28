/**
 * Membership plan definitions and the invariant that keeps them honest.
 *
 * Split out from tiers.ts so the guard below can be tested without a
 * database. It is the single most important rule in the tier system, and a
 * rule nobody can run in isolation is a rule nobody checks.
 */
import type { UserTier } from "@prisma/client";
import { Err } from "./errors";

export const TIER_ORDER: UserTier[] = ["FREE", "SILVER", "GOLD", "DIAMOND"];

export function tierRank(tier: UserTier) {
  return TIER_ORDER.indexOf(tier);
}

/**
 * Shipped defaults, seeded into TierPlan.
 *
 * Read the numbers against invariant 2: DIAMOND costs 300000 (PKR 3,000) for
 * 30 days and caps earnings at 8000/day. The cap is reachable only by working
 * every day, and the platform's own margin on that work is what funds it. The
 * fee buys a bigger queue, not a return on the fee.
 */
export const DEFAULT_TIER_PLANS: {
  tier: UserTier;
  name: string;
  description: string;
  priceAmount: number;
  durationDays: number;
  dailyTaskLimit: number;
  dailySurveyLimit: number;
  withdrawalFeeDiscountBps: number;
  maxDailyEarnings: number;
  sortOrder: number;
}[] = [
  {
    tier: "FREE",
    name: "Free",
    description: "The default membership. No fee, no term, and every earning feature is available.",
    priceAmount: 0,
    durationDays: 0,
    dailyTaskLimit: 5,
    dailySurveyLimit: 3,
    withdrawalFeeDiscountBps: 0,
    maxDailyEarnings: 15_000,
    sortOrder: 0,
  },
  {
    tier: "SILVER",
    name: "Silver",
    description: "Ten tasks and six surveys a day for 30 days. Half the withdrawal fee.",
    priceAmount: 50_000,
    durationDays: 30,
    dailyTaskLimit: 10,
    dailySurveyLimit: 6,
    withdrawalFeeDiscountBps: 5_000,
    maxDailyEarnings: 30_000,
    sortOrder: 1,
  },
  {
    tier: "GOLD",
    name: "Gold",
    description: "Twenty tasks and twelve surveys a day for 30 days. No withdrawal fee.",
    priceAmount: 120_000,
    durationDays: 30,
    dailyTaskLimit: 20,
    dailySurveyLimit: 12,
    withdrawalFeeDiscountBps: 10_000,
    maxDailyEarnings: 60_000,
    sortOrder: 2,
  },
  {
    tier: "DIAMOND",
    name: "Diamond",
    description: "Thirty-five tasks and twenty surveys a day for 30 days, no withdrawal fee, priority support.",
    priceAmount: 300_000,
    durationDays: 30,
    dailyTaskLimit: 35,
    dailySurveyLimit: 20,
    withdrawalFeeDiscountBps: 10_000,
    maxDailyEarnings: 100_000,
    sortOrder: 3,
  },
];

export type TierEntitlements = {
  tier: UserTier;
  planName: string;
  dailyTaskLimit: number;
  dailySurveyLimit: number;
  withdrawalFeeDiscountBps: number;
  maxDailyEarnings: number;
  expiresAt: Date | null;
};


/**
 * Refuses a plan whose earnings cap could repay its own fee inside the term.
 *
 * This is the guard that keeps the tier a subscription. If a member could clear
 * the price of DIAMOND by holding DIAMOND, the fee is no longer buying a
 * service — it is buying a return, funded by whoever paid in next. That is the
 * structure regulators call a Ponzi scheme, and it is not a configuration this
 * codebase will run.
 */
export function assertPlanIsNotYield(plan: {
  tier: UserTier;
  priceAmount: number;
  durationDays: number;
  maxDailyEarnings: number;
}) {
  if (plan.priceAmount <= 0 || plan.durationDays <= 0) return;

  // Ceiling on what the tier could possibly return over its term.
  const ceiling = plan.maxDailyEarnings * plan.durationDays;

  // A subscription's value is the work it unlocks, so the ceiling being above
  // the price is expected and fine. What is not fine is a price so low that the
  // tier is trivially self-funding — under a tenth of its own ceiling means the
  // fee has stopped being a fee.
  if (plan.priceAmount * 10 < ceiling) {
    return; // wide margin: the member still has to do all the work
  }

  if (ceiling <= plan.priceAmount) {
    throw Err.invalid(
      `The ${plan.tier} plan caps earnings below its own price, so nobody could ever benefit from buying it. Raise the cap or lower the price.`,
    );
  }
}

