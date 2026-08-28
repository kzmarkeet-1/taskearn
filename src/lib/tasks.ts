import "server-only";
import { prisma } from "./prisma";
import { Err } from "./errors";
import { randomToken } from "./crypto";
import { getSettings } from "./settings";
import { creditPendingReward } from "./wallet";
import { notify } from "./notifications";
import { handleRefereeEarning } from "./referrals";
import { checkTaskSpeed } from "./fraud";
import { assertTaskAllowance, getEntitlements } from "./tiers";
import {
  explainRejection,
  finaliseIntegrity,
  recordTrackedHeartbeat,
  type HeartbeatReport,
} from "./integrity";

/**
 * Sponsored video tasks.
 *
 * What this system does: shows a user a campaign the advertiser has paid to
 * promote, opens the video, and pays the user once the session has been open
 * for the required time.
 *
 * What it deliberately does not do: automate playback, drive traffic through
 * headless browsers, simulate watch time, click, like, subscribe, or comment on
 * the user's behalf, or work around any platform's fraud controls. Sessions are
 * measured by heartbeats from a real person's open tab and nothing else, and
 * the reward is for the person's attention, not for a metric on someone else's
 * platform.
 *
 * Two limits bound a session before it starts: the campaign's own quota, and
 * the member's daily allowance from their membership tier (src/lib/tiers.ts).
 * Once it starts, the window tracker in src/lib/integrity.ts decides whether
 * the time counted.
 */

const SESSION_TTL_MS = 2 * 3600_000;

export async function listAvailableCampaigns(user: { id: string; country: string }) {
  const settings = await getSettings();
  if (!settings.enableVideoTasks) {
    return { campaigns: [], disabled: true as const, allowance: null };
  }

  const now = new Date();
  const campaigns = await prisma.campaign.findMany({
    where: {
      status: "ACTIVE",
      startDate: { lte: now },
      endDate: { gte: now },
    },
    orderBy: { rewardAmount: "desc" },
    take: 60,
  });

  const completions = await prisma.taskCompletion.findMany({
    where: { userId: user.id },
    select: { campaignId: true },
  });
  const done = new Set(completions.map((c) => c.campaignId));

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const dailyCounts = await prisma.taskCompletion.groupBy({
    by: ["campaignId"],
    where: { campaignId: { in: campaigns.map((c) => c.id) }, createdAt: { gte: startOfDay } },
    _count: { _all: true },
  });
  const dailyMap = new Map(dailyCounts.map((d) => [d.campaignId, d._count._all]));

  // The member's own allowance for today, so the list can say "3 of 10 left"
  // rather than letting them start a task that will be refused on submit.
  const entitlements = await getEntitlements(user.id);
  const usedToday = await prisma.taskCompletion.count({
    where: { userId: user.id, createdAt: { gte: startOfDay } },
  });
  const allowanceLeft = Math.max(0, entitlements.dailyTaskLimit - usedToday);

  return {
    disabled: false as const,
    allowance: {
      tier: entitlements.tier,
      planName: entitlements.planName,
      used: usedToday,
      limit: entitlements.dailyTaskLimit,
      remaining: allowanceLeft,
    },
    campaigns: campaigns.map((c) => {
      const usedToday = dailyMap.get(c.id) ?? 0;
      const remainingQuota = Math.max(0, Math.min(c.totalQuota - c.completedCount, c.dailyQuota - usedToday));
      const budgetLeft = c.totalBudget - c.spentBudget >= c.rewardAmount;
      const countryOk = c.targetCountries.length === 0 || c.targetCountries.includes(user.country);
      const completed = done.has(c.id);
      const allowanceOk = allowanceLeft > 0;
      return {
        id: c.id,
        name: c.name,
        advertiser: c.advertiser,
        description: c.description,
        thumbnailUrl: c.thumbnailUrl,
        rewardAmount: c.rewardAmount,
        requiredWatchSeconds: c.requiredWatchSeconds,
        remainingQuota,
        endDate: c.endDate,
        isDemo: c.isDemo,
        available: !completed && remainingQuota > 0 && budgetLeft && countryOk && allowanceOk,
        note: completed
          ? "Completed"
          : !countryOk
            ? "Not available in your country"
            : !allowanceOk
              ? `You have used today's ${entitlements.dailyTaskLimit} tasks on ${entitlements.planName}`
              : remainingQuota <= 0
                ? "Today's quota is filled"
                : !budgetLeft
                  ? "Budget spent"
                  : "Open",
      };
    }),
  };
}

