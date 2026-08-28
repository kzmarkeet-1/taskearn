import type { Metadata } from "next";
import Link from "next/link";
import { PageIntro } from "@/components/site/prose";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "FAQ",
  description: "Straight answers about rewards, pending balances, withdrawals, referrals and account rules.",
};

const SECTIONS = [
  {
    title: "Money in",
    items: [
      {
        q: "Is TaskEarn free to join?",
        a: "Yes. There is no fee, no membership tier and no deposit. TaskEarn has no facility to accept money from members at all.",
      },
      {
        q: "Is this an investment?",
        a: "No. There is no investment plan, no staking, no yield, no cryptocurrency and no trading. You earn by completing tasks and surveys, and nothing else.",
      },
      {
        q: "How much will I earn?",
        a: "That depends on what is available to you and how much of it you complete. We publish the reward on every task and survey before you start, and we do not quote income figures.",
      },
    ],
  },
  {
    title: "Rewards",
    items: [
      {
        q: "Why is my reward pending?",
        a: "Rewards sit in the pending balance through a verification hold, then clear to your available balance. The exact hold length is shown on your wallet page.",
      },
      {
        q: "A survey ended early and I got nothing. Why?",
        a: "You were screened out — the panel decided you did not match that study. It is common, it is not a penalty, and no reward is due for a screened-out survey.",
      },
      {
        q: "A reward disappeared from my wallet.",
        a: "A panel reversed the completion after its own audit. You will see a reversal line in your transaction history explaining it. Nothing is ever removed silently.",
      },
      {
        q: "Can I speed up a video task?",
        a: "No. The server times the session independently. Submitting early asks you to keep going; sessions that cannot be verified are rejected.",
      },
    ],
  },
  {
    title: "Withdrawals",
    items: [
      {
        q: "When can I withdraw?",
        a: "Once your available balance passes the minimum shown on your withdraw page. Pending rewards cannot be withdrawn until they clear.",
      },
      {
        q: "How long does a payout take?",
        a: "Requests are reviewed by an operator, then processed. You can follow each request through its statuses on your withdrawals page.",
      },
      {
        q: "What if my request is rejected?",
        a: "The full amount, including the fee, returns to your wallet with a reason attached.",
      },
    ],
  },
  {
    title: "Account and referrals",
    items: [
      {
        q: "How do referrals pay?",
        a: "You earn once someone you invited does real qualifying work, plus a capped share of what they earn afterwards. It is one level only — there is no downline and no commission on their referrals.",
      },
      {
        q: "Can I have two accounts?",
        a: "No. One account per person. Duplicate accounts and shared payout details are flagged and can lead to suspension.",
      },
      {
        q: "Why is my account under review?",
        a: "The risk engine flagged a pattern worth a human look. Open a support ticket and an operator will go through it with you.",
      },
    ],
  },
];

export default function FaqPage() {
  return (
    <>
      <PageIntro
        eyebrow="FAQ"
        title="Questions, answered plainly"
        description="If something here is not clear, open a support ticket from your dashboard and ask."
      />
      <div className="container max-w-3xl py-12">
        <div className="space-y-12">
          {SECTIONS.map((section) => (
            <section key={section.title}>
              <h2 className="text-lg font-semibold">{section.title}</h2>
              <dl className="mt-4 divide-y rounded-xl border bg-card">
                {section.items.map((item) => (
                  <div key={item.q} className="p-5">
                    <dt className="font-medium">{item.q}</dt>
                    <dd className="mt-1.5 text-sm text-muted-foreground">{item.a}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
        <div className="mt-10">
          <Button asChild>
            <Link href="/contact">Ask us something else</Link>
          </Button>
        </div>
      </div>
    </>
  );
}
