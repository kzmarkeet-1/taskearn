import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startTaskSession, completeTaskSession } from "@/lib/tasks";
import { getBalances } from "@/lib/wallet";
import { seedSettings } from "@/lib/settings";
import { createTestUser, cleanupUser, prisma } from "./helpers";

let userId: string;
let campaignId: string;

beforeEach(async () => {
  await seedSettings();
  const user = await createTestUser();
  userId = user.id;

  const campaign = await prisma.campaign.create({
    data: {
      name: "Test campaign",
      advertiser: "Test advertiser",
      description: "A campaign used by the test suite.",
      videoUrl: "https://example.test/video",
      rewardAmount: 1_500,
      requiredWatchSeconds: 30,
      totalBudget: 150_000,
      dailyQuota: 100,
      totalQuota: 100,
      targetCountries: [],
      status: "ACTIVE",
      startDate: new Date(Date.now() - 3600_000),
      endDate: new Date(Date.now() + 7 * 24 * 3600_000),
    },
  });
  campaignId = campaign.id;
});

afterEach(async () => {
  await prisma.campaign.delete({ where: { id: campaignId } }).catch(() => undefined);
  await cleanupUser(userId);
});

describe("task timing is decided by the server", () => {
  it("rejects a completion submitted before the required watch time has elapsed", async () => {
    const { session } = await startTaskSession({ userId, country: "Pakistan", campaignId });

    // The client claims it watched the whole thing, but only moments have
    // passed on the server clock. The claim is worth nothing.
    await expect(
      completeTaskSession({
        userId,
        sessionId: session.id,
        nonce: session.nonce,
        reportedSeconds: 300,
      }),
    ).rejects.toThrow();

    const balances = await getBalances(userId);
    expect(balances.pendingBalance).toBe(0);
  });

  it("rejects a completion with the wrong session nonce", async () => {
    const { session } = await startTaskSession({ userId, country: "Pakistan", campaignId });

    await expect(
      completeTaskSession({
        userId,
        sessionId: session.id,
        nonce: "not-the-right-nonce",
        reportedSeconds: 60,
      }),
    ).rejects.toThrow();
  });

  it("rejects a completion for someone else's session", async () => {
    const { session } = await startTaskSession({ userId, country: "Pakistan", campaignId });
    const other = await createTestUser();

    await expect(
      completeTaskSession({
        userId: other.id,
        sessionId: session.id,
        nonce: session.nonce,
        reportedSeconds: 60,
      }),
    ).rejects.toThrow();

    await cleanupUser(other.id);
  });

  it("credits the reward once the server's own clock says enough time passed", async () => {
    const { session } = await startTaskSession({ userId, country: "Pakistan", campaignId });

    // Backdate the session rather than making the test wait 30 seconds.
    await prisma.taskSession.update({
      where: { id: session.id },
      data: { startedAt: new Date(Date.now() - 45_000), heartbeatCount: 3, watchedSeconds: 45 },
    });

    await completeTaskSession({
      userId,
      sessionId: session.id,
      nonce: session.nonce,
      reportedSeconds: 45,
    });

    const balances = await getBalances(userId);
    expect(balances.pendingBalance).toBe(1_500);
    expect(balances.availableBalance).toBe(0);
  });

  it("pays a campaign only once per member", async () => {
    const { session: first } = await startTaskSession({ userId, country: "Pakistan", campaignId });
    await prisma.taskSession.update({
      where: { id: first.id },
      data: { startedAt: new Date(Date.now() - 45_000), heartbeatCount: 3, watchedSeconds: 45 },
    });
    await completeTaskSession({
      userId,
      sessionId: first.id,
      nonce: first.nonce,
      reportedSeconds: 45,
    });

    await expect(startTaskSession({ userId, country: "Pakistan", campaignId })).rejects.toThrow();

    const balances = await getBalances(userId);
    expect(balances.pendingBalance).toBe(1_500);
  });
});

describe("campaign eligibility", () => {
  it("will not start a session on a paused campaign", async () => {
    await prisma.campaign.update({ where: { id: campaignId }, data: { status: "PAUSED" } });

    await expect(startTaskSession({ userId, country: "Pakistan", campaignId })).rejects.toThrow();
  });

  it("will not start a session once the budget is spent", async () => {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { spentBudget: 150_000 },
    });

    await expect(startTaskSession({ userId, country: "Pakistan", campaignId })).rejects.toThrow();
  });

  it("respects country targeting", async () => {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { targetCountries: ["Bangladesh"] },
    });

    await expect(startTaskSession({ userId, country: "Pakistan", campaignId })).rejects.toThrow();
  });
});
