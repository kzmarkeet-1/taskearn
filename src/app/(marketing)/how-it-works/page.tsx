import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Prose, PageIntro } from "@/components/site/prose";
import { getSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/money";

export const metadata: Metadata = {
  title: "How it works",
  description: "The full path from signing up to receiving a payout, including what can go wrong along the way.",
};

export const dynamic = "force-dynamic";

export default async function HowItWorksPage() {
  const settings = await getSettings();

  return (
    <>
      <PageIntro
        eyebrow="How it works"
        title="From your first task to your first payout"
        description="No shortcuts and no surprises. Here is exactly what happens at each stage."
      />
      <div className="container max-w-3xl py-12">
        <Prose>
          <h2>1. Create an account</h2>
          <p>
            Registration is free and always will be. You give your name, email, mobile number and country, and choose a
            password. There is no deposit, no membership fee and no paid tier. TaskEarn has no wallet you can fund, no
            investment plan and no way to send us money.
          </p>

          <h2>2. Find work that fits you</h2>
          <p>Two kinds of reward-earning activity sit in your dashboard:</p>
          <ul>
            <li>
              <strong>Sponsored video tasks.</strong> An advertiser has paid for their video to reach real viewers.
              Each campaign states the reward, the watch time required, the quota left and the closing date.
            </li>
            <li>
              <strong>Qualifying surveys.</strong> Research panels look for respondents matching a profile. You will
              see the estimated length and reward before you start.
            </li>
          </ul>

          <h2>3. Complete it properly</h2>
          <p>
            For a video task, the platform opens a session, you keep the page open while the video plays, and the
            server times the session independently of anything your browser reports. Submitting early asks you to keep
            going rather than failing you outright.
          </p>
          <p>
            For a survey, you answer honestly through to the end. Panels screen people out partway through; that is
            normal, it is not a mark against your account, and no reward is due when it happens.
          </p>
          <p>
            <strong>What TaskEarn will not do:</strong> automate playback, run bots, generate artificial views or watch
            time, or click, like, subscribe or comment on your behalf. Every completion is a real person choosing to
            spend their time.
          </p>

          <h2>4. Wait out the verification hold</h2>
          <p>
            A finished reward lands in your <strong>pending balance</strong> and stays there for {" "}
            {Math.round(settings.pendingRewardCooldown / 60)} hours. The hold exists because survey panels can reverse
            a completion after review, and it is fairer to catch that before payout than to claw money back afterwards.
            Once the hold passes, the reward moves to your <strong>available balance</strong>.
          </p>

          <h2>5. Withdraw</h2>
          <p>
            Once your available balance reaches {formatMoney(settings.minimumWithdrawal)} you can request a payout to
            JazzCash, Easypaisa or a bank account. A flat fee of {formatMoney(settings.withdrawalFee)} applies per
            request. The amount leaves your balance immediately so it cannot be requested twice, and the request moves
            through review, approval and processing to completion. If a request is rejected, the full amount including
            the fee returns to your wallet.
          </p>

          <h2>What is not promised</h2>
          <ul>
            <li>A given number of tasks per day. Availability follows advertiser demand.</li>
            <li>Qualification for any particular survey. Panels set their own criteria.</li>
            <li>An income figure. Anyone who quotes you a guaranteed monthly amount is not being straight with you.</li>
          </ul>
        </Prose>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Button asChild>
            <Link href="/register">Create your account</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/responsible-earnings">Read the earnings policy</Link>
          </Button>
        </div>
      </div>
    </>
  );
}
