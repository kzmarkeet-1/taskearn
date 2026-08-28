import type { Metadata } from "next";
import Link from "next/link";
import { LifeBuoy } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { formatDateTime } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { TicketThread } from "./ticket-thread";

export const metadata: Metadata = { title: "Support" };
export const dynamic = "force-dynamic";

const VIEWS = [
  { value: "OPEN", label: "Open" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "WAITING_FOR_USER", label: "Waiting on member" },
  { value: "RESOLVED", label: "Resolved" },
  { value: "CLOSED", label: "Closed" },
  { value: "ALL", label: "All" },
];

export default async function AdminSupportPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireAdmin();
  const { status } = await searchParams;
  const filter = status ?? "OPEN";

  const where: Prisma.SupportTicketWhereInput = filter === "ALL" ? {} : { status: filter as never };

  const tickets = await prisma.supportTicket.findMany({
    where,
    orderBy: { updatedAt: "asc" },
    take: 50,
    include: {
      user: { select: { id: true, fullName: true, email: true, status: true } },
      messages: { orderBy: { createdAt: "asc" } },
    },
  });

  return (
    <>
      <PageHeader
        title="Support"
        description="Oldest first, because the person waiting longest should be answered first."
      />

      <Card>
        <CardContent className="flex flex-wrap gap-2 p-4">
          {VIEWS.map((view) => (
            <Button key={view.value} variant={filter === view.value ? "default" : "outline"} size="sm" asChild>
              <Link href={`/admin/support?status=${view.value}`}>{view.label}</Link>
            </Button>
          ))}
        </CardContent>
      </Card>

      {tickets.length === 0 ? (
        <Card className="mt-5">
          <EmptyState
            icon={LifeBuoy}
            title="Nothing in this view"
            description="No ticket currently has that status."
          />
        </Card>
      ) : (
        <div className="mt-5 space-y-4">
          {tickets.map((ticket) => (
            <Card key={ticket.id}>
              <CardContent className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{ticket.subject}</h3>
                      <StatusBadge status={ticket.status} />
                      <StatusBadge status={ticket.priority} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      <span className="money">{ticket.reference}</span> · {ticket.category} · opened{" "}
                      {formatDateTime(ticket.createdAt)} by{" "}
                      <Link href={`/admin/users/${ticket.user.id}`} className="hover:underline">
                        {ticket.user.fullName}
                      </Link>{" "}
                      ({ticket.user.email})
                    </p>
                  </div>
                </div>

                <TicketThread
                  id={ticket.id}
                  status={ticket.status}
                  priority={ticket.priority}
                  messages={ticket.messages.map((message) => ({
                    id: message.id,
                    body: message.body,
                    isStaff: message.isStaff,
                    createdAt: message.createdAt.toISOString(),
                  }))}
                />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
