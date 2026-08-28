import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Prose, PageIntro } from "@/components/site/prose";
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/money";
import { EmptyState } from "@/components/ui/empty-state";
import { PlaySquare } from "lucide-react";

export const metadata: Metadata = {
  title: "Video tasks",
  description: "How sponsored video tasks work on TaskEarn, and what is open right now.",
};

export const dynamic = "force-dynamic";

export default async function EarnPage() {
  const campaigns = await prisma.campaign
    .findMany({
      where: { status: "ACTIVE", endDate: { gte: new Date() } },
      orderBy: { rewardAmount: "desc" },
      take: 6,
      select: {
        id: true,
        name: true,
        advertiser: true,
        rewardAmount: true,
        requiredWatchSeconds: true,
        isDemo: true,
      },
    })
    .catch(() => []);

  return (
    <>
      <PageIntro
        eyebrow="Video tasks"
        title="Watch sponsored videos, get paid for your attention"
        description="Advertisers fund each campaign up front. Your reward comes out of that budget, not out of anyone's pocket but theirs."
      />
      <div className="container max-w-4xl py-12">
        <Prose>
          <h2>What a task involves</h2>
          <p>
            You open the campaign, read what the advertiser wants you to notice, and keep the video playing for the
            stated duration. The server times your session. When the time is up, you submit and the reward moves into
            your pending balance.
          </p>
          <h2>Where the line is</h2>
          <p>
            TaskEarn measures a session that a real person has open. It does not automate playback, spin up bots,
            manufacture watch time or views, or interact with the hosting platform on your behalf. Campaigns must
            respect the terms of the platform hosting the video as well as the advertiser&apos;s own rules, and campaigns
            that ask for anything else are rejected at review.
          </p>
        </Prose>

        <h2 className="mt-12 text-lg font-semibold">Open campaigns</h2>
        {campaigns.length === 0 ? (
          <Card className="mt-4">
            <EmptyState
              icon={PlaySquare}
              title="No campaigns are open right now"
              description="New sponsored campaigns are added as advertisers fund them. Create an account to be notified when one opens."
              action={
                <Button asChild>
                  <Link href="/register">Create an account</Link>
                </Button>
              }
            />
          </Card>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {campaigns.map((campaign) => (
              <Card key={campaign.id}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">{campaign.advertiser}</p>
                      <h3 className="mt-1 font-semibold">{campaign.name}</h3>
                    </div>
                    {campaign.isDemo ? (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">Demo</span>
                    ) : null}
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">
                    {formatMoney(campaign.rewardAmount)} · {campaign.requiredWatchSeconds}s of viewing
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <div className="mt-10">
          <Button asChild>
            <Link href="/register">Start earning</Link>
          </Button>
        </div>
      </div>
    </>
  );
}
