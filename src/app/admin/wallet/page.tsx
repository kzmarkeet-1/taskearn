import type { Metadata } from "next";
import { Coins, Wallet } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { pendingLiabilities } from "@/lib/wallet";
import { formatMoney } from "@/lib/money";
import { titleCase } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AdjustmentForm } from "./adjustment-form";

export const metadata: Metadata = { title: "Wallet overview" };
export const dynamic = "force-dynamic";

export default async function AdminWalletPage() {
  await requireAdmin();

  const [liabilities, totals, byType, topBalances] = await Promise.all([
    pendingLiabilities(),
    prisma.wallet.aggregate({
      _sum: {
        availableBalance: true,
        pendingBalance: true,
        bonusBalance: true,
        referralBalance: true,
        lifetimeEarned: true,
        lifetimeWithdrawn: true,
      },
    }),
    prisma.walletTransaction.groupBy({ by: ["type"], _sum: { amount: true }, _count: { _all: true } }),
    prisma.wallet.findMany({
      orderBy: { availableBalance: "desc" },
      take: 10,
      include: { user: { select: { fullName: true, email: true } } },
    }),
  ]);

  const sums = totals._sum;

  return (
    <>
      <PageHeader
        title="Wallet overview"
        description="Aggregate position across every member wallet. These figures come from the ledger, not from cached counters."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Available" value={formatMoney(sums.availableBalance ?? 0)} hint="Withdrawable today" icon={Wallet} />
        <StatCard label="Pending" value={formatMoney(sums.pendingBalance ?? 0)} hint="Still in the hold period" icon={Wallet} tone="warning" />
        <StatCard label="Bonus" value={formatMoney(sums.bonusBalance ?? 0)} icon={Wallet} tone="muted" />
        <StatCard label="Referral" value={formatMoney(sums.referralBalance ?? 0)} icon={Wallet} tone="success" />
      </div>

      <Alert variant="warning" className="mt-5">
        <AlertTitle>Total obligation to members: {formatMoney(liabilities.userBalances + liabilities.withdrawalsInFlight)}</AlertTitle>
        <AlertDescription>
          {formatMoney(liabilities.userBalances)} sits in wallets and {formatMoney(liabilities.withdrawalsInFlight)} has
          been debited for withdrawals that have not been sent yet. Keep funded reserves at or above this figure.
        </AlertDescription>
      </Alert>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Ledger by transaction type</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Rows</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byType.map((row) => (
                  <TableRow key={row.type}>
                    <TableCell>{titleCase(row.type)}</TableCell>
                    <TableCell className="money text-right text-muted-foreground">{row._count._all}</TableCell>
                    <TableCell className="money text-right">{formatMoney(row._sum.amount ?? 0)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Largest available balances</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead className="text-right">Available</TableHead>
                    <TableHead className="text-right">Lifetime</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topBalances.map((wallet) => (
                    <TableRow key={wallet.id}>
                      <TableCell className="max-w-[180px] truncate text-sm">{wallet.user.fullName}</TableCell>
                      <TableCell className="money text-right">{formatMoney(wallet.availableBalance)}</TableCell>
                      <TableCell className="money text-right text-muted-foreground">
                        {formatMoney(wallet.lifetimeEarned)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex-row items-center gap-2 space-y-0">
              <Coins className="size-4 text-muted-foreground" />
              <CardTitle>Manual adjustment</CardTitle>
            </CardHeader>
            <CardContent>
              <AdjustmentForm />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
