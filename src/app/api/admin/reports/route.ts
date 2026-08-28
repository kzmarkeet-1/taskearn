import { handler, ok } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import {
  campaignPerformance,
  dailySeries,
  fraudStatistics,
  parseRange,
  revenueSummary,
  surveyPerformance,
  userStatistics,
  withdrawalReport,
} from "@/lib/reports";
import { toCsv } from "@/lib/utils";
import { toMajor } from "@/lib/money";

export const runtime = "nodejs";

export const GET = handler(async (request) => {
  await requireAdmin();
  const params = new URL(request.url).searchParams;
  const range = parseRange(params);
  const format = params.get("format");
  const report = params.get("report") ?? "summary";

  if (format === "csv") {
    const rows = await csvRows(report, range);
    return new Response(toCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="taskearn-${report}-${range.from.toISOString().slice(0, 10)}-to-${range.to.toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  const [summary, series, withdrawals, campaigns, surveys, fraud, users] = await Promise.all([
    revenueSummary(range),
    dailySeries(range),
    withdrawalReport(range),
    campaignPerformance(range),
    surveyPerformance(range),
    fraudStatistics(range),
    userStatistics(range),
  ]);

  return ok({ range, summary, series, withdrawals, campaigns, surveys, fraud, users });
});

/** CSV exports use major units so the file opens sensibly in a spreadsheet. */
async function csvRows(report: string, range: ReturnType<typeof parseRange>) {
  switch (report) {
    case "daily": {
      const series = await dailySeries(range);
      return series.map((row) => ({
        date: row.day,
        task_revenue: toMajor(row.taskRevenue),
        survey_revenue: toMajor(row.surveyRevenue),
        user_rewards: toMajor(row.rewards),
        margin: toMajor(row.taskRevenue + row.surveyRevenue - row.rewards),
      }));
    }
    case "campaigns": {
      const campaigns = await campaignPerformance(range);
      return campaigns.map((c) => ({
        campaign: c.name,
        advertiser: c.advertiser,
        status: c.status,
        reward: toMajor(c.rewardAmount),
        budget: toMajor(c.totalBudget),
        spent: toMajor(c.spentBudget),
        completions: c.completedCount,
        quota: c.totalQuota,
        fill_rate_pct: c.fillRate,
      }));
    }
    case "surveys": {
      const surveys = await surveyPerformance(range);
      return surveys.map((s) => ({
        provider: s.provider,
        status: s.status,
        count: s.count,
        provider_payout: toMajor(s.payout),
        user_rewards: toMajor(s.rewards),
      }));
    }
    case "withdrawals": {
      const report = await withdrawalReport(range);
      return report.byStatus.map((r) => ({
        status: r.status,
        count: r.count,
        net_amount: toMajor(r.netAmount),
        fees: toMajor(r.fees),
      }));
    }
    case "fraud": {
      const stats = await fraudStatistics(range);
      return stats.byType.map((r) => ({ event_type: r.type, count: r.count }));
    }
    default: {
      const summary = await revenueSummary(range);
      return [
        {
          from: range.from.toISOString().slice(0, 10),
          to: range.to.toISOString().slice(0, 10),
          task_revenue: toMajor(summary.taskRevenue),
          survey_revenue: toMajor(summary.surveyRevenue),
          total_revenue: toMajor(summary.totalRevenue),
          user_rewards: toMajor(summary.userRewards),
          platform_margin: toMajor(summary.platformMargin),
          task_completions: summary.taskCompletions,
          survey_completions: summary.surveyCompletions,
        },
      ];
    }
  }
}
