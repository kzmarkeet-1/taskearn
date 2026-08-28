import type { Metadata } from "next";
import Link from "next/link";
import { Megaphone } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const metadata: Metadata = { title: "Campaigns" };
export const dynamic = "force-dynamic";

export default async function AdminCampaignsPage() {
  await requireAdmin();
  const campaigns = await prisma.campaign.findMany({ orderBy: { createdAt: "desc" }, take: 100 });

  return (
    <>
      <PageHeader
        title="Campaigns"
        description="Sponsored video campaigns. Each stops accepting completions when its budget, quota or end date runs out."
        action={
          <Button asChild>
            <Link href="/admin/campaigns/new">Create campaign</Link>
          </Button>
        }
      />

      <Card>
        <CardContent className="p-0">
          {campaigns.length === 0 ? (
            <EmptyState
              icon={Megaphone}
              title="No campaigns yet"
              description="Create one to give members something to work on."
              action={
                <Button asChild>
                  <Link href="/admin/campaigns/new">Create campaign</Link>
                </Button>
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead className="text-right">Reward</TableHead>
                  <TableHead>Budget used</TableHead>
                  <TableHead>Completions</TableHead>
                  <TableHead>Runs</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((campaign) => (
                  <TableRow key={campaign.id}>
                    <TableCell>
                      <p className="font-medium">{campaign.name}</p>
                      <p className="text-xs text-muted-foreground">{campaign.advertiser}</p>
                    </TableCell>
                    <TableCell className="money text-right">{formatMoney(campaign.rewardAmount)}</TableCell>
                    <TableCell className="min-w-[140px]">
                      <Progress
                        value={campaign.spentBudget}
                        max={Math.max(1, campaign.totalBudget)}
                        label={`${campaign.name} budget`}
                      />
                      <p className="money mt-1 text-xs text-muted-foreground">
                        {formatMoney(campaign.spentBudget, { withCurrency: false })} /{" "}
                        {formatMoney(campaign.totalBudget, { withCurrency: false })}
                      </p>
                    </TableCell>
                    <TableCell className="money">
                      {campaign.completedCount} / {campaign.totalQuota}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatDate(campaign.startDate)} → {formatDate(campaign.endDate)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={campaign.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`/admin/campaigns/${campaign.id}`}>Manage</Link>
                      </Button>
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
