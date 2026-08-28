import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { clientFingerprint } from "@/lib/api";
import { listSurveysForUser } from "@/lib/surveys";
import { formatMoney } from "@/lib/money";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SurveyCard } from "./survey-card";

export const metadata: Metadata = { title: "Surveys" };
export const dynamic = "force-dynamic";

export default async function SurveysPage() {
  const user = await requireUser();
  // Panels match region-locked studies on IP and user agent. Both are forwarded
  // to the provider for this request only; the platform stores hashes of them.
  const fingerprint = await clientFingerprint();

  const { offers, configuredProviders, message, allowance } = await listSurveysForUser({
    id: user.id,
    country: user.country,
    ipAddress: fingerprint.ip === "unknown" ? null : fingerprint.ip,
    userAgent: fingerprint.userAgent,
  });

  const eligible = offers.filter((o) => o.eligible);
  const rest = offers.filter((o) => !o.eligible);

  return (
    <>
      <PageHeader
        title="Surveys"
        description="Research panels pay for opinions that match their studies. Not every survey will accept you."
      />

      {configuredProviders === 0 ? (
        <Alert variant="warning" className="mb-6">
          <AlertTitle>Survey provider is not configured.</AlertTitle>
          <AlertDescription>
            No panel is connected on this deployment, so no live surveys can be offered. Video tasks still work
            normally.
          </AlertDescription>
        </Alert>
      ) : null}

      {allowance ? (
        <p className="mb-6 text-sm text-muted-foreground">
          {allowance.remaining} of {allowance.limit} surveys left today.{" "}
          <Link href="/dashboard/membership" className="underline underline-offset-2">
            Raise the limit
          </Link>
          .
        </p>
      ) : null}

      {eligible.length === 0 ? (
        <Card>
          <EmptyState
            icon={ClipboardList}
            title={message ?? "No surveys match your profile right now"}
            description="Panels add and withdraw studies through the day. Being screened out is normal and is not a mark against your account."
            action={
              <Button asChild>
                <Link href="/dashboard/tasks">Try a video task</Link>
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {eligible.map((survey) => (
            <SurveyCard key={survey.id} survey={survey} />
          ))}
        </div>
      )}

      {rest.length > 0 ? (
        <section className="mt-10">
          <h2 className="text-sm font-semibold text-muted-foreground">Not open to you</h2>
          <ul className="mt-3 divide-y rounded-xl border bg-card">
            {rest.map((survey) => (
              <li key={survey.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{survey.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {survey.providerName} · {formatMoney(survey.rewardAmount)}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">{survey.eligibilityNote}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
