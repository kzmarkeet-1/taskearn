import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { getDailyUsage, getEntitlements, listTierPlans } from "@/lib/tiers";
import { gatewayStatuses } from "@/lib/payments";
import { getSettings } from "@/lib/settings";
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/money";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { MembershipPanel } from "./membership-panel";

export const metadata: Metadata = { title: "Membership" };
export const dynamic = "force-dynamic";

export default async function MembershipPage() {
  const user = await requireUser();
  const settings = await getSettings();

  const [plans, entitlements] = await Promise.all([listTierPlans(), getEntitlements(user.id)]);
  const usage = await getDailyUsage(user.id, entitlements);

  const deposits = await prisma.deposit.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: {
      reference: true,
      method: true,
      tier: true,
      amount: true,
      status: true,
      network: true,
      txHash: true,
      confirmations: true,
      requiredConfirmations: true,
      createdAt: true,
    },
  });

  const methods = gatewayStatuses().filter((m) => m.configured);

  return (
    <>
      <PageHeader
        title="Membership"
        description="Your daily allowance for tasks and surveys. A paid membership raises the limit for a fixed term."
      />

      {/* Said plainly and on the page itself, not buried in the terms. A member
          who expects a return from a tier has been misled, whatever the terms
          say, so the correction belongs where they are deciding. */}
      <Alert variant="info" className="mb-6">
        <AlertTitle>What a membership is</AlertTitle>
        <AlertDescription>
          A membership is a subscription, not an investment. It lets you complete more tasks and surveys each day for
          the length of the term. It does not pay a return, it earns nothing on its own, and there is no guarantee you
          will earn back what it costs — that depends entirely on the work you do and on what advertisers and panels
          are running.
        </AlertDescription>
      </Alert>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          {!settings.enableMemberships ? (
            <Alert variant="warning">
              <AlertTitle>Paid memberships are not open yet</AlertTitle>
              <AlertDescription>
                Everyone is on the Free allowance. The tiers below are shown so you can see what is planned.
              </AlertDescription>
            </Alert>
          ) : methods.length === 0 ? (
            <Alert variant="warning">
              <AlertTitle>No payment method is available</AlertTitle>
              <AlertDescription>
                Memberships are switched on but no gateway is configured on this deployment, so nothing can be
                purchased yet.
              </AlertDescription>
            </Alert>
          ) : null}

          <MembershipPanel
            plans={plans.map((plan) => ({
              tier: plan.tier,
              name: plan.name,
              description: plan.description,
              priceAmount: plan.priceAmount,
              durationDays: plan.durationDays,
              dailyTaskLimit: plan.dailyTaskLimit,
              dailySurveyLimit: plan.dailySurveyLimit,
              withdrawalFeeDiscountBps: plan.withdrawalFeeDiscountBps,
              current: plan.tier === entitlements.tier,
            }))}
            methods={methods.map((m) => ({ method: m.method, name: m.name, networks: m.networks }))}
            purchasable={settings.enableMemberships && methods.length > 0}
          />

          {deposits.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Recent payments</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ul className="divide-y">
                  {deposits.map((deposit) => (
                    <li key={deposit.reference} className="px-5 py-3.5 text-sm">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="font-medium">
                          {deposit.tier ?? "—"} · {formatMoney(deposit.amount)}
                        </span>
                        <span className="text-xs text-muted-foreground">{deposit.status}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {deposit.reference} · {deposit.createdAt.toDateString()}
                      </p>
                      {deposit.txHash ? (
                        // Shown so a member can verify the transfer on a block
                        // explorer themselves rather than taking our word for it.
                        <p className="mt-1 money break-all text-[11px] text-muted-foreground">
                          {deposit.network} · {deposit.txHash} ({deposit.confirmations}/
                          {deposit.requiredConfirmations} confirmations)
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Today</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Current membership</p>
              <p className="mt-1 text-lg font-semibold">{entitlements.planName}</p>
              {entitlements.expiresAt ? (
                <p className="text-xs text-muted-foreground">Ends {entitlements.expiresAt.toDateString()}</p>
              ) : null}
            </div>

            <div>
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-muted-foreground">Video tasks</span>
                <span className="money font-medium">
                  {usage.tasksToday} / {usage.taskLimit}
                </span>
              </div>
              <Progress
                className="mt-2"
                value={Math.min(usage.tasksToday, usage.taskLimit)}
                max={usage.taskLimit}
                label="Daily task allowance"
              />
            </div>

            <div>
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-muted-foreground">Surveys</span>
                <span className="money font-medium">
                  {usage.surveysToday} / {usage.surveyLimit}
                </span>
              </div>
              <Progress
                className="mt-2"
                value={Math.min(usage.surveysToday, usage.surveyLimit)}
                max={usage.surveyLimit}
                label="Daily survey allowance"
              />
            </div>

            <p className="text-xs text-muted-foreground">
              Allowances reset at midnight. Anything you have already earned is unaffected by a membership ending.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
