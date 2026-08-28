import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { formatMoney, toMajor } from "@/lib/money";
import { formatDateTime } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CampaignForm } from "../campaign-form";

export const metadata: Metadata = { title: "Campaign" };
export const dynamic = "force-dynamic";

export default async function AdminCampaignPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;

  const [campaign, settings, completions] = await Promise.all([
    prisma.campaign.findUnique({ where: { id } }),
    getSettings(),
    prisma.taskCompletion.findMany({
      where: { campaignId: id },
      orderBy: { createdAt: "desc" },
      take: 25,
      include: { user: { select: { fullName: true, email: true } } },
    }),
  ]);

  if (!campaign) notFound();

  return (
    <>
      <PageHeader
        title={campaign.name}
        description={`${campaign.advertiser} · ${campaign.completedCount} of ${campaign.totalQuota} completions · ${formatMoney(campaign.spentBudget)} of ${formatMoney(campaign.totalBudget)} spent`}
        action={
          <>
            <StatusBadge status={campaign.status} className="self-center" />
            <Button variant="outline" asChild>
              <Link href="/admin/campaigns">Back</Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <CardTitle>Edit campaign</CardTitle>
          </CardHeader>
          <CardContent>
            <CampaignForm
              defaultReward={settings.taskRewardDefault}
              campaign={{
                id: campaign.id,
                name: campaign.name,
                advertiser: campaign.advertiser,
                description: campaign.description,
                videoUrl: campaign.videoUrl,
                thumbnailUrl: campaign.thumbnailUrl ?? "",
                reward: String(toMajor(campaign.rewardAmount)),
                requiredWatchSeconds: campaign.requiredWatchSeconds,
                budget: String(toMajor(campaign.totalBudget)),
                dailyQuota: campaign.dailyQuota,
                totalQuota: campaign.totalQuota,
                targetCountries: campaign.targetCountries,
                startDate: campaign.startDate.toISOString().slice(0, 10),
                endDate: campaign.endDate.toISOString().slice(0, 10),
                status: campaign.status,
              }}
            />
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Recent completions</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {completions.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-muted-foreground">Nobody has completed this campaign yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Member</TableHead>
                    <TableHead className="text-right">Watched</TableHead>
                    <TableHead>When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {completions.map((completion) => (
                    <TableRow key={completion.id}>
                      <TableCell className="max-w-[140px] truncate text-sm">{completion.user.fullName}</TableCell>
                      <TableCell className="money text-right">{completion.watchedSeconds}s</TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatDateTime(completion.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
