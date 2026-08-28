import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { formatMoney } from "@/lib/money";
import { TaskRunner } from "./task-runner";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export const metadata: Metadata = { title: "Task" };
export const dynamic = "force-dynamic";

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const campaign = await prisma.campaign.findUnique({ where: { id } });
  if (!campaign) notFound();

  const completed = await prisma.taskCompletion.findUnique({
    where: { userId_campaignId: { userId: user.id, campaignId: id } },
  });

  return (
    <>
      <PageHeader
        title={campaign.name}
        description={`${campaign.advertiser} · ${formatMoney(campaign.rewardAmount)} for ${campaign.requiredWatchSeconds}s of viewing`}
        action={
          <Button variant="outline" asChild>
            <Link href="/dashboard/tasks">Back to tasks</Link>
          </Button>
        }
      />

      {completed ? (
        <Alert variant="success">
          <AlertTitle>You have already completed this task</AlertTitle>
          <AlertDescription>
            The reward of {formatMoney(completed.rewardAmount)} is in your wallet. Each campaign pays once per member.
          </AlertDescription>
        </Alert>
      ) : (
        <TaskRunner
          campaignId={campaign.id}
          description={campaign.description}
          videoUrl={campaign.videoUrl}
          requiredSeconds={campaign.requiredWatchSeconds}
          rewardAmount={campaign.rewardAmount}
        />
      )}
    </>
  );
}