/** Opens a task session. One live session per user per campaign. */
export async function startTaskSession(args: {
  userId: string;
  country: string;
  campaignId: string;
  ipHash?: string | null;
  userAgentHash?: string | null;
}) {
  const settings = await getSettings();
  if (!settings.enableVideoTasks) throw Err.forbidden("Video tasks are turned off right now.");

  const campaign = await prisma.campaign.findUnique({ where: { id: args.campaignId } });
  if (!campaign) throw Err.notFound("That campaign is no longer listed.");

  const now = new Date();
  if (campaign.status !== "ACTIVE") throw Err.conflict("This campaign is not accepting completions.");
  if (campaign.startDate > now) throw Err.conflict("This campaign has not started yet.");
  if (campaign.endDate < now) throw Err.conflict("This campaign has ended.");
  if (campaign.completedCount >= campaign.totalQuota) throw Err.conflict("This campaign is fully subscribed.");
  if (campaign.totalBudget - campaign.spentBudget < campaign.rewardAmount) {
    throw Err.conflict("This campaign has spent its budget.");
  }
  if (campaign.targetCountries.length > 0 && !campaign.targetCountries.includes(args.country)) {
    throw Err.forbidden("This campaign is not available in your country.");
  }

  const already = await prisma.taskCompletion.findUnique({
    where: { userId_campaignId: { userId: args.userId, campaignId: args.campaignId } },
  });
  if (already) throw Err.conflict("You have already been rewarded for this campaign.");

  // The member's daily allowance is checked here as well as at submission.
  // Checking only at the end would let someone sit through a full video and
  // then be told it was never going to count, which is worse than a refusal.
  await assertTaskAllowance(args.userId);

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const usedToday = await prisma.taskCompletion.count({
    where: { campaignId: campaign.id, createdAt: { gte: startOfDay } },
  });
  if (usedToday >= campaign.dailyQuota) throw Err.conflict("Today's quota for this campaign is filled.");

  const live = await prisma.taskSession.findFirst({
    where: {
      userId: args.userId,
      campaignId: args.campaignId,
      status: "STARTED",
      expiresAt: { gt: now },
    },
  });
  if (live) return { session: live, campaign, resumed: true as const };

  const session = await prisma.taskSession.create({
    data: {
      userId: args.userId,
      campaignId: campaign.id,
      nonce: randomToken(24),
      requiredSeconds: campaign.requiredWatchSeconds,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      ipHash: args.ipHash ?? null,
      userAgentHash: args.userAgentHash ?? null,
    },
  });

  return { session, campaign, resumed: false as const };
}

/**
 * Records a heartbeat from an open task page.
 *
 * The optional `report` carries what the page observed about its own window
 * since the previous beat. Server time still bounds everything: see
 * `recordTrackedHeartbeat` for the clamp that makes the report unusable as a
 * way to manufacture watch time.
 */
export async function recordHeartbeat(args: {
  sessionId: string;
  userId: string;
  nonce: string;
  report?: HeartbeatReport;
}) {
  return recordTrackedHeartbeat(args);
}

/**
 * Validates and settles a task. Elapsed time is measured server-side from the
 * session row; the number the client reports is only ever advisory.
 */
