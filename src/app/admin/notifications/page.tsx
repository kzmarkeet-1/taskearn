import type { Metadata } from "next";
import { Bell } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDateTime, titleCase } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BroadcastForm } from "./broadcast-form";

export const metadata: Metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

export default async function AdminNotificationsPage() {
  await requireAdmin();

  const [recent, byType, unread, queuedEmails] = await Promise.all([
    prisma.notification.findMany({
      where: { type: "SYSTEM_ANNOUNCEMENT" },
      orderBy: { createdAt: "desc" },
      take: 25,
      include: { user: { select: { email: true } } },
    }),
    prisma.notification.groupBy({ by: ["type"], _count: { _all: true } }),
    prisma.notification.count({ where: { readAt: null } }),
    prisma.notification.count({ where: { emailQueuedAt: { not: null }, emailSentAt: null } }),
  ]);

  const total = byType.reduce((sum, row) => sum + row._count._all, 0);

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Send an announcement to a group of members, and see what the platform has been sending automatically."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Notifications sent" value={String(total)} icon={Bell} />
        <StatCard label="Unread" value={String(unread)} icon={Bell} tone="muted" />
        <StatCard label="Emails queued" value={String(queuedEmails)} hint="Waiting on the mail worker" icon={Bell} tone="warning" />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Send an announcement</CardTitle>
            </CardHeader>
            <CardContent>
              <BroadcastForm />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent announcements</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {recent.length === 0 ? (
                <EmptyState icon={Bell} title="Nothing sent yet" description="Announcements you send will be listed here." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Recipient</TableHead>
                      <TableHead>Sent</TableHead>
                      <TableHead>Read</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recent.map((notification) => (
                      <TableRow key={notification.id}>
                        <TableCell className="max-w-[220px] truncate text-sm">{notification.title}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{notification.user.email}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {formatDateTime(notification.createdAt)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={notification.readAt ? "success" : "neutral"}>
                            {notification.readAt ? "Read" : "Unread"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>By type</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Sent</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {byType.map((row) => (
                  <TableRow key={row.type}>
                    <TableCell className="text-sm">{titleCase(row.type)}</TableCell>
                    <TableCell className="money text-right">{row._count._all}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
