"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Loader2 } from "lucide-react";
import { api } from "@/lib/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatMoney } from "@/lib/money";

type Plan = {
  tier: string;
  name: string;
  description: string;
  priceAmount: number;
  durationDays: number;
  dailyTaskLimit: number;
  dailySurveyLimit: number;
  withdrawalFeeDiscountBps: number;
  current: boolean;
};

type Method = { method: string; name: string; networks: string[] };

type DepositIntent = {
  mode: "deposit";
  reference: string;
  checkoutUrl?: string | null;
  depositAddress?: string | null;
  cryptoAsset?: string | null;
  cryptoAmount?: string | null;
  network?: string | null;
  requiredConfirmations?: number;
};

type WalletResult = { mode: "wallet"; alreadyProcessed: boolean; tier?: string };

/**
 * The metal palette lives here and only here.
 *
 * These are the literal names of the memberships, so a silver or gold treatment
 * describes the thing rather than dressing it up. Everywhere else in the app the
 * accent is iris — a rewards platform that is deliberately not an investment
 * product should not be wearing gold.
 */
function TierBadge({ tier }: { tier: string }) {
  const variant =
    tier === "SILVER" ? "silver" : tier === "GOLD" ? "gold" : tier === "DIAMOND" ? "diamond" : "neutral";
  return <Badge variant={variant}>{tier.toLowerCase()}</Badge>;
}

export function MembershipPanel({
  plans,
  methods,
  purchasable,
}: {
  plans: Plan[];
  methods: Method[];
  purchasable: boolean;
}) {
  const router = useRouter();
  const [busyTier, setBusyTier] = useState<string | null>(null);
  const [method, setMethod] = useState(methods[0]?.method ?? "");
  const [network, setNetwork] = useState(methods[0]?.networks[0] ?? "");
  const [intent, setIntent] = useState<DepositIntent | null>(null);

  const selectedMethod = methods.find((m) => m.method === method);

  async function purchase(tier: string, payWith: "wallet" | "deposit") {
    setBusyTier(tier);
    setIntent(null);

    const result = await api<DepositIntent | WalletResult>("/api/tiers/purchase", {
      json: {
        tier,
        payWith,
        method: payWith === "deposit" ? method : undefined,
        network: payWith === "deposit" && selectedMethod?.networks.length ? network : undefined,
        // A fresh id per attempt, so a retry after a dropped response is
        // recognised as the same purchase rather than charged again.
        requestId: crypto.randomUUID(),
      },
    });

    setBusyTier(null);

    if (!result.ok) {
      toast.error(result.message);
      return;
    }

    if (result.data.mode === "wallet") {
      toast.success(
        result.data.alreadyProcessed ? "That membership was already active." : "Membership active.",
      );
      router.refresh();
      return;
    }

    // Card checkout goes straight to the gateway. A crypto address has to stay
    // on screen, because the member needs to copy it.
    if (result.data.checkoutUrl) {
      window.location.href = result.data.checkoutUrl;
      return;
    }
    setIntent(result.data);
  }

  return (
    <div className="space-y-5">
      {purchasable && methods.length > 0 ? (
        <Card>
          <CardContent className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label="Pay with" htmlFor="membership-method">
              <Select
                id="membership-method"
                value={method}
                onChange={(event) => {
                  const next = event.target.value;
                  setMethod(next);
                  setNetwork(methods.find((m) => m.method === next)?.networks[0] ?? "");
                }}
              >
                {methods.map((m) => (
                  <option key={m.method} value={m.method}>
                    {m.name}
                  </option>
                ))}
              </Select>
            </Field>

            {selectedMethod && selectedMethod.networks.length > 0 ? (
              <Field
                label="Network"
                htmlFor="membership-network"
                hint="USDT sent on a different chain cannot be recovered."
              >
                <Select
                  id="membership-network"
                  value={network}
                  onChange={(event) => setNetwork(event.target.value)}
                >
                  {selectedMethod.networks.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {intent ? (
        <Alert variant="info">
          <AlertTitle>Send exactly this amount</AlertTitle>
          <AlertDescription className="space-y-2">
            <p className="break-all money text-xs">{intent.depositAddress}</p>
            <p className="text-sm">
              {intent.cryptoAmount} {intent.cryptoAsset} on {intent.network}. Your membership starts after{" "}
              {intent.requiredConfirmations} confirmations. Reference {intent.reference}.
            </p>
            <p className="text-xs text-muted-foreground">
              Send only {intent.cryptoAsset} on the {intent.network} network to this address. Anything else, or the
              right coin on the wrong chain, is lost and cannot be returned.
            </p>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        {plans.map((plan) => (
          <Card key={plan.tier} className={plan.current ? "border-primary/60 shadow-glow" : undefined}>
            <CardContent className="flex h-full flex-col p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="text-base font-semibold">{plan.name}</h3>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {plan.priceAmount === 0 ? (
                      "No fee"
                    ) : (
                      <>
                        <span className="money text-foreground">{formatMoney(plan.priceAmount)}</span> ·{" "}
                        {plan.durationDays} days
                      </>
                    )}
                  </p>
                </div>
                {plan.current ? <Badge>Current</Badge> : <TierBadge tier={plan.tier} />}
              </div>

              <p className="mt-3 text-sm text-muted-foreground">{plan.description}</p>

              <ul className="mt-4 space-y-1.5 text-sm">
                <li className="flex items-center gap-2">
                  <Check className="size-4 text-success" aria-hidden />
                  {plan.dailyTaskLimit} video tasks a day
                </li>
                <li className="flex items-center gap-2">
                  <Check className="size-4 text-success" aria-hidden />
                  {plan.dailySurveyLimit} surveys a day
                </li>
                {plan.withdrawalFeeDiscountBps > 0 ? (
                  <li className="flex items-center gap-2">
                    <Check className="size-4 text-success" aria-hidden />
                    {plan.withdrawalFeeDiscountBps >= 10_000
                      ? "No withdrawal fee"
                      : `${plan.withdrawalFeeDiscountBps / 100}% off the withdrawal fee`}
                  </li>
                ) : null}
              </ul>

              {plan.priceAmount > 0 && purchasable && !plan.current ? (
                <div className="mt-5 flex flex-col gap-2">
                  <Button onClick={() => purchase(plan.tier, "deposit")} disabled={busyTier !== null}>
                    {busyTier === plan.tier ? <Loader2 className="size-4 animate-spin" /> : null}
                    Pay with {selectedMethod?.name ?? "gateway"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => purchase(plan.tier, "wallet")}
                    disabled={busyTier !== null}
                  >
                    Pay from my balance
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
