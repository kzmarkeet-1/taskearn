import { describe, expect, it } from "vitest";
import { assertPlanIsNotYield, tierRank, TIER_ORDER, DEFAULT_TIER_PLANS } from "@/lib/tier-plans";

/**
 * The guard that keeps a membership a membership.
 *
 * If a tier can repay its own price by being held, the fee has stopped buying a
 * service and started buying a return — the structure regulators call a Ponzi
 * scheme, funded by whoever pays in next. That is not a configuration this
 * codebase will run, so the refusal is tested like any other rule.
 */
describe("membership plans cannot become an investment product", () => {
  it("accepts every shipped default", () => {
    for (const plan of DEFAULT_TIER_PLANS) {
      expect(() => assertPlanIsNotYield(plan)).not.toThrow();
    }
  });

  it("ignores the free tier, which has no price or term", () => {
    expect(() =>
      assertPlanIsNotYield({ tier: "FREE", priceAmount: 0, durationDays: 0, maxDailyEarnings: 15_000 }),
    ).not.toThrow();
  });

  it("refuses a tier whose earnings cap sits below its own price", () => {
    // Nobody could ever come out ahead, so this is either a typo or a trap.
    expect(() =>
      assertPlanIsNotYield({ tier: "GOLD", priceAmount: 500_000, durationDays: 30, maxDailyEarnings: 1_000 }),
    ).toThrow(/caps earnings below its own price/);
  });

  it("leaves a wide-margin plan alone", () => {
    // Cheap relative to what the member could earn by working: that is a
    // subscription doing its job, not a yield.
    expect(() =>
      assertPlanIsNotYield({ tier: "SILVER", priceAmount: 50_000, durationDays: 30, maxDailyEarnings: 30_000 }),
    ).not.toThrow();
  });
});

describe("tier ordering", () => {
  it("ranks tiers from free upward", () => {
    expect(TIER_ORDER).toEqual(["FREE", "SILVER", "GOLD", "DIAMOND"]);
    expect(tierRank("DIAMOND")).toBeGreaterThan(tierRank("SILVER"));
    expect(tierRank("FREE")).toBe(0);
  });
});
