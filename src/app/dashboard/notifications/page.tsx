import type { Metadata } from "next";
import Link from "next/link";
import { Bell } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { relativeTime, titleCase } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { MarkAllRead } from "./mark-all-read";

export const metadata: Metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const user = await requireUser();
  const notifications = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 60,
  });

  const unread = notifications.filter((n) => !n.readAt).length;

  return (
    <>
      <PageHeader
        title="Notifications"
        description={unread > 0 ? `${unread} unread` : "You are up to date."}
        action={unread > 0 ? <MarkAllRead /> : undefined}
      />

      <Card>
        <CardContent className="p-0">
          {notifications.length === 0 ? (
            <EmptyState
              icon={Bell}
              title="Nothing here yet"
              description="Rewards, withdrawal updates and security alerts will land here as they happen."
            />
          ) : (
            <ul className="divide-y">
              {notifications.map((notification) => (
                <li
                  key={notification.id}
                  className={`px-5 py-4 ${notification.readAt ? "" : "bg-primary/[0.03]"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{notification.title}</p>
                        {!notification.readAt ? <Badge>New</Badge> : null}
                        <Badge variant="neutral">{titleCase(notification.type)}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{notification.body}</p>
                      {notification.href ? (
                        <Link
                          href={notification.href}
                          className="mt-2 inline-block text-sm font-medium text-primary hover:underline"
                        >
                          Open
                        </Link>
                      ) : null}
                    </div>
                    <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                      {relativeTime(notification.createdAt)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