export async function completeTaskSession(args: {
  userId: string;
  sessionId: string;
  nonce: string;
  reportedSeconds: number;
}) {
  const session = await prisma.taskSession.findUnique({
    where: { id: args.sessionId },
    include: { campaign: true },
  });

  if (!session || session.userId !== args.userId) throw Err.notFound("That task session was not found.");
  if (session.nonce !== args.nonce) throw Err.forbidden("This task session could not be verified.");
  if (session.status === "COMPLETED") return { alreadyCompleted: true as const };
  if (session.status !== "STARTED") throw Err.conflict("This session is closed.");
  if (session.expiresAt < new Date()) {
    await prisma.taskSession.update({ where: { id: session.id }, data: { status: "ABANDONED" } });
    throw Err.conflict("This session expired. Start the task again.");
  }

  const elapsedSeconds = Math.floor((Date.now() - session.startedAt.getTime()) / 1000);

  if (elapsedSeconds < session.requiredSeconds) {
    await prisma.taskSession.update({
      where: { id: session.id },
      data: { status: "SUBMITTED", submittedAt: new Date(), watchedSeconds: elapsedSeconds },
    });
    throw Err.conflict(
      `Keep the video open for ${session.requiredSeconds - elapsedSeconds}s more, then submit again.`,
    );
  }

  // The allowance is re-checked here because a session can be started before
  // midnight and submitted after, or opened in several tabs at once.
  await assertTaskAllowance(args.userId);

  const suspicious = await checkTaskSpeed({
    userId: args.userId,
    campaignId: session.campaignId,
    requiredSeconds: session.requiredSeconds,
    elapsedSeconds,
  });

  // Window and tab tracking: was the page actually in front of someone?
  const verdict = await finaliseIntegrity({
    sessionId: session.id,
    userId: args.userId,
    campaignId: session.campaignId,
    elapsedSeconds,
  });

  if (verdict.reject || suspicious) {
    await prisma.taskSession.update({
      where: { id: session.id },
      data: {
        status: "REJECTED",
        rejectionReason: verdict.flags.length > 0 ? verdict.flags.join(", ") : "The session could not be verified.",
      },
    });
    throw Err.conflict(explainRejection(verdict));
  }

  const campaign = session.campaign;
  const reward = campaign.rewardAmount;

  const completion = await prisma.$transaction(async (tx) => {
    // Conditional update: the last eligible slot goes to exactly one request.
    const claimed = await tx.campaign.updateMany({
      where: {
        id: campaign.id,
        status: "ACTIVE",
        completedCount: { lt: campaign.totalQuota },
        spentBudget: { lte: campaign.totalBudget - reward },
      },
      data: { completedCount: { increment: 1 }, spentBudget: { increment: reward } },
    });
    if (claimed.count === 0) throw Err.conflict("This campaign just ran out of slots.");

    const row = await tx.taskCompletion.create({
      data: {
        userId: args.userId,
        campaignId: campaign.id,
        sessionId: session.id,
        rewardAmount: reward,
        watchedSeconds: elapsedSeconds,
      },
    });

    await tx.taskSession.update({
      where: { id: session.id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        submittedAt: new Date(),
        watchedSeconds: elapsedSeconds,
      },
    });

    const refreshed = await tx.campaign.findUniqueOrThrow({ where: { id: campaign.id } });
    if (
      refreshed.completedCount >= refreshed.totalQuota ||
      refreshed.totalBudget - refreshed.spentBudget < refreshed.rewardAmount
    ) {
      await tx.campaign.update({ where: { id: campaign.id }, data: { status: "COMPLETED" } });
    }

    return row;
  });

  const rewardKey = `task:${completion.id}`;
  const credited = await creditPendingReward({
    userId: args.userId,
    amount: reward,
    type: "VIDEO_REWARD",
    description: `Task reward — ${campaign.name}`,
    idempotencyKey: rewardKey,
    referenceType: "campaign",
    referenceId: campaign.id,
    metadata: {
      sessionId: session.id,
      // What the server measured. This is the only figure the reward decision
      // ever used.
      watchedSeconds: elapsedSeconds,
      // What the browser claimed. Kept purely as evidence: a client that
      // reports far more time than actually elapsed is worth looking at, and
      // discarding the claim outright would throw that signal away.
      clientReportedSeconds: args.reportedSeconds,
      // Window-tracking verdict, kept with the payment it justified.
      activeSeconds: verdict.activeSeconds,
      hiddenSeconds: verdict.hiddenSeconds,
      integrityScore: verdict.score,
      integrityFlags: verdict.flags,
    },
  });

  if (!credited.duplicate) {
    await notify({
      userId: args.userId,
      type: "REWARD_CREDITED",
      title: "Task reward added",
      body: `Your reward for ${campaign.name} is pending verification.`,
      href: "/dashboard/wallet",
    });
    await handleRefereeEarning({ refereeId: args.userId, rewardAmount: reward, sourceKey: rewardKey });
  }

  return { alreadyCompleted: false as const, reward, completionId: completion.id };
}

/**
 * Credits any task completion that never got its wallet entry.
 *
 * The completion row and the reward are written in two steps, because the
 * ledger opens its own database transaction and Prisma will not nest them. That
 * leaves a narrow window: if the process dies after the completion commits but
 * before the credit lands, the member is owed money that no retry would ever
 * send. This job closes that window. It is safe to run on a schedule — the
 * reward key is derived from the completion id, so anything already credited is
 * recognised as a duplicate and skipped.
 */
export async function reconcileMissingTaskRewards(limit = 200) {
  // Only look at completions old enough that an in-flight credit would have
  // finished by now, so this never races a request that is still running.
  const settled = new Date(Date.now() - 60_000);

  const candidates = await prisma.taskCompletion.findMany({
    where: { createdAt: { lte: settled } },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { campaign: { select: { name: true } } },
  });

  if (candidates.length === 0) return { repaired: 0, checked: 0 };

  const keys = candidates.map((c) => `task:${c.id}`);
  const existing = await prisma.walletTransaction.findMany({
    where: { idempotencyKey: { in: keys } },
    select: { idempotencyKey: true },
  });
  const credited = new Set(existing.map((t) => t.idempotencyKey));

  let repaired = 0;
  for (const completion of candidates) {
    const key = `task:${completion.id}`;
    if (credited.has(key)) continue;

    try {
      const result = await creditPendingReward({
        userId: completion.userId,
        amount: completion.rewardAmount,
        type: "VIDEO_REWARD",
        description: `Task reward — ${completion.campaign.name}`,
        idempotencyKey: key,
        referenceType: "campaign",
        referenceId: completion.campaignId,
        metadata: { reconciled: true, completionId: completion.id },
      });
      if (!result.duplicate) {
        repaired += 1;
        await handleRefereeEarning({
          refereeId: completion.userId,
          rewardAmount: completion.rewardAmount,
          sourceKey: key,
        });
      }
    } catch (error) {
      console.error(`[tasks] could not reconcile completion ${completion.id}:`, error);
    }
  }

  return { repaired, checked: candidates.length };
}

/** Closes out campaigns that have run past their end date. */
export async function expireCampaigns() {
  const result = await prisma.campaign.updateMany({
    where: { status: "ACTIVE", endDate: { lt: new Date() } },
    data: { status: "EXPIRED" },
  });
  return { expired: result.count };
}
