import "server-only";
import { prisma } from "./prisma";
import { pendingLiabilities } from "./wallet";

/**
 * Reporting.
 *
 * Revenue is what advertisers and panels paid in. Rewards are what members
 * earned out. Margin is the difference — it is never inferred from balances,
 * because balances move for other reasons too.
 */

export type DateRange = { from: Date; to: Date };

export function defaultRange(days = 30): DateRange {
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 3600_000);
  from.setHours(0, 0, 0, 0);
  return { from, to };
}

export function parseRange(searchParams: URLSearchParams): DateRange {
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  if (!fromParam && !toParam) return defaultRange();
  const from = fromParam ? new Date(fromParam) : defaultRange().from;
  const to = toParam ? new Date(toParam) : new Date();
  to.setHours(23, 59, 59, 999);
  return { from, to };
}

export async function revenueSummary(range: DateRange) {
  const [taskRevenue, surveyRevenue, taskRewards, surveyRewards, referralRewards, bonuses] = await Promise.all([
    prisma.taskCompletion.aggregate({
      where: { createdAt: { gte: range.from, lte: range.to } },
      _sum: { rewardAmount: true },
      _count: { _all: true },
    }),
    prisma.surveyCompletion.aggregate({
      where: { status: "COMPLETED", completedAt: { gte: range.from, lte: range.to } },
      _sum: { payoutAmount: true, rewardAmount: true },
      _count: { _all: true },
    }),
    prisma.walletTransaction.aggregate({
      where: { type: "VIDEO_REWARD", bucket: "PENDING", amount: { gt: 0 }, createdAt: { gte: range.from, lte: range.to } },
      _sum: { amount: true },
    }),
    prisma.walletTransaction.aggregate({
      where: { type: "SURVEY_REWARD", bucket: "PENDING", amount: { gt: 0 }, createdAt: { gte: range.from, lte: range.to } },
      _sum: { amount: true },
    }),
    prisma.walletTransaction.aggregate({
      where: { type: "REFERRAL_REWARD", bucket: "PENDING", amount: { gt: 0 }, createdAt: { gte: range.from, lte: range.to } },
      _sum: { amount: true },
    }),
    prisma.walletTransaction.aggregate({
      where: { type: "BONUS", bucket: "PENDING", amount: { gt: 0 }, createdAt: { gte: range.from, lte: range.to } },
      _sum: { amount: true },
    }),
  ]);

  // Advertiser spend on completed tasks equals the reward paid out of the budget.
  const taskRevenueTotal = taskRevenue._sum.rewardAmount ?? 0;
  const surveyRevenueTotal = surveyRevenue._sum.payoutAmount ?? 0;
  const userRewards =
    (taskRewards._sum.amount ?? 0) +
    (surveyRewards._sum.amount ?? 0) +
    (referralRewards._sum.amount ?? 0) +
    (bonuses._sum.amount ?? 0);

  return {
    taskRevenue: taskRevenueTotal,
    surveyRevenue: surveyRevenueTotal,
    totalRevenue: taskRevenueTotal + surveyRevenueTotal,
    userRewards,
    platformMargin: taskRevenueTotal + surveyRevenueTotal - userRewards,
    taskCompletions: taskRevenue._count._all,
    surveyCompletions: surveyRevenue._count._all,
  };
}

/** Daily series for the revenue chart. */
export async function dailySeries(range: DateRange) {
  const rows = await prisma.$queryRaw<
    { day: Date; task_revenue: bigint | null; survey_revenue: bigint | null; rewards: bigint | null }[]
  >`
    WITH days AS (
      SELECT generate_series(${range.from}::date, ${range.to}::date, '1 day')::date AS day
    ),
    tasks AS (
      SELECT date_trunc('day', "createdAt")::date AS day, SUM("rewardAmount") AS amount
      FROM task_completions WHERE "createdAt" BETWEEN ${range.from} AND ${range.to}
      GROUP BY 1
    ),
    surveys AS (
      SELECT date_trunc('day', "completedAt")::date AS day, SUM("payoutAmount") AS amount
      FROM survey_completions
      WHERE "status" = 'COMPLETED' AND "completedAt" BETWEEN ${range.from} AND ${range.to}
      GROUP BY 1
    ),
    rewards AS (
      SELECT date_trunc('day', "createdAt")::date AS day, SUM("amount") AS amount
      FROM wallet_transactions
      WHERE "bucket" = 'PENDING' AND "amount" > 0 AND "createdAt" BETWEEN ${range.from} AND ${range.to}
      GROUP BY 1
    )
    SELECT days.day,
           COALESCE(tasks.amount, 0) AS task_revenue,
           COALESCE(surveys.amount, 0) AS survey_revenue,
           COALESCE(rewards.amount, 0) AS rewards
    FROM days
    LEFT JOIN tasks ON tasks.day = days.day
    LEFT JOIN surveys ON surveys.day = days.day
    LEFT JOIN rewards ON rewards.day = days.day
    ORDER BY days.day ASC
  `;

  return rows.map((row) => ({
    day: new Date(row.day).toISOString().slice(0, 10),
    taskRevenue: Number(row.task_revenue ?? 0),
    surveyRevenue: Number(row.survey_revenue ?? 0),
    rewards: Number(row.rewards ?? 0),
  }));
}

