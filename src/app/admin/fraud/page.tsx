import type { Metadata } from "next";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { formatDateTime, titleCase } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ResolveEvent } from "./resolve-event";

export const metadata: Metadata = { title: "Fraud detection" };
export const dynamic = "force-dynamic";

export default async function AdminFraudPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  await requireAdmin();
  const { view } = await searchParams;
  const showResolved = view === "resolved";

  const where: Prisma.FraudEventWhereInput = showResolved ? { resolvedAt: { not: null } } : { resolvedAt: null };

  const [events, byLevel, riskUsers, highRisk] = await Promise.all([
    prisma.fraudEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 80,
      include: { user: { select: { id: true, fullName: true, email: true, status: true } } },
    }),
    prisma.fraudEvent.groupBy({ by: ["level"], where: { resolvedAt: null }, _count: { _all: true } }),
    prisma.riskScore.findMany({
      where: { level: { in: ["HIGH", "CRITICAL"] } },
      orderBy: { score: "desc" },
      take: 15,
      include: { user: { select: { id: true, fullName: true, email: true, status: true } } },
    }),
    prisma.riskScore.count({ where: { level: { in: ["HIGH", "CRITICAL"] } } }),
  ]);

  const levelCount = (level: string) => byLevel.find((l) => l.level === level)?._count._all ?? 0;

  return (
    <>
      <PageHeader
        title="Fraud detection"
        description="Signals raised by the risk engine. Every one is a prompt to look, not a verdict."
        action={
          <Button variant="outline" asChild>
            <Link href={`/admin/fraud?view=${showResolved ? "open" : "resolved"}`}>
              {showResolved ? "Show open" : "Show resolved"}
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Critical" value={String(levelCount("CRITICAL"))} icon={ShieldAlert} tone="warning" />
        <StatCard label="High" value={String(levelCount("HIGH"))} icon={ShieldAlert} tone="warning" />
        <StatCard label="Medium" value={String(levelCount("MEDIUM"))} icon={ShieldAlert} tone="muted" />
        <StatCard label="High-risk accounts" value={String(highRisk)} icon={ShieldAlert} />
      </div>

      <Alert variant="info" className="mt-5">
        <AlertTitle>What the engine looks at</AlertTitle>
        <AlertDescription>
          Sign-up and referral velocity, task timings against the server clock, repeated payout details, and duplicate
          survey transactions. It uses data the platform already holds — there is no device fingerprinting and no
          third-party tracking. Raw IP addresses are never stored, only salted hashes.
        </AlertDescription>
      </Alert>

      <Card className="mt-5">
        <CardHeader>
          <CardTitle>{showResolved ? "Resolved signals" : "Open signals"}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {events.length === 0 ? (
            <EmptyState
              icon={ShieldAlert}
              title={showResolved ? "Nothing resolved yet" : "No open signals"}
              description={
                showResolved
                  ? "Signals you close will be listed here with their history."
                  : "The risk engine has nothing outstanding for you to review."
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Member</TableHead>
                  <TableHead>Signal</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                  {!showResolved ? <TableHead className="text-right">Action</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatDateTime(event.createdAt)}
                    </TableCell>
                    <TableCell>
                      {event.user ? (
                        <>
                          <Link href={`/admin/users/${event.user.id}`} className="text-sm font-medium hover:underline">
                            {event.user.fullName}
                          </Link>
                          <p className="text-xs text-muted-foreground">{event.user.email}</p>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">No account attached</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-sm">{event.summary}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{titleCase(event.type)}</TableCell>
                    <TableCell>
                      <StatusBadge status={event.level} />
                    </TableCell>
                    <TableCell className="money text-right">{event.score}</TableCell>
                    {!showResolved ? (
                      <TableCell className="text-right">
                        <ResolveEvent id={event.id} />
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="mt-5">
        <CardHeader>
          <CardTitle>Accounts carrying the most risk</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {riskUsers.length === 0 ? (
            <EmptyState icon={ShieldAlert} title="No high-risk accounts" description="Nobody is above the review threshold." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Account status</TableHead>
                  <TableHead>Risk</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                  <TableHead>Last signal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {riskUsers.map((risk) => (
                  <TableRow key={risk.id}>
                    <TableCell>
                      <Link href={`/admin/users/${risk.user.id}`} className="text-sm font-medium hover:underline">
                        {risk.user.fullName}
                      </Link>
                      <p className="text-xs text-muted-foreground">{risk.user.email}</p>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={risk.user.status} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={risk.level} />
                    </TableCell>
                    <TableCell className="money text-right">{risk.score}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {risk.lastEventAt ? formatDateTime(risk.lastEventAt) : "—"}
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
