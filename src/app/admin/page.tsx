import type { Metadata } from "next";
import Link from "next/link";
import { Banknote, CheckCircle2, Coins, ShieldAlert, TrendingUp, UserPlus, Users, Wallet } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { defaultRange, revenueSummary, userStatistics } from "@/lib/reports";
import { pendingLiabilities } from "@/lib/wallet";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Admin" };
export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  await requireAdmin();
  const range = defaultRange(30);

  const [summary, users, liabilities, pendingWithdrawals, fraudAlerts, recentWithdrawals] = await Promise.all([
    revenueSummary(range),
    userStatistics(range),
    pendingLiabilities(),
    prisma.withdrawal.count({ where: { status: { in: ["PENDING", "UNDER_REVIEW"] } } }),
    prisma.fraudEvent.findMany({
      where: { resolvedAt: null },
      orderBy: { createdAt: "desc" },
      take: 6,
      include: { user: { select: { fullName: true, email: true } } },
    }),
    prisma.withdrawal.findMany({
      where: { status: { in: ["PENDING", "UNDER_REVIEW", "APPROVED"] } },
      orderBy: { createdAt: "asc" },
      take: 6,
      include: { user: { select: { fullName: true, email: true } } },
    }),
  ]);

  return (
    <>
      <PageHeader
        title="Platform overview"
        description="Last 30 days. Revenue is what advertisers and panels paid in; rewards are what members earned out."
        action={
          <Button asChild>
            <Link href="/admin/reports">Open reports</Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total users" value={String(users.total)} hint={`${users.newToday} joined today`} icon={Users} />
        <StatCard label="Active users" value={String(users.active)} hint="Signed in within 30 days" icon={UserPlus} tone="success" />
        <StatCard label="New this period" value={String(users.newInRange)} icon={TrendingUp} tone="muted" />
        <StatCard
          label="Pending withdrawals"
          value={String(pendingWithdrawals)}
          hint={formatMoney(liabilities.withdrawalsInFlight)}
          icon={Banknote}
          tone="warning"
        />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Task revenue" value={formatMoney(summary.taskRevenue)} hint={`${summary.taskCompletions} completions`} icon={Coins} />
        <StatCard label="Survey revenue" value={formatMoney(summary.surveyRevenue)} hint={`${summary.surveyCompletions} completions`} icon={Coins} />
        <StatCard label="Member rewards" value={formatMoney(summary.userRewards)} icon={Wallet} tone="muted" />
        <StatCard
          label="Platform margin"
          value={formatMoney(summary.platformMargin)}
          hint="Revenue minus rewards"
          icon={TrendingUp}
          tone={summary.platformMargin >= 0 ? "success" : "warning"}
        />
      </div>

      <Card className="mt-5">
        <CardHeader>
          <CardTitle>Money owed to members</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Figure label="All balances" value={formatMoney(liabilities.userBalances)} note="Available + pending + bonus + referral" />
          <Figure label="Withdrawable now" value={formatMoney(liabilities.availableBalances)} note="Members could request this today" />
          <Figure label="Withdrawals in flight" value={formatMoney(liabilities.withdrawalsInFlight)} note="Debited, not yet sent" />
        </CardContent>
      </Card>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Withdrawals waiting</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/admin/withdrawals">Review queue</Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {recentWithdrawals.length === 0 ? (
              <EmptyState icon={CheckCircle2} title="The queue is clear" description="No withdrawal is waiting on a decision." />
            ) : (
              <ul className="divide-y">
                {recentWithdrawals.map((withdrawal) => (
                  <li key={withdrawal.id} className="flex items-center justify-between gap-3 px-6 py-3.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{withdrawal.user.fullName}</p>
                      <p className="text-xs text-muted-foreground">
                        {withdrawal.reference} · {formatDateTime(withdrawal.createdAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-sm money font-semibold">{formatMoney(withdrawal.netAmount)}</span>
                      <StatusBadge status={withdrawal.status} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Open fraud alerts</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/admin/fraud">Investigate</Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {fraudAlerts.length === 0 ? (
              <EmptyState icon={ShieldAlert} title="No open alerts" description="The risk engine has nothing outstanding." />
            ) : (
              <ul className="divide-y">
                {fraudAlerts.map((alert) => (
                  <li key={alert.id} className="flex items-start justify-between gap-3 px-6 py-3.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{alert.summary}</p>
                      <p className="text-xs text-muted-foreground">
                        {alert.user?.email ?? "No account attached"} · {formatDateTime(alert.createdAt)}
                      </p>
                    </div>
                    <StatusBadge status={alert.level} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Figure({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-xl money font-semibold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{note}</p>
    </div>
  );
}
