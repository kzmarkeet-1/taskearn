import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Prose, PageIntro } from "@/components/site/prose";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { listAdapters } from "@/lib/surveys";

export const metadata: Metadata = {
  title: "Paid surveys",
  description: "How survey rewards work, why screening out happens, and which panels are connected.",
};

export const dynamic = "force-dynamic";

export default function SurveysInfoPage() {
  const adapters = listAdapters();
  const live = adapters.filter((a) => a.configured);

  return (
    <>
      <PageIntro
        eyebrow="Paid surveys"
        title="Get paid for opinions that match what researchers need"
        description="Survey rewards come from research panels. They set the criteria, and not everyone will match every study."
      />
      <div className="container max-w-3xl py-12">
        <Prose>
          <h2>How a survey reward is earned</h2>
          <ol>
            <li>You open a survey listed in your dashboard and are handed off to the panel.</li>
            <li>The panel asks a few qualifying questions to check you match the study.</li>
            <li>If you match, you complete the survey honestly and in full.</li>
            <li>The panel confirms the completion to us, and the reward enters your pending balance.</li>
          </ol>

          <h2>Screening out is normal</h2>
          <p>
            Panels often decide partway through that a respondent is not the right fit for a study. That is called
            screening out. It does not mean anything is wrong with your account, and no reward is due when it happens.
            It is the single most common source of frustration on any survey platform, and it is worth knowing before
            you start rather than after.
          </p>

          <h2>Why rewards can be reversed</h2>
          <p>
            Panels audit responses. If a completion is later found to be low quality or duplicated, the panel reverses
            it and the matching reward is removed from your wallet with a note explaining why. The verification hold on
            pending rewards exists to catch most of these before payout.
          </p>

          <h2>Connected panels</h2>
          <p>
            TaskEarn integrates a panel only once its official API and commercial permissions are in place. Nothing is
            simulated: if a panel is not connected, no surveys from it will appear.
          </p>
        </Prose>

        {live.length === 0 ? (
          <Alert variant="info" className="mt-8">
            <AlertTitle>Survey provider is not configured.</AlertTitle>
            <AlertDescription>
              No survey panel is connected on this deployment yet, so no surveys will be listed. Video tasks are
              unaffected.
            </AlertDescription>
          </Alert>
        ) : (
          <ul className="mt-8 grid gap-3 sm:grid-cols-3">
            {live.map((adapter) => (
              <li key={adapter.slug} className="rounded-xl border bg-card p-4 text-sm font-medium">
                {adapter.name}
              </li>
            ))}
          </ul>
        )}

        <div className="mt-10">
          <Button asChild>
            <Link href="/register">Create an account</Link>
          </Button>
        </div>
      </div>
    </>
  );
}
