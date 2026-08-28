import type { Metadata } from "next";
import Link from "next/link";
import { Users } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UserFilters } from "./user-filters";

export const metadata: Metadata = { title: "Users" };
export const dynamic = "force-dynamic";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1) || 1);
  const size = 25;
  const query = params.q?.trim();
  const status = params.status;

  const where: Prisma.UserWhereInput = {
    ...(status && status !== "ALL" ? { status: status as never } : {}),
    ...(query
      ? {
          OR: [
            { email: { contains: query, mode: "insensitive" } },
            { fullName: { contains: query, mode: "insensitive" } },
            { phone: { contains: query } },
            { referralCode: { contains: query.toUpperCase() } },
          ],
        }
      : {}),
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * size,
      take: size,
      include: { wallet: true, riskScore: true },
    }),
    prisma.user.count({ where }),
  ]);

  const pages = Math.max(1, Math.ceil(total / size));

  return (
    <>
      <PageHeader title="Users" description={`${total} accounts match this view.`} />

      <Card>
        <CardContent className="p-4">
          <UserFilters defaultQuery={query ?? ""} defaultStatus={status ?? "ALL"} />
        </CardContent>
      </Card>

      <Card className="mt-5">
        <CardContent className="p-0">
          {users.length === 0 ? (
            <EmptyState icon={Users} title="No accounts match" description="Clear the filters or search a different term." />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead>Country</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead className="text-right">Available</TableHead>
                    <TableHead className="text-right">Pending</TableHead>
                    <TableHead>Risk</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <p className="font-medium">{user.fullName}</p>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                      </TableCell>
                      <TableCell className="text-xs">{user.country}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatDate(user.createdAt)}
                      </TableCell>
                      <TableCell className="money text-right">
                        {formatMoney(user.wallet?.availableBalance ?? 0, { withCurrency: false })}
                      </TableCell>
                      <TableCell className="money text-right text-muted-foreground">
                        {formatMoney(user.wallet?.pendingBalance ?? 0, { withCurrency: false })}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={user.riskScore?.level ?? "LOW"} />
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={user.status} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`/admin/users/${user.id}`}>View</Link>
                        </Button>
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
                        <Link href={`/admin/users?page=${page - 1}&q=${query ?? ""}&status=${status ?? "ALL"}`}>
                          Previous
                        </Link>
                      </Button>
                    ) : null}
                    {page < pages ? (
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/admin/users?page=${page + 1}&q=${query ?? ""}&status=${status ?? "ALL"}`}>
                          Next
                        </Link>
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
