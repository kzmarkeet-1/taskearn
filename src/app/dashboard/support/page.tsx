import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SupportPanel } from "./support-panel";

export const metadata: Metadata = { title: "Support" };
export const dynamic = "force-dynamic";

export default async function SupportPage() {
  const user = await requireUser();
  const tickets = await prisma.supportTicket.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });

  return (
    <>
      <PageHeader
        title="Support"
        description="Open a ticket and an operator will pick it up. Include references where you can — it is faster."
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <SupportPanel
          tickets={tickets.map((ticket) => ({
            id: ticket.id,
            reference: ticket.reference,
            subject: ticket.subject,
            status: ticket.status,
            createdAt: ticket.createdAt.toISOString(),
            messages: ticket.messages.map((message) => ({
              id: message.id,
              body: message.body,
              isStaff: message.isStaff,
              createdAt: message.createdAt.toISOString(),
            })),
          }))}
        />

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Before you write</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">Reward missing?</span> Check your wallet first — most
              rewards sit in the pending balance until the verification hold passes.
            </p>
            <p>
              <span className="font-medium text-foreground">Survey ended early?</span> That is a screen-out by the
              panel, not a fault on your account, and no reward is due.
            </p>
            <p>
              <span className="font-medium text-foreground">Withdrawal question?</span> Include the reference from your
              withdraw page.
            </p>
            <p>
              <span className="font-medium text-foreground">Account under review?</span> Say so in the ticket and an
              operator will go through the flag with you.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
