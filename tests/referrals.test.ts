import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { attachReferral, handleRefereeEarning, getReferralSummary } from "@/lib/referrals";
import { getBalances } from "@/lib/wallet";
import { getSettings, seedSettings } from "@/lib/settings";
import { createTestUser, cleanupUser, prisma } from "./helpers";

let referrerId: string;
let refereeId: string;
let thirdId: string;
let referrerCode: string;
let refereeCode: string;

beforeEach(async () => {
  await seedSettings();
  const referrer = await createTestUser();
  const referee = await createTestUser();
  const third = await createTestUser();
  referrerId = referrer.id;
  refereeId = referee.id;
  thirdId = third.id;
  referrerCode = referrer.referralCode;
  refereeCode = referee.referralCode;
});

afterEach(async () => {
  await cleanupUser(referrerId);
  await cleanupUser(refereeId);
  await cleanupUser(thirdId);
});

describe("attaching a referral", () => {
  it("links a new member to the person who invited them", async () => {
    const referral = await attachReferral({ refereeId, code: referrerCode });
    expect(referral?.referrerId).toBe(referrerId);
  });

  it("refuses a self-referral", async () => {
    const referral = await attachReferral({ refereeId, code: refereeCode });
    expect(referral).toBeNull();
  });

  it("ignores an unknown code rather than failing the sign-up", async () => {
    const referral = await attachReferral({ refereeId, code: "NOSUCHCODE" });
    expect(referral).toBeNull();
  });
});

describe("the programme stays one level deep", () => {
  it("pays the direct referrer and nobody above them", async () => {
    // referrer → referee → third. Only the middle link should ever pay.
    await attachReferral({ refereeId, code: referrerCode });
    await attachReferral({ refereeId: thirdId, code: refereeCode });

    const settings = await getSettings();

    // The third member earns enough to qualify their own referrer.
    await handleRefereeEarning({
      refereeId: thirdId,
      rewardAmount: settings.referralQualifyingEarnings * 2,
      sourceKey: randomUUID(),
    });

    const refereeBalances = await getBalances(refereeId);
    const referrerBalances = await getBalances(referrerId);

    // The direct referrer of `third` is `referee`, who gets paid.
    expect(refereeBalances.pendingBalance + refereeBalances.referralBalance).toBeGreaterThan(0);

    // The referrer sits one level further up and must receive nothing from it.
    expect(referrerBalances.pendingBalance + referrerBalances.referralBalance).toBe(0);
  });

  it("has no second-tier relationship anywhere in the data", async () => {
    await attachReferral({ refereeId, code: referrerCode });
    await attachReferral({ refereeId: thirdId, code: refereeCode });

    // A referral row points at exactly one referrer and one referee. There is
    // no parent chain to walk, which is what makes a downline impossible.
    const rows = await prisma.referral.findMany({
      where: { refereeId: { in: [refereeId, thirdId] } },
    });

    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.refereeId)).size).toBe(2);
  });
});

describe("qualifying thresholds", () => {
  it("pays nothing until the invited member has earned enough", async () => {
    await attachReferral({ refereeId, code: referrerCode });
    const settings = await getSettings();

    await handleRefereeEarning({
      refereeId,
      rewardAmount: Math.floor(settings.referralQualifyingEarnings / 4),
      sourceKey: randomUUID(),
    });

    const balances = await getBalances(referrerId);
    expect(balances.pendingBalance + balances.referralBalance).toBe(0);

    const summary = await getReferralSummary(referrerId);
    expect(summary.active).toBe(0);
  });

  it("does not pay the same qualifying bonus twice", async () => {
    await attachReferral({ refereeId, code: referrerCode });
    const settings = await getSettings();

    const earn = () =>
      handleRefereeEarning({
        refereeId,
        rewardAmount: settings.referralQualifyingEarnings * 2,
        sourceKey: randomUUID(),
      });

    await earn();
    const afterFirst = await getBalances(referrerId);

    await earn();
    const afterSecond = await getBalances(referrerId);

    const firstTotal = afterFirst.pendingBalance + afterFirst.referralBalance;
    const secondTotal = afterSecond.pendingBalance + afterSecond.referralBalance;

    // The percentage share may add a little; the one-off bonus must not repeat.
    expect(secondTotal - firstTotal).toBeLessThan(settings.referralReward);
  });
});