export async function withdrawalReport(range: DateRange) {
  const grouped = await prisma.withdrawal.groupBy({
    by: ["status"],
    where: { createdAt: { gte: range.from, lte: range.to } },
    _sum: { netAmount: true, fee: true },
    _count: { _all: true },
  });

  const liabilities = await pendingLiabilities();

  return {
    byStatus: grouped.map((g) => ({
      status: g.status,
      count: g._count._all,
      netAmount: g._sum.netAmount ?? 0,
      fees: g._sum.fee ?? 0,
    })),
    liabilities,
  };
}

export async function campaignPerformance(range: DateRange) {
  const campaigns = await prisma.campaign.findMany({
    where: { createdAt: { lte: range.to } },
    orderBy: { completedCount: "desc" },
    take: 50,
    select: {
      id: true,
      name: true,
      advertiser: true,
      status: true,
      rewardAmount: true,
      totalBudget: true,
      spentBudget: true,
      completedCount: true,
      totalQuota: true,
    },
  });

  return campaigns.map((c) => ({
    ...c,
    fillRate: c.totalQuota > 0 ? Math.round((c.completedCount / c.totalQuota) * 100) : 0,
    budgetUsed: c.totalBudget > 0 ? Math.round((c.spentBudget / c.totalBudget) * 100) : 0,
  }));
}

export async function surveyPerformance(range: DateRange) {
  const grouped = await prisma.surveyCompletion.groupBy({
    by: ["providerId", "status"],
    where: { createdAt: { gte: range.from, lte: range.to } },
    _sum: { payoutAmount: true, rewardAmount: true },
    _count: { _all: true },
  });

  const providers = await prisma.surveyProvider.findMany({ select: { id: true, name: true, slug: true } });
  const nameFor = new Map(providers.map((p) => [p.id, p.name]));

  return grouped.map((g) => ({
    provider: nameFor.get(g.providerId) ?? "Unknown",
    status: g.status,
    count: g._count._all,
    payout: g._sum.payoutAmount ?? 0,
    rewards: g._sum.rewardAmount ?? 0,
  }));
}

export async function fraudStatistics(range: DateRange) {
  const [byLevel, byType, riskLevels] = await Promise.all([
    prisma.fraudEvent.groupBy({
      by: ["level"],
      where: { createdAt: { gte: range.from, lte: range.to } },
      _count: { _all: true },
    }),
    prisma.fraudEvent.groupBy({
      by: ["type"],
      where: { createdAt: { gte: range.from, lte: range.to } },
      _count: { _all: true },
    }),
    prisma.riskScore.groupBy({ by: ["level"], _count: { _all: true } }),
  ]);

  return {
    byLevel: byLevel.map((r) => ({ level: r.level, count: r._count._all })),
    byType: byType.map((r) => ({ type: r.type, count: r._count._all })),
    usersByRisk: riskLevels.map((r) => ({ level: r.level, count: r._count._all })),
  };
}

export async function userStatistics(range: DateRange) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600_000);

  const [total, newInRange, newToday, active] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: range.from, lte: range.to } } }),
    prisma.user.count({ where: { createdAt: { gte: startOfDay } } }),
    prisma.user.count({ where: { lastLoginAt: { gte: thirtyDaysAgo } } }),
  ]);

  return { total, newInRange, newToday, active };
}
