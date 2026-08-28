import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Survey activity" };
export const dynamic = "force-dynamic";

export default async function AdminSurveysPage() {
  await requireAdmin();

  const [completions, surveys, counts, webhooks] = await Promise.all([
    prisma.surveyCompletion.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { user: { select: { fullName: true, email: true } }, provider: { select: { name: true } } },
    }),
    prisma.survey.findMany({
      orderBy: { updatedAt: "desc" },
      take: 30,
      include: { provider: { select: { name: true } } },
    }),
    prisma.surveyCompletion.groupBy({ by: ["status"], _count: { _all: true }, _sum: { rewardAmount: true } }),
    prisma.webhookEvent.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
  ]);

  const byStatus = (status: string) => counts.find((c) => c.status === status);

  return (
    <>
      <PageHeader
        title="Survey activity"
        description="Completions arrive from panel webhooks. Every delivery is recorded, signed and de-duplicated."
        action={
          <Button variant="outline" asChild>
            <Link href="/admin/survey-providers">Providers</Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Completed" value={String(byStatus("COMPLETED")?._count._all ?? 0)} icon={ClipboardList} tone="success" />
        <StatCard label="Screened out" value={String(byStatus("DISQUALIFIED")?._count._all ?? 0)} icon={ClipboardList} tone="muted" />
        <StatCard label="Started" value={String(byStatus("STARTED")?._count._all ?? 0)} icon={ClipboardList} />
        <StatCard
          label="Rewarded"
          value={formatMoney(byStatus("COMPLETED")?._sum.rewardAmount ?? 0)}
          icon={ClipboardList}
        />
      </div>

      <Card className="mt-5">
        <CardHeader>
          <CardTitle>Recent completions</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {completions.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title="No survey activity"
              description="Once a panel is connected and members start surveys, results appear here."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Transaction</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Panel paid</TableHead>
                  <TableHead className="text-right">Member got</TableHead>
                  <TableHead>When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {completions.map((completion) => (
                  <TableRow key={completion.id}>
                    <TableCell className="text-sm">{completion.user.fullName}</TableCell>
                    <TableCell className="text-xs">{completion.provider.name}</TableCell>
                    <TableCell className="money text-xs">{completion.transactionId}</TableCell>
                    <TableCell>
                      <StatusBadge status={completion.status} />
                    </TableCell>
                    <TableCell className="money text-right text-muted-foreground">
                      {formatMoney(completion.payoutAmount, { withCurrency: false })}
                    </TableCell>
                    <TableCell className="money text-right">
                      {formatMoney(completion.rewardAmount, { withCurrency: false })}
                    </TableCell>
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

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Surveys on file</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {surveys.length === 0 ? (
              <EmptyState icon={ClipboardList} title="No surveys cached" description="Connect a provider to pull studies." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Survey</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead className="text-right">Reward</TableHead>
                    <TableHead className="text-right">Length</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {surveys.map((survey) => (
                    <TableRow key={survey.id}>
                      <TableCell className="max-w-[200px] truncate text-sm">{survey.name}</TableCell>
                      <TableCell className="text-xs">{survey.provider.name}</TableCell>
                      <TableCell className="money text-right">
                        {formatMoney(survey.rewardAmount, { withCurrency: false })}
                      </TableCell>
                      <TableCell className="money text-right">{survey.estimatedMinutes}m</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Webhook deliveries</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {webhooks.length === 0 ? (
              <EmptyState icon={ClipboardList} title="No deliveries yet" description="Panel callbacks will be logged here." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Provider</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>Outcome</TableHead>
                    <TableHead>When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {webhooks.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell className="text-xs">{event.providerSlug}</TableCell>
                      <TableCell className="max-w-[140px] truncate money text-xs">{event.eventId}</TableCell>
                      <TableCell>
                        <StatusBadge status={webhookOutcome(event)} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatDateTime(event.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

/** Turns the three recorded facts about a delivery into one readable outcome. */
function webhookOutcome(event: { signatureOk: boolean; processedAt: Date | null; error: string | null }) {
  if (!event.signatureOk) return "REJECTED";
  if (event.error) return "FAILED";
  return event.processedAt ? "COMPLETED" : "PENDING";
}
