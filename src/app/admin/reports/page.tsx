import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import {
  campaignPerformance,
  dailySeries,
  defaultRange,
  fraudStatistics,
  revenueSummary,
  surveyPerformance,
  userStatistics,
  withdrawalReport,
} from "@/lib/reports";
import { formatMoney, toMajor } from "@/lib/money";
import { titleCase } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart3, Coins, TrendingUp, Users } from "lucide-react";
import { RevenueChart } from "./revenue-chart";
import { ExportButtons } from "./export-buttons";

export const metadata: Metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  await requireAdmin();
  const { days: daysParam } = await searchParams;
  const days = [7, 30, 90].includes(Number(daysParam)) ? Number(daysParam) : 30;
  const range = defaultRange(days);

  const [summary, series, users, withdrawals, campaigns, surveys, fraud] = await Promise.all([
    revenueSummary(range),
    dailySeries(range),
    userStatistics(range),
    withdrawalReport(range),
    campaignPerformance(range),
    surveyPerformance(range),
    fraudStatistics(range),
  ]);

  const chartData = series.map((point) => ({
    day: point.day.slice(5),
    revenue: toMajor(point.taskRevenue + point.surveyRevenue),
    rewards: toMajor(point.rewards),
    margin: toMajor(point.taskRevenue + point.surveyRevenue - point.rewards),
  }));

  return (
    <>
      <PageHeader
        title="Reports"
        description={`${range.from.toDateString()} to ${range.to.toDateString()}. Exports are CSV in major units, ready for a spreadsheet.`}
        action={<ExportButtons days={days} />}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Revenue" value={formatMoney(summary.totalRevenue)} hint="Advertisers and panels" icon={Coins} />
        <StatCard label="Member rewards" value={formatMoney(summary.userRewards)} icon={Coins} tone="muted" />
        <StatCard
          label="Margin"
          value={formatMoney(summary.platformMargin)}
          icon={TrendingUp}
          tone={summary.platformMargin >= 0 ? "success" : "warning"}
        />
        <StatCard label="New members" value={String(users.newInRange)} hint={`${users.active} active`} icon={Users} />
      </div>

      <Card className="mt-5">
        <CardHeader className="flex-row items-center gap-2 space-y-0">
          <BarChart3 className="size-4 text-muted-foreground" />
          <CardTitle>Revenue against rewards</CardTitle>
        </CardHeader>
        <CardContent>
          <RevenueChart data={chartData} />
        </CardContent>
      </Card>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Campaign performance</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead className="text-right">Completions</TableHead>
                  <TableHead className="text-right">Fill</TableHead>
                  <TableHead className="text-right">Spent</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.slice(0, 12).map((campaign) => (
                  <TableRow key={campaign.id}>
                    <TableCell className="max-w-[180px] truncate text-sm">{campaign.name}</TableCell>
                    <TableCell className="money text-right">{campaign.completedCount}</TableCell>
                    <TableCell className="money text-right">{campaign.fillRate}%</TableCell>
                    <TableCell className="money text-right">
                      {formatMoney(campaign.spentBudget, { withCurrency: false })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Survey performance</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Provider</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                  <TableHead className="text-right">Panel paid</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {surveys.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">
                      No survey activity in this period.
                    </TableCell>
                  </TableRow>
                ) : (
                  surveys.map((row, index) => (
                    <TableRow key={`${row.provider}-${row.status}-${index}`}>
                      <TableCell className="text-sm">{row.provider}</TableCell>
                      <TableCell>
                        <StatusBadge status={row.status} />
                      </TableCell>
                      <TableCell className="money text-right">{row.count}</TableCell>
                      <TableCell className="money text-right">
                        {formatMoney(row.payout, { withCurrency: false })}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Withdrawals</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                  <TableHead className="text-right">Fees</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {withdrawals.byStatus.map((row) => (
                  <TableRow key={row.status}>
                    <TableCell>
                      <StatusBadge status={row.status} />
                    </TableCell>
                    <TableCell className="money text-right">{row.count}</TableCell>
                    <TableCell className="money text-right">
                      {formatMoney(row.netAmount, { withCurrency: false })}
                    </TableCell>
                    <TableCell className="money text-right text-muted-foreground">
                      {formatMoney(row.fees, { withCurrency: false })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Risk signals</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Signal</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fraud.byType.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={2} className="py-8 text-center text-sm text-muted-foreground">
                      No signals raised in this period.
                    </TableCell>
                  </TableRow>
                ) : (
                  fraud.byType.map((row) => (
                    <TableRow key={row.type}>
                      <TableCell className="text-sm">{titleCase(row.type)}</TableCell>
                      <TableCell className="money text-right">{row.count}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
