import type { Metadata } from "next";
import { Prose, PageIntro } from "@/components/site/prose";

export const metadata: Metadata = {
  title: "About",
  description: "What TaskEarn is, what it refuses to be, and how it makes money.",
};

export default function AboutPage() {
  return (
    <>
      <PageIntro
        eyebrow="About"
        title="A rewards platform that says what it is"
        description="TaskEarn connects advertisers and research panels with people willing to spend a few minutes of attention."
      />
      <div className="container max-w-3xl py-12">
        <Prose>
          <h2>How the money flows</h2>
          <p>
            Advertisers fund video campaigns. Research panels pay for completed surveys. TaskEarn passes a share of
            that revenue to the member who did the work and keeps the rest to run the platform. That is the entire
            business model. Members never pay us anything, and there is nothing to buy.
          </p>

          <h2>What we refuse to build</h2>
          <p>
            No deposits. No investment plans, fixed returns or profit tiers. No cryptocurrency, wallets, staking or
            yield. No multi-level referral structure. These are the features that turn reward platforms into schemes,
            and their absence here is deliberate rather than a gap waiting to be filled.
          </p>

          <h2>What we owe members</h2>
          <ul>
            <li>An honest account of what a task pays before it is started.</li>
            <li>A transaction history where every movement is visible and nothing is edited after the fact.</li>
            <li>A reason attached to any rejection, reversal or suspension.</li>
            <li>No income promises, from us or from anyone marketing on our behalf.</li>
          </ul>

          <h2>Where we are</h2>
          <p>
            TaskEarn is built for members in Pakistan first, with payouts to JazzCash, Easypaisa and local bank
            accounts. Support runs through the ticket system in your dashboard.
          </p>
        </Prose>
      </div>
    </>
  );
}
