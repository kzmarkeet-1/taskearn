import type { Metadata } from "next";
import Link from "next/link";
import { ScrollText } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { formatDateTime } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Audit logs" };
export const dynamic = "force-dynamic";

export default async function AdminAuditLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string; page?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1) || 1);
  const size = 50;
  const entity = params.entity;

  const where: Prisma.AuditLogWhereInput = entity && entity !== "ALL" ? { entityType: entity } : {};

  const [logs, total, entities] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * size,
      take: size,
    }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.groupBy({ by: ["entityType"], _count: { _all: true } }),
  ]);

  const pages = Math.max(1, Math.ceil(total / size));

  return (
    <>
      <PageHeader title="Audit logs" description={`${total} recorded administrative actions.`} />

      <Alert variant="info" className="mb-5">
        <AlertDescription>
          Entries are written by the services themselves and are never edited or deleted from the admin panel. Each one
          keeps the before and after state so a change can be explained later.
        </AlertDescription>
      </Alert>

      <Card>
        <CardContent className="flex flex-wrap gap-2 p-4">
          <Button variant={!entity || entity === "ALL" ? "default" : "outline"} size="sm" asChild>
            <Link href="/admin/audit-logs">All</Link>
          </Button>
          {entities.map((row) => (
            <Button
              key={row.entityType}
              variant={entity === row.entityType ? "default" : "outline"}
              size="sm"
              asChild
            >
              <Link href={`/admin/audit-logs?entity=${row.entityType}`}>
                {row.entityType} ({row._count._all})
              </Link>
            </Button>
          ))}
        </CardContent>
      </Card>

      <Card className="mt-5">
        <CardContent className="p-0">
          {logs.length === 0 ? (
            <EmptyState icon={ScrollText} title="No entries" description="Nothing has been recorded for this filter." />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Change</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatDateTime(log.createdAt)}
                      </TableCell>
                      <TableCell className="text-xs">{log.actorEmail ?? "System"}</TableCell>
                      <TableCell>
                        <Badge variant="neutral">{log.action}</Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {log.entityType}
                        {log.entityId ? (
                          <span className="money block text-muted-foreground">{log.entityId.slice(0, 8)}…</span>
                        ) : null}
                      </TableCell>
                      <TableCell className="max-w-md">
                        <details>
                          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                            Before and after
                          </summary>
                          <pre className="mt-2 overflow-x-auto rounded-md bg-muted p-2.5 text-[11px] leading-relaxed">
                            {JSON.stringify({ before: log.before, after: log.after }, null, 2)}
                          </pre>
                        </details>
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
                        <Link href={`/admin/audit-logs?entity=${entity ?? "ALL"}&page=${page - 1}`}>Previous</Link>
                      </Button>
                    ) : null}
                    {page < pages ? (
                      <Button variant="outline" size="sm" asChild>
                        <Link href={`/admin/audit-logs?entity=${entity ?? "ALL"}&page=${page + 1}`}>Next</Link>
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
