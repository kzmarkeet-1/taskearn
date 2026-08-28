import Link from "next/link";
import {
  ArrowRight,
  Banknote,
  ClipboardList,
  PlaySquare,
  ShieldCheck,
  UserPlus,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { formatMoney } from "@/lib/money";
import { listTierPlans } from "@/lib/tiers";
import { payoutStatuses, PAYOUT_METHOD_LABELS } from "@/lib/payouts";

export const dynamic = "force-dynamic";

const STEPS = [
  {
    title: "Create a free account",
    body: "Register with your name, email and mobile number. There is nothing to pay, now or ever.",
  },
  {
    title: "Pick a task or survey",
    body: "Browse sponsored video campaigns and survey offers you qualify for. Availability changes through the day.",
  },
  {
    title: "Finish it properly",
    body: "Watch the sponsored video for the stated time, or answer the survey honestly through to the end.",
  },
  {
    title: "Get your reward",
    body: "The reward lands in your pending balance, clears after verification, then moves to your available balance.",
  },
];

const MODULES = [
  {
    icon: PlaySquare,
    title: "Video tasks",
    body: "Advertisers pay to put their video in front of real people. You watch it for the stated duration and the reward is yours. No bots, no automation, no artificial views.",
  },
  {
    icon: ClipboardList,
    title: "Paid surveys",
    body: "Research panels pay for opinions from people who match their criteria. Not every survey will accept you — screening out is normal and is not a fault on your account.",
  },
  {
    icon: Wallet,
    title: "A wallet you can audit",
    body: "Every reward, fee and reversal is a line in your transaction history with a running balance. Nothing is edited after the fact.",
  },
  // The withdrawal module's body is supplied at render time from the payout
  // providers that are actually configured. See `withdrawalCopy` below.
  {
    icon: Banknote,
    title: "Withdrawals, local and global",
    body: null,
  },
  {
    icon: UserPlus,
    title: "Referrals, one level deep",
    body: "Invite someone and earn once they do real qualifying work. There is no downline and no commission on anyone else's referrals.",
  },
  {
    icon: ShieldCheck,
    title: "Built to be checked",
    body: "Rate limits, signed webhooks, audit logs and a risk engine run behind the scenes so genuine members are not competing with fraud.",
  },
];

const FAQS = [
  {
    q: "Do I need to deposit money to start earning?",
    a: "No. TaskEarn does not accept deposits from members and has no investment, staking or trading feature. If anyone asks you to pay to unlock earnings, it is not us.",
  },
  {
    q: "How much can I earn?",
    a: "It depends entirely on how many tasks and surveys are available to you, and you may not qualify for every survey. We do not promise an income figure, because nobody honestly can. That applies to paid memberships too: a higher tier raises your daily limit, it does not raise what any single task pays.",
  },
  {
    q: "Can I withdraw outside Pakistan?",
    a: "Local payouts go to JazzCash, Easypaisa or a bank account. USDT and card payouts are being added for members outside Pakistan. The withdrawal page only ever lists the methods that are live for your account, so what you see there is what can actually be sent.",
  },
  {
    q: "Why is my reward pending?",
    a: "Rewards wait out a short verification hold so that reversed or invalid completions can be caught before payout. The exact hold is shown on your wallet page.",
  },
  {
    q: "Can I use more than one account?",
    a: "No. One account per person. Duplicate accounts, shared payout details and automated completions all get flagged by the risk engine.",
  },
];

export default async function HomePage() {
  const [settings, campaignCount, providers, tierPlans] = await Promise.all([
    getSettings(),
    prisma.campaign.count({ where: { status: "ACTIVE" } }).catch(() => 0),
    prisma.surveyProvider.count({ where: { configured: true } }).catch(() => 0),
    listTierPlans().catch(() => []),
  ]);

  /*
   * The payout rails this deployment can actually pay out on, read from the
   * providers themselves rather than written into the copy.
   *
   * This matters more than it looks. Both the crypto and Stripe disbursement
   * adapters are stubs right now — they return "not implemented yet" — so a
   * hardcoded promise of USDT withdrawals on this page would be advertising a
   * button that cannot pay anyone. Driving the sentence from `isConfigured()`
   * means the page starts telling the truth the moment the gateway is wired,
   * and never before.
   */
  const liveRails = payoutStatuses().filter((rail) => rail.configured);
  const cryptoLive = liveRails.some((rail) => rail.method === "CRYPTO_USDT");
  const stripeLive = liveRails.some((rail) => rail.method === "STRIPE");
  const globalRailsLive = cryptoLive || stripeLive;

  const withdrawalCopy = globalRailsLive
    ? `Cash out to ${liveRails.map((rail) => PAYOUT_METHOD_LABELS[rail.method]).join(", ")}. Every request is reviewed before it is sent, and you can follow it from review through to the transaction that settles it.`
    : "Cash out to JazzCash, Easypaisa or a bank account once you pass the minimum. USDT and card payouts are being added — this page will list them once they are live, not before.";

  const paidPlans = tierPlans.filter((plan) => plan.priceAmount > 0);
  const membershipsOpen = settings.enableMemberships && paidPlans.length > 0;

  return (
    <>
      {/*
        The hero's thesis is the ledger, not a slogan.
        
        The three figures below are the real differentiator and they are read
        live from the database — campaigns actually open, panels actually
        connected, the actual minimum. They are set as a ledger strip rather
        than the usual three floating big numbers, because the strip is what
        this product produces: a label, a rule, and a figure that lines up with
        the figure above it. Nothing here is illustrative, which is the point.
      */}
      <section className="relative overflow-hidden border-b">
        <div className="absolute inset-0 grid-backdrop opacity-70" aria-hidden />
        <div className="absolute inset-x-0 top-0 h-[420px] aurora" aria-hidden />
        <div className="container relative py-20 lg:py-28">
          <div className="max-w-3xl">
            <p className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              <ShieldCheck className="size-3.5 text-success" />
              {/* "No deposits" stopped being true when memberships shipped.
                  "No investment products" is still true and is the claim worth
                  keeping, so the pill states that and nothing it cannot back. */}
              Free to join · every earning feature on the free plan · no investment products
            </p>

            <h1 className="mt-6 text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-[4rem]">
              Every rupee,
              <br />
              <span className="text-primary">on the record.</span>
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
              Watch sponsored videos and answer surveys that match you. Every reward, fee and reversal is a line in
              your history with a running balance — and no line is ever edited after the fact.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" asChild>
                <Link href="/register">
                  Start earning
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link href="/advertisers">Advertise with us</Link>
              </Button>
            </div>

            <dl className="mt-14 max-w-lg divide-y divide-border/70 border-y border-border/70">
              {[
                { label: "Campaigns open now", value: String(campaignCount) },
                { label: "Survey partners live", value: String(providers) },
                { label: "Minimum withdrawal", value: formatMoney(settings.minimumWithdrawal) },
              ].map((row) => (
                <div key={row.label} className="flex items-baseline justify-between gap-4 py-3.5">
                  <dt className="text-sm text-muted-foreground">{row.label}</dt>
                  <dd className="money text-xl font-medium">{row.value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 max-w-lg text-xs text-muted-foreground">
              Read live from our database. An empty platform shows zeros.
            </p>
          </div>
        </div>
      </section>

      <section className="border-b py-16 lg:py-20" id="how-it-works">
        <div className="container">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">How it works</h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Four steps, in order. Each one has to happen before the next.
          </p>
          <ol className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, index) => (
              <li key={step.title}>
                <Card className="h-full">
                  <CardContent className="p-6">
                    <span className="money text-xs font-semibold text-primary">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <h3 className="mt-3 font-semibold">{step.title}</h3>
                    <p className="mt-2 text-sm text-muted-foreground">{step.body}</p>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="border-b bg-card py-16 lg:py-20">
        <div className="container">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">What is inside</h2>
          <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {MODULES.map((module) => (
              <div key={module.title} className="rounded-xl border bg-background p-6">
                <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <module.icon className="size-5" aria-hidden />
                </span>
                <h3 className="mt-4 font-semibold">{module.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{module.body ?? withdrawalCopy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/*
        Memberships.
        
        Rendered from the TierPlan table, not from copy written here, so the
        page cannot drift from what the app will actually sell. When
        `enableMemberships` is off — which is the shipped default — the section
        still appears, because hiding a plan people will eventually be charged
        for is worse than showing it, but it says plainly that nothing is on
        sale yet rather than dressing up a button that would fail.

        Framing is deliberate throughout: allowance, subscription, term. Not
        package, not node, not investment. The tier raises a daily limit; it
        does not pay anything, and this section must never imply that it does.
      */}
      <section className="border-b py-16 lg:py-20" id="memberships">
        <div className="container">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Memberships</h2>
              <p className="mt-2 max-w-2xl text-muted-foreground">
                Every earning feature works on the free plan. A membership buys one thing: a bigger daily allowance
                for a fixed term.
              </p>
            </div>
            {membershipsOpen ? null : (
              <Badge variant="neutral" className="w-fit">
                Not on sale yet
              </Badge>
            )}
          </div>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {tierPlans.map((plan) => (
              <Card key={plan.tier} className={plan.priceAmount === 0 ? "border-primary/40" : undefined}>
                <CardContent className="flex h-full flex-col p-6">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold">{plan.name}</h3>
                    {plan.tier === "SILVER" ? <Badge variant="silver">silver</Badge> : null}
                    {plan.tier === "GOLD" ? <Badge variant="gold">gold</Badge> : null}
                    {plan.tier === "DIAMOND" ? <Badge variant="diamond">diamond</Badge> : null}
                    {plan.priceAmount === 0 ? <Badge>Default</Badge> : null}
                  </div>

                  <p className="mt-3">
                    {plan.priceAmount === 0 ? (
                      <span className="text-sm text-muted-foreground">No fee, no term</span>
                    ) : (
                      <>
                        <span className="money text-2xl font-semibold">{formatMoney(plan.priceAmount)}</span>
                        <span className="text-sm text-muted-foreground"> · {plan.durationDays} days</span>
                      </>
                    )}
                  </p>

                  <ul className="mt-4 space-y-1.5 text-sm text-muted-foreground">
                    <li>
                      <span className="money text-foreground">{plan.dailyTaskLimit}</span> video tasks a day
                    </li>
                    <li>
                      <span className="money text-foreground">{plan.dailySurveyLimit}</span> surveys a day
                    </li>
                    {plan.withdrawalFeeDiscountBps > 0 ? (
                      <li>
                        {plan.withdrawalFeeDiscountBps >= 10_000
                          ? "No withdrawal fee"
                          : `${plan.withdrawalFeeDiscountBps / 100}% off the withdrawal fee`}
                      </li>
                    ) : null}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* The disclaimer sits with the prices, where the decision is made,
              rather than in terms nobody opens. */}
          <p className="mt-8 max-w-3xl text-sm text-muted-foreground">
            A membership is a subscription to a larger allowance, not an investment. It pays no return, nothing
            accrues by holding one, and whether you earn back its price depends entirely on the work you do and on
            what advertisers and panels are running. There is no commission for recruiting anyone onto a tier.
            {membershipsOpen ? null : " Memberships are not open for purchase yet — everyone is on the free plan."}
          </p>
        </div>
      </section>

      <section className="border-b py-16 lg:py-20" id="faq">
        <div className="container max-w-3xl">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Frequently asked questions</h2>
          <dl className="mt-8 divide-y rounded-xl border bg-card">
            {FAQS.map((faq) => (
              <div key={faq.q} className="p-6">
                <dt className="font-medium">{faq.q}</dt>
                <dd className="mt-2 text-sm text-muted-foreground">{faq.a}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-6 text-sm text-muted-foreground">
            More questions are answered on the{" "}
            <Link href="/faq" className="font-medium text-primary hover:underline">
              FAQ page
            </Link>
            . Read the{" "}
            <Link href="/responsible-earnings" className="font-medium text-primary hover:underline">
              responsible earnings policy
            </Link>{" "}
            before you begin.
          </p>
        </div>
      </section>

      <section className="py-16 lg:py-20">
        <div className="container">
          <div className="rounded-2xl border bg-foreground px-8 py-12 text-background sm:px-12">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Ready to start?</h2>
            <p className="mt-3 max-w-xl text-background/70">
              Creating an account takes a minute and costs nothing. You will see exactly what is available to you
              before you commit to anything.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" variant="secondary" asChild>
                <Link href="/register">Create your account</Link>
              </Button>
              <Button
                size="lg"
                variant="ghost"
                className="text-background hover:bg-background/10 hover:text-background"
                asChild
              >
                <Link href="/how-it-works">See how it works</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
