import type { Metadata } from "next";
import Link from "next/link";
import { Coins } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { formatMoney } from "@/lib/money";
import { formatDateTime, titleCase } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TransactionFilters } from "./transaction-filters";

export const metadata: Metadata = { title: "Transactions" };
export const dynamic = "force-dynamic";

export default async function AdminTransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; q?: string; page?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1) || 1);
  const size = 50;
  const type = params.type;
  const query = params.q?.trim();

  const where: Prisma.WalletTransactionWhereInput = {
    ...(type && type !== "ALL" ? { type: type as never } : {}),
    ...(query
      ? {
          OR: [
            { user: { email: { contains: query, mode: "insensitive" } } },
            { user: { fullName: { contains: query, mode: "insensitive" } } },
            { reference: { contains: query, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [transactions, total] = await Promise.all([
    prisma.walletTransaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * size,
      take: size,
      include: { user: { select: { id: true, fullName: true, email: true } } },
    }),
    prisma.walletTransaction.count({ where }),
  ]);

  const pages = Math.max(1, Math.ceil(total / size));
  const search = new URLSearchParams({ ...(type ? { type } : {}), ...(query ? { q: query } : {}) });

  return (
    <>
      <PageHeader
        title="Transactions"
        description={`${total} ledger rows in this view. Rows are append-only — a correction is a new row, never an edit.`}
      />

      <Card>
        <CardContent className="p-4">
          <TransactionFilters defaultType={type ?? "ALL"} defaultQuery={query ?? ""} />
        </CardContent>
      </Card>

      <Card className="mt-5">
        <CardContent className="p-0">
          {transactions.length === 0 ? (
            <EmptyState icon={Coins} title="No rows match" description="Try a different type or search term." />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Member</TableHead>
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
                      <TableCell>
                        <Link
                          href={`/admin/users/${transaction.user.id}`}
                          className="text-sm font-medium hover:underline"
                        >
                          {transaction.user.fullName}
                        </Link>
                        <p className="text-xs text-muted-foreground">{transaction.user.email}</p>
                      </TableCell>
                      <TableCell className="max-w-xs truncate">{transaction.description}</TableCell>
                      <TableCell>
                        <Badge variant="neutral">{titleCase(transaction.type)}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{titleCase(transaction.bucket)}</TableCell>
                      <TableCell
                        className={`text-right money font-medium ${
                          transaction.amount > 0 ? "text-success" : ""
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
                    {page > 1 ? (
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/admin/transactions?${search.toString()}&page=${page - 1}`}>Previous</Link>
                      </Button>
                    ) : null}
                    {page < pages ? (
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/admin/transactions?${search.toString()}&page=${page + 1}`}>Next</Link>
                      </Button>
                    ) : null}
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
