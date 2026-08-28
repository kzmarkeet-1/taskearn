import type { Metadata } from "next";
import Link from "next/link";
import { Banknote, Clock, Gift, UserPlus, Wallet } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBalances, releaseMaturedRewards } from "@/lib/wallet";
import { getSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { formatDateTime, titleCase } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Wallet" };
export const dynamic = "force-dynamic";

export default async function WalletPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await requireUser();
  await releaseMaturedRewards(user.id);

  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam ?? 1) || 1);
  const size = 25;

  const [balances, settings, transactions, total] = await Promise.all([
    getBalances(user.id),
    getSettings(),
    prisma.walletTransaction.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * size,
      take: size,
    }),
    prisma.walletTransaction.count({ where: { userId: user.id } }),
  ]);

  const pages = Math.max(1, Math.ceil(total / size));

  return (
    <>
      <PageHeader
        title="Wallet"
        description="Every movement, with the balance it left behind. Nothing here is ever edited after the fact."
        action={
          <Button asChild>
            <Link href="/dashboard/withdraw">Withdraw</Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Available"
          value={formatMoney(balances.availableBalance)}
          hint="Withdrawable now"
          icon={Wallet}
        />
        <StatCard
          label="Pending"
          value={formatMoney(balances.pendingBalance)}
          hint={`Clears after ${Math.round(settings.pendingRewardCooldown / 60)}h`}
          icon={Clock}
          tone="warning"
        />
        <StatCard label="Bonus" value={formatMoney(balances.bonusBalance)} hint="Promotional credit" icon={Gift} tone="muted" />
        <StatCard
          label="Referral"
          value={formatMoney(balances.referralBalance)}
          hint="From people you invited"
          icon={UserPlus}
          tone="success"
        />
      </div>

      {/*
        The one place the engraved field appears. It marks the single figure a
        member actually cares about — what they can take out today — and it is
        the theme's only decorative move, spent here and nowhere else.
      */}
      <Card className="relative mt-5 overflow-hidden">
        <div className="ledger-field pointer-events-none absolute inset-0 opacity-60" aria-hidden />
        <CardContent className="relative flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Total you can withdraw</p>
            <p className="money mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">
              {formatMoney(balances.withdrawableBalance)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Available, bonus and referral balances combined. Pending rewards are not included until they clear.
            </p>
          </div>
          <div className="text-sm text-muted-foreground sm:text-right">
            <p>
              Lifetime earned <span className="money font-medium text-foreground">{formatMoney(balances.lifetimeEarned)}</span>
            </p>
            <p className="mt-1">
              Lifetime withdrawn{" "}
              <span className="money font-medium text-foreground">{formatMoney(balances.lifetimeWithdrawn)}</span>
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-5">
        <CardHeader>
          <CardTitle>Transaction history</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {transactions.length === 0 ? (
            <EmptyState
              icon={Banknote}
              title="No transactions yet"
              description="Complete a task or a survey and the first line will appear here."
              action={
                <Button asChild>
                  <Link href="/dashboard/tasks">Find a task</Link>
                </Button>
              }
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Bucket</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Balance after</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((transaction) => (
                    <TableRow key={transaction.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatDateTime(transaction.createdAt)}
                      </TableCell>
                      <TableCell className="max-w-xs truncate">{transaction.description}</TableCell>
                      <TableCell>
                        <Badge variant="neutral">{titleCase(transaction.type)}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{titleCase(transaction.bucket)}</TableCell>
                      <TableCell
                        className={`text-right money font-medium ${
                          transaction.amount > 0 ? "text-success" : "text-foreground"
                        }`}
                      >
                        {transaction.amount > 0 ? "+" : "−"}
                        {formatMoney(Math.abs(transaction.amount), { withCurrency: false })}
                      </TableCell>
                      <TableCell className="money text-right text-muted-foreground">
                        {formatMoney(transaction.balanceAfter, { withCurrency: false })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {pages > 1 ? (
                <div className="flex items-center justify-between border-t px-5 py-3 text-sm">
                  <span className="text-muted-foreground">
                    Page {page} of {pages}
                  </span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={page <= 1} asChild={page > 1}>
                      {page > 1 ? <Link href={`/dashboard/wallet?page=${page - 1}`}>Previous</Link> : <span>Previous</span>}
                    </Button>
                    <Button variant="outline" size="sm" disabled={page >= pages} asChild={page < pages}>
                      {page < pages ? <Link href={`/dashboard/wallet?page=${page + 1}`}>Next</Link> : <span>Next</span>}
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}
