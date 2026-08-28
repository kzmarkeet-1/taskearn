import type { Metadata } from "next";
import { UserPlus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getReferralSummary } from "@/lib/referrals";
import { getSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ReferralLink } from "./referral-link";

export const metadata: Metadata = { title: "Referrals" };
export const dynamic = "force-dynamic";

export default async function ReferralsPage() {
  const user = await requireUser();
  const [summary, settings] = await Promise.all([getReferralSummary(user.id), getSettings()]);

  return (
    <>
      <PageHeader
        title="Referrals"
        description="Invite people you know. You earn when they do real work, not when they sign up."
      />

      {!settings.enableReferrals ? (
        <Alert variant="warning" className="mb-6">
          <AlertTitle>The referral programme is paused</AlertTitle>
          <AlertDescription>Existing referrals are unaffected. New invitations will not qualify while it is off.</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Invited" value={String(summary.total)} icon={UserPlus} tone="muted" />
        <StatCard label="Qualified" value={String(summary.active)} hint="Passed the earnings threshold" icon={UserPlus} tone="success" />
        <StatCard label="Referral earnings" value={formatMoney(summary.totalEarned)} icon={UserPlus} />
      </div>

      <Card className="mt-5">
        <CardHeader>
          <CardTitle>Your invite link</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ReferralLink code={summary.code} link={summary.link} />
          <div className="rounded-lg bg-muted/60 p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">How it pays</p>
            <ul className="mt-2 list-disc space-y-1.5 pl-5">
              <li>
                You earn {formatMoney(settings.referralReward)} once someone you invited has earned{" "}
                {formatMoney(settings.referralQualifyingEarnings)} of their own.
              </li>
              <li>
                After that you earn {settings.referralPercentage / 100}% of their rewards, up to{" "}
                {formatMoney(settings.maximumReferralReward)} per person.
              </li>
              <li>
                One level only. You earn from the people you invited and from nobody further down. There is no
                downline, and inviting people who never complete anything pays nothing.
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-5">
        <CardHeader>
          <CardTitle>People you invited</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {summary.referrals.length === 0 ? (
            <EmptyState
              icon={UserPlus}
              title="Nobody has joined with your link yet"
              description="Share your link with people who would actually use the platform. Sign-ups that never complete anything earn you nothing."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Member</TableHead>
                  <TableHead>Joined</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Earned you</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.referrals.map((referral) => (
                  <TableRow key={referral.id}>
                    <TableCell className="font-medium">{maskName(referral.referee.fullName)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(referral.createdAt)}</TableCell>
                    <TableCell>
                      <StatusBadge status={referral.status} />
                    </TableCell>
                    <TableCell className="text-right money font-medium">
                      {formatMoney(referral.rewardAmount)}
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

/** Referred members are shown by first name and an initial only. */
function maskName(fullName: string) {
  const [first, ...rest] = fullName.split(" ");
  return rest.length > 0 ? `${first} ${rest[rest.length - 1][0]}.` : first;
}
