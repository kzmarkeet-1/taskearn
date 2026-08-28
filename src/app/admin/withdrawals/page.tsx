import type { Metadata } from "next";
import { Banknote } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { payoutStatuses, PAYOUT_METHOD_LABELS } from "@/lib/payouts";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { WithdrawalFilters } from "./withdrawal-filters";
import { WithdrawalActions } from "./withdrawal-actions";

export const metadata: Metadata = { title: "Withdrawals" };
export const dynamic = "force-dynamic";

export default async function AdminWithdrawalsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireAdmin();
  const { status } = await searchParams;
  const filter = status ?? "PENDING";

  const where: Prisma.WithdrawalWhereInput = filter === "ALL" ? {} : { status: filter as never };

  const [withdrawals, waiting, inFlight, completed] = await Promise.all([
    prisma.withdrawal.findMany({
      where,
      orderBy: { createdAt: "asc" },
      take: 100,
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            status: true,
            createdAt: true,
            riskScore: { select: { level: true, score: true } },
            wallet: { select: { lifetimeWithdrawn: true } },
          },
        },
      },
    }),
    prisma.withdrawal.count({ where: { status: { in: ["PENDING", "UNDER_REVIEW"] } } }),
    prisma.withdrawal.aggregate({
      where: { status: { in: ["PENDING", "UNDER_REVIEW", "APPROVED", "PROCESSING"] } },
      _sum: { netAmount: true },
    }),
    prisma.withdrawal.aggregate({ where: { status: "COMPLETED" }, _sum: { netAmount: true }, _count: { _all: true } }),
  ]);

  const providers = payoutStatuses();
  const manualOnly = providers.every((p) => !p.configured);

  return (
    <>
      <PageHeader
        title="Withdrawals"
        description="Approve, process and complete payouts. Every state change is recorded against the member's ledger."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Waiting on you" value={String(waiting)} icon={Banknote} tone="warning" />
        <StatCard label="Money in flight" value={formatMoney(inFlight._sum.netAmount ?? 0)} hint="Debited, not yet sent" icon={Banknote} />
        <StatCard
          label="Paid out"
          value={formatMoney(completed._sum.netAmount ?? 0)}
          hint={`${completed._count._all} completed`}
          icon={Banknote}
          tone="success"
        />
      </div>

      {manualOnly ? (
        <Alert variant="info" className="mt-5">
          <AlertTitle>No payment provider is connected</AlertTitle>
          <AlertDescription>
            Marking a withdrawal as processing or completed does not move money by itself. Send the transfer through
            your JazzCash, Easypaisa or bank channel first, then record it here with the provider reference. Nothing on
            this page simulates a payment.
          </AlertDescription>
        </Alert>
      ) : null}

      <Card className="mt-5">
        <CardContent className="p-4">
          <WithdrawalFilters current={filter} />
        </CardContent>
      </Card>

      <Card className="mt-5">
        <CardContent className="p-0">
          {withdrawals.length === 0 ? (
            <EmptyState
              icon={Banknote}
              title="Nothing in this view"
              description="No withdrawal currently has that status."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Member</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {withdrawals.map((withdrawal) => (
                  <TableRow key={withdrawal.id}>
                    <TableCell>
                      <p className="money text-xs">{withdrawal.reference}</p>
                      <p className="text-xs text-muted-foreground">{formatDateTime(withdrawal.createdAt)}</p>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm font-medium">{withdrawal.user.fullName}</p>
                      <p className="text-xs text-muted-foreground">{withdrawal.user.email}</p>
                      <div className="mt-1 flex gap-1.5">
                        <StatusBadge status={withdrawal.user.status} />
                        <StatusBadge status={withdrawal.user.riskScore?.level ?? "LOW"} />
                      </div>
                    </TableCell>
                    <TableCell className="text-xs">
                      <p className="font-medium">{PAYOUT_METHOD_LABELS[withdrawal.method]}</p>
                      <p className="text-muted-foreground">{withdrawal.accountName}</p>
                      <p className="font-mono text-muted-foreground">{withdrawal.accountNumber}</p>
                      {withdrawal.bankName ? <p className="text-muted-foreground">{withdrawal.bankName}</p> : null}
                    </TableCell>
                    <TableCell className="money text-right text-muted-foreground">
                      {formatMoney(withdrawal.grossAmount, { withCurrency: false })}
                    </TableCell>
                    <TableCell className="text-right money font-medium">
                      {formatMoney(withdrawal.netAmount, { withCurrency: false })}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={withdrawal.status} />
                      {withdrawal.providerReference ? (
                        <p className="mt-1 money text-xs text-muted-foreground">{withdrawal.providerReference}</p>
                      ) : null}
                      {withdrawal.rejectionReason ? (
                        <p className="mt-1 max-w-[180px] text-xs text-muted-foreground">{withdrawal.rejectionReason}</p>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right">
                      <WithdrawalActions
                        id={withdrawal.id}
                        status={withdrawal.status}
                        reference={withdrawal.reference}
                        netAmount={withdrawal.netAmount}
                      />
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
