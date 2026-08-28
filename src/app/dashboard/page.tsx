import type { Metadata } from "next";
import Link from "next/link";
import { Banknote, ClipboardList, Clock, PlaySquare, TrendingUp, UserPlus, Wallet } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBalances, releaseMaturedRewards } from "@/lib/wallet";
import { listAvailableCampaigns } from "@/lib/tasks";
import { listSurveysForUser } from "@/lib/surveys";
import { getReferralSummary } from "@/lib/referrals";
import { formatMoney } from "@/lib/money";
import { formatDateTime, relativeTime } from "@/lib/utils";
import { StatCard } from "@/components/dashboard/stat-card";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();
  await releaseMaturedRewards(user.id);

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [balances, tasks, surveys, referrals, todayEarnings, transactions, withdrawals, notifications] =
    await Promise.all([
      getBalances(user.id),
      listAvailableCampaigns({ id: user.id, country: user.country }),
      listSurveysForUser({ id: user.id, country: user.country }),
      getReferralSummary(user.id),
      prisma.walletTransaction.aggregate({
        where: { userId: user.id, bucket: "PENDING", amount: { gt: 0 }, createdAt: { gte: startOfDay } },
        _sum: { amount: true },
      }),
      prisma.walletTransaction.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 6 }),
      prisma.withdrawal.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 3 }),
      prisma.notification.findMany({ where: { userId: user.id, readAt: null }, orderBy: { createdAt: "desc" }, take: 3 }),
    ]);

  const openTasks = tasks.campaigns.filter((c) => c.available);
  const openSurveys = surveys.offers.filter((s) => s.eligible);

  return (
    <>
      <PageHeader
        title={`Welcome back, ${user.fullName.split(" ")[0]}`}
        description="Here is where your account stands right now."
        action={
          <Button asChild>
            <Link href="/dashboard/tasks">Find a task</Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Available balance"
          value={formatMoney(balances.availableBalance)}
          hint="Ready to withdraw"
          icon={Wallet}
        />
        <StatCard
          label="Pending balance"
          value={formatMoney(balances.pendingBalance)}
          hint="Clearing verification"
          icon={Clock}
          tone="warning"
        />
        <StatCard
          label="Today's earnings"
          value={formatMoney(todayEarnings._sum.amount ?? 0)}
          hint="Since midnight"
          icon={TrendingUp}
          tone="success"
        />
        <StatCard
          label="Total earned"
          value={formatMoney(balances.lifetimeEarned)}
          hint="All time, before withdrawals"
          icon={Banknote}
          tone="muted"
        />
      </div>

      {notifications.length > 0 ? (
        <Alert variant="info" className="mt-6">
          <AlertTitle>{notifications[0].title}</AlertTitle>
          <AlertDescription>
            {notifications[0].body}{" "}
            <Link href="/dashboard/notifications" className="font-medium text-primary hover:underline">
              See all {notifications.length > 1 ? `(${notifications.length} unread)` : ""}
            </Link>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Video tasks open to you</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/dashboard/tasks">View all</Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {openTasks.length === 0 ? (
              <EmptyState
                icon={PlaySquare}
                title="Nothing open right now"
                description="Campaigns appear as advertisers fund them. Check back later today."
              />
            ) : (
              <ul className="divide-y">
                {openTasks.slice(0, 4).map((task) => (
                  <li key={task.id} className="flex items-center justify-between gap-3 px-6 py-3.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{task.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {task.advertiser} · {task.requiredWatchSeconds}s
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-sm money font-semibold">{formatMoney(task.rewardAmount)}</span>
                      <Button size="sm" asChild>
                        <Link href={`/dashboard/tasks/${task.id}`}>Start</Link>
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Surveys open to you</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/dashboard/surveys">View all</Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {openSurveys.length === 0 ? (
              <EmptyState
                icon={ClipboardList}
                title={surveys.message ?? "No surveys match you right now"}
                description={
                  surveys.configuredProviders === 0
                    ? "No survey panel is connected on this deployment yet."
                    : "Panels add studies through the day. Video tasks are unaffected."
                }
              />
            ) : (
              <ul className="divide-y">
                {openSurveys.slice(0, 4).map((survey) => (
                  <li key={survey.id} className="flex items-center justify-between gap-3 px-6 py-3.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{survey.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {survey.providerName} · about {survey.estimatedMinutes} min
                      </p>
                    </div>
                    <span className="shrink-0 text-sm money font-semibold">
                      {formatMoney(survey.rewardAmount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Recent transactions</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/dashboard/wallet">Open wallet</Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {transactions.length === 0 ? (
              <EmptyState
                icon={Wallet}
                title="No transactions yet"
                description="Complete your first task and the reward will show up here."
                action={
                  <Button asChild>
                    <Link href="/dashboard/tasks">Find a task</Link>
                  </Button>
                }
              />
            ) : (
              <ul className="divide-y">
                {transactions.map((transaction) => (
                  <li key={transaction.id} className="flex items-center justify-between gap-3 px-6 py-3.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{transaction.description}</p>
                      <p className="text-xs text-muted-foreground">{relativeTime(transaction.createdAt)}</p>
                    </div>
                    <span
                      className={`shrink-0 text-sm money font-semibold ${
                        transaction.amount > 0 ? "text-success" : "text-foreground"
                      }`}
                    >
                      {transaction.amount > 0 ? "+" : "−"}
                      {formatMoney(Math.abs(transaction.amount), { withCurrency: false })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle>Withdrawals</CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/dashboard/withdraw">Withdraw</Link>
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {withdrawals.length === 0 ? (
                <EmptyState
                  icon={Banknote}
                  title="No withdrawals yet"
                  description="Once your available balance passes the minimum you can cash out."
                />
              ) : (
                <ul className="divide-y">
                  {withdrawals.map((withdrawal) => (
                    <li key={withdrawal.id} className="flex items-center justify-between gap-3 px-6 py-3.5">
                      <div className="min-w-0">
                        <p className="text-sm money font-medium">{formatMoney(withdrawal.netAmount)}</p>
                        <p className="text-xs text-muted-foreground">{formatDateTime(withdrawal.createdAt)}</p>
                      </div>
                      <StatusBadge status={withdrawal.status} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle>Referrals</CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/dashboard/referrals">Manage</Link>
              </Button>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <UserPlus className="size-4" />
                </span>
                <div>
                  <p className="text-sm">
                    <span className="money font-semibold">{referrals.active}</span> qualified of{" "}
                    <span className="money font-semibold">{referrals.total}</span> invited
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatMoney(referrals.totalEarned)} earned from referrals
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
