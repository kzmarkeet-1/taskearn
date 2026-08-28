import type { Metadata } from "next";
import Link from "next/link";
import { UserPlus } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Referrals" };
export const dynamic = "force-dynamic";

export default async function AdminReferralsPage() {
  await requireAdmin();

  const [referrals, counts, paidOut, topReferrers] = await Promise.all([
    prisma.referral.findMany({
      orderBy: { createdAt: "desc" },
      take: 60,
      include: {
        referrer: { select: { id: true, fullName: true, email: true } },
        referee: { select: { id: true, fullName: true, email: true, createdAt: true } },
      },
    }),
    prisma.referral.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.referral.aggregate({ _sum: { rewardAmount: true } }),
    prisma.referral.groupBy({
      by: ["referrerId"],
      _count: { _all: true },
      _sum: { rewardAmount: true },
      orderBy: { _count: { referrerId: "desc" } },
      take: 10,
    }),
  ]);

  const referrers = await prisma.user.findMany({
    where: { id: { in: topReferrers.map((r) => r.referrerId) } },
    select: { id: true, fullName: true, email: true },
  });
  const referrerById = new Map(referrers.map((r) => [r.id, r]));

  const countFor = (status: string) => counts.find((c) => c.status === status)?._count._all ?? 0;

  return (
    <>
      <PageHeader
        title="Referrals"
        description="One level only. Members earn from the people they invited and from nobody further down the chain."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total invites"
          value={String(counts.reduce((sum, c) => sum + c._count._all, 0))}
          icon={UserPlus}
        />
        <StatCard label="Pending" value={String(countFor("PENDING"))} hint="Not yet qualified" icon={UserPlus} tone="warning" />
        <StatCard
          label="Qualified"
          value={String(countFor("QUALIFIED") + countFor("REWARDED"))}
          icon={UserPlus}
          tone="success"
        />
        <StatCard label="Paid out" value={formatMoney(paidOut._sum.rewardAmount ?? 0)} icon={UserPlus} />
      </div>

      <Alert variant="info" className="mt-5">
        <AlertTitle>Why this stays flat</AlertTitle>
        <AlertDescription>
          The schema has no second tier and no commission chain. A referral pays once the invited member has earned
          real rewards of their own, which is what keeps the programme from rewarding bulk sign-ups.
        </AlertDescription>
      </Alert>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_340px]">
        <Card>
          <CardHeader>
            <CardTitle>Recent referrals</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {referrals.length === 0 ? (
              <EmptyState
                icon={UserPlus}
                title="No referrals yet"
                description="Nobody has signed up through an invite link."
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Referrer</TableHead>
                    <TableHead>Invited</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {referrals.map((referral) => (
                    <TableRow key={referral.id}>
                      <TableCell>
                        <Link
                          href={`/admin/users/${referral.referrer.id}`}
                          className="text-sm font-medium hover:underline"
                        >
                          {referral.referrer.fullName}
                        </Link>
                        <p className="text-xs text-muted-foreground">{referral.referrer.email}</p>
                      </TableCell>
                      <TableCell>
                        <Link href={`/admin/users/${referral.referee.id}`} className="text-sm hover:underline">
                          {referral.referee.fullName}
                        </Link>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatDate(referral.createdAt)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={referral.status} />
                      </TableCell>
                      <TableCell className="money text-right">{formatMoney(referral.rewardAmount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Most invites</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead className="text-right">Invites</TableHead>
                  <TableHead className="text-right">Earned</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topReferrers.map((row) => {
                  const referrer = referrerById.get(row.referrerId);
                  return (
                    <TableRow key={row.referrerId}>
                      <TableCell className="max-w-[150px] truncate text-sm">
                        {referrer ? (
                          <Link href={`/admin/users/${referrer.id}`} className="hover:underline">
                            {referrer.fullName}
                          </Link>
                        ) : (
                          "Unknown"
                        )}
                      </TableCell>
                      <TableCell className="money text-right">{row._count._all}</TableCell>
                      <TableCell className="money text-right">
                        {formatMoney(row._sum.rewardAmount ?? 0, { withCurrency: false })}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
