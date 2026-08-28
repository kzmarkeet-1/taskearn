import type { Metadata } from "next";
import { Prose, PageIntro } from "@/components/site/prose";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export const metadata: Metadata = {
  title: "Responsible earnings policy",
  description: "What TaskEarn can and cannot do for you, in plain terms, before you spend your time on it.",
};

export default function ResponsibleEarningsPage() {
  return (
    <>
      <PageIntro
        eyebrow="Policy"
        title="Responsible earnings"
        description="Read this before you plan around any income from this platform."
      />
      <div className="container max-w-3xl py-12">
        <Alert variant="warning">
          <AlertTitle>TaskEarn is not an income replacement.</AlertTitle>
          <AlertDescription>
            It is supplementary at best. Do not take on commitments, debts or expenses on the assumption that this
            platform will cover them.
          </AlertDescription>
        </Alert>

        <Prose className="mt-8">
          <h2>Earnings depend on availability</h2>
          <p>
            Tasks exist because an advertiser funded them and surveys exist because a panel needs respondents. Both dry
            up and pick up without warning. There may be days with nothing available to you at all, and that is a
            normal state of this kind of platform rather than a fault.
          </p>

          <h2>You will not qualify for everything</h2>
          <p>
            Panels choose respondents on criteria they do not publish — age, location, occupation, buying habits.
            Being screened out repeatedly is ordinary and says nothing about your account.
          </p>

          <h2>Rewards can stay pending, and can be reversed</h2>
          <p>
            A completed reward is not yet a paid reward. It waits through a verification hold, and a panel can reverse
            a completion after its own audit. Treat pending balances as provisional.
          </p>

          <h2>Nothing here is guaranteed</h2>
          <p>
            TaskEarn does not promise an hourly rate, a daily amount or a monthly income, and no one is authorised to
            promise one on our behalf. If you see TaskEarn advertised with a guaranteed figure, that advertisement is
            not ours — please report it.
          </p>

          <h2>You never pay to earn</h2>
          <p>
            There is no deposit, no upgrade, no unlock fee and no investment. Anyone asking you to send money to
            increase your earnings is running a scam, whoever they claim to be.
          </p>

          <h2>Look after yourself</h2>
          <ul>
            <li>Set a time limit before you start and stop when you reach it.</li>
            <li>Do not chase a withdrawal minimum at the cost of sleep, study or paid work.</li>
            <li>Take breaks. Fatigue produces poor survey answers, which get reversed anyway.</li>
            <li>If earning here starts to feel compulsive, step away and speak to someone you trust.</li>
          </ul>

          <h2>If something looks wrong</h2>
          <p>
            Open a support ticket. A rejected task, a reversed reward or a suspended account always has a reason
            attached, and an operator can walk you through it.
          </p>
        </Prose>
      </div>
    </>
  );
}
