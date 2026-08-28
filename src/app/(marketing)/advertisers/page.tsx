import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Prose, PageIntro } from "@/components/site/prose";

export const metadata: Metadata = {
  title: "Advertise with us",
  description: "Put your video in front of real viewers with a fixed budget and a verified completion for every reward paid.",
};

export default function AdvertisersPage() {
  return (
    <>
      <PageIntro
        eyebrow="For advertisers"
        title="Reach real viewers, on a budget you set"
        description="You fund a campaign, we show it to members who match your targeting, and you pay only for verified completions."
      />
      <div className="container max-w-3xl py-12">
        <Prose>
          <h2>What you control</h2>
          <ul>
            <li>Reward per completion, total budget, and daily and total quotas.</li>
            <li>Required viewing duration.</li>
            <li>Target countries, start date and end date.</li>
          </ul>
          <p>
            When the budget or quota runs out, or the end date passes, the campaign stops accepting completions
            automatically. It cannot overspend.
          </p>

          <h2>What we verify</h2>
          <p>
            Every completion is tied to one account, one session and one server-timed viewing window. A member can be
            rewarded once per campaign. Sessions that finish faster than the required duration, or that show no sign of
            an open page, are rejected and never billed to you.
          </p>

          <h2>What we will not sell you</h2>
          <p>
            We do not sell views, watch time, likes, subscribers or comments, and we will not run a campaign whose
            purpose is to inflate a metric on someone else&apos;s platform. What you are buying is attention from real
            people who chose to watch. Campaigns that breach the hosting platform&apos;s terms are rejected at review.
          </p>

          <h2>Getting started</h2>
          <p>
            Campaign creation currently runs through our team so that each brief can be checked against the policy
            above. Send us the video, the audience and the budget, and we will come back with a plan.
          </p>
        </Prose>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Button asChild>
            <Link href="/contact">Talk to us about a campaign</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/terms">Read the terms</Link>
          </Button>
        </div>
      </div>
    </>
  );
}
