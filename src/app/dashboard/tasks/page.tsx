import type { Metadata } from "next";
import Link from "next/link";
import { PlaySquare, Clock, Users } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { listAvailableCampaigns } from "@/lib/tasks";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export const metadata: Metadata = { title: "Video tasks" };
export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const user = await requireUser();
  const { campaigns, disabled, allowance } = await listAvailableCampaigns({
    id: user.id,
    country: user.country,
  });

  const open = campaigns.filter((c) => c.available);
  const closed = campaigns.filter((c) => !c.available);

  return (
    <>
      <PageHeader
        title="Video tasks"
        description="Watch a sponsored video for the stated time and the reward is yours."
      />

      {allowance && allowance.remaining <= 0 ? (
        <Alert variant="info" className="mb-6">
          <AlertTitle>You have used today&rsquo;s allowance</AlertTitle>
          <AlertDescription>
            {allowance.planName} membership covers {allowance.limit} tasks a day, and you have completed all of them.
            Your allowance resets at midnight — or you can raise it on the{" "}
            <Link href="/dashboard/membership" className="underline underline-offset-2">
              membership page
            </Link>
            .
          </AlertDescription>
        </Alert>
      ) : allowance ? (
        <p className="mb-6 text-sm text-muted-foreground">
          {allowance.remaining} of {allowance.limit} tasks left today on {allowance.planName}.
        </p>
      ) : null}

      {disabled ? (
        <Alert variant="warning">
          <AlertTitle>Video tasks are turned off</AlertTitle>
          <AlertDescription>An administrator has paused this module. Surveys are unaffected.</AlertDescription>
        </Alert>
      ) : null}

      {open.length === 0 && !disabled ? (
        <Card>
          <EmptyState
            icon={PlaySquare}
            title="No campaigns are open to you right now"
            description="Campaigns appear as advertisers fund them, and each has a daily quota. Check back later, or take a survey in the meantime."
            action={
              <Button asChild>
                <Link href="/dashboard/surveys">Browse surveys</Link>
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {open.map((campaign) => (
            <Card key={campaign.id} className="flex flex-col">
              <CardContent className="flex flex-1 flex-col p-5">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{campaign.advertiser}</p>
                  {campaign.isDemo ? <Badge variant="neutral">Demo</Badge> : null}
                </div>
                <h3 className="mt-1.5 font-semibold leading-snug">{campaign.name}</h3>
                <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{campaign.description}</p>

                <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <dt className="text-muted-foreground">Reward</dt>
                    <dd className="mt-0.5 text-sm money font-semibold text-success">
                      {formatMoney(campaign.rewardAmount)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Watch time</dt>
                    <dd className="mt-0.5 flex items-center gap-1 text-sm money font-medium">
                      <Clock className="size-3.5" />
                      {campaign.requiredWatchSeconds}s
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Slots left today</dt>
                    <dd className="mt-0.5 flex items-center gap-1 text-sm money font-medium">
                      <Users className="size-3.5" />
                      {campaign.remainingQuota}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Closes</dt>
                    <dd className="mt-0.5 text-sm font-medium">{formatDate(campaign.endDate)}</dd>
                  </div>
                </dl>

                <Button className="mt-5 w-full" asChild>
                  <Link href={`/dashboard/tasks/${campaign.id}`}>Start task</Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {closed.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-sm font-semibold text-muted-foreground">Not open to you</h2>
          <ul className="mt-3 divide-y rounded-xl border bg-card">
            {closed.map((campaign) => (
              <li key={campaign.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{campaign.name}</p>
                  <p className="text-xs text-muted-foreground">{campaign.advertiser}</p>
                </div>
                <Badge variant="neutral">{campaign.note}</Badge>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
