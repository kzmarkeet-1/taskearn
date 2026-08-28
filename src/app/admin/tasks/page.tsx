import type { Metadata } from "next";
import { PlaySquare } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Task activity" };
export const dynamic = "force-dynamic";

export default async function AdminTasksPage() {
  await requireAdmin();
  const since = new Date(Date.now() - 24 * 3600_000);

  const [completions, sessions, dayCount, dayRewards, openSessions] = await Promise.all([
    prisma.taskCompletion.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        user: { select: { fullName: true, email: true } },
        campaign: { select: { name: true, requiredWatchSeconds: true } },
      },
    }),
    prisma.taskSession.findMany({
      where: { status: { in: ["STARTED", "SUBMITTED", "ABANDONED", "REJECTED"] } },
      orderBy: { startedAt: "desc" },
      take: 30,
      include: { user: { select: { fullName: true } }, campaign: { select: { name: true } } },
    }),
    prisma.taskCompletion.count({ where: { createdAt: { gte: since } } }),
    prisma.taskCompletion.aggregate({ where: { createdAt: { gte: since } }, _sum: { rewardAmount: true } }),
    prisma.taskSession.count({ where: { status: "STARTED", expiresAt: { gt: new Date() } } }),
  ]);

  return (
    <>
      <PageHeader
        title="Task activity"
        description="Completions are the audit trail for every video reward. Sessions show work in flight."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Completions (24h)" value={String(dayCount)} icon={PlaySquare} />
        <StatCard label="Rewarded (24h)" value={formatMoney(dayRewards._sum.rewardAmount ?? 0)} icon={PlaySquare} tone="success" />
        <StatCard label="Sessions open now" value={String(openSessions)} icon={PlaySquare} tone="muted" />
      </div>

      <Card className="mt-5">
        <CardHeader>
          <CardTitle>Recent completions</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {completions.length === 0 ? (
            <EmptyState icon={PlaySquare} title="No completions yet" description="Nobody has finished a video task." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Campaign</TableHead>
                  <TableHead className="text-right">Watched</TableHead>
                  <TableHead className="text-right">Required</TableHead>
                  <TableHead className="text-right">Reward</TableHead>
                  <TableHead>When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {completions.map((completion) => (
                  <TableRow key={completion.id}>
                    <TableCell>
                      <p className="text-sm font-medium">{completion.user.fullName}</p>
                      <p className="text-xs text-muted-foreground">{completion.user.email}</p>
                    </TableCell>
                    <TableCell className="max-w-[220px] truncate">{completion.campaign.name}</TableCell>
                    <TableCell className="money text-right">{completion.watchedSeconds}s</TableCell>
                    <TableCell className="money text-right text-muted-foreground">
                      {completion.campaign.requiredWatchSeconds}s
                    </TableCell>
                    <TableCell className="money text-right">{formatMoney(completion.rewardAmount)}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatDateTime(completion.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="mt-5">
        <CardHeader>
          <CardTitle>Sessions in flight and rejected</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {sessions.length === 0 ? (
            <EmptyState icon={PlaySquare} title="Nothing in flight" description="No open, abandoned or rejected sessions." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead className="text-right">Heartbeats</TableHead>
                  <TableHead className="text-right">Watched</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((session) => (
                  <TableRow key={session.id}>
                    <TableCell className="text-sm">{session.user.fullName}</TableCell>
                    <TableCell className="max-w-[220px] truncate">{session.campaign.name}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatDateTime(session.startedAt)}
                    </TableCell>
                    <TableCell className="money text-right text-muted-foreground">
                      {session.heartbeatCount}
                    </TableCell>
                    <TableCell className="money text-right">
                      {session.watchedSeconds}s / {session.requiredSeconds}s
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={session.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
