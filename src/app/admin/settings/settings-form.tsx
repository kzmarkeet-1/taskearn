"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/client";
import { formatMoney } from "@/lib/money";

type Definition = {
  key: string;
  type: string;
  group: string;
  label: string;
  description: string;
};

const GROUP_LABELS: Record<string, string> = {
  withdrawals: "Withdrawals",
  referrals: "Referrals",
  tasks: "Tasks and rewards",
  modules: "Modules",
};

/** Keys whose integer values are money rather than a count or a duration. */
const MONEY_KEYS = new Set([
  "minimumWithdrawal",
  "maximumWithdrawal",
  "withdrawalFee",
  "dailyWithdrawalLimit",
  "referralReward",
  "maximumReferralReward",
  "referralQualifyingEarnings",
  "taskRewardDefault",
]);

export function SettingsForm({
  settings,
  definitions,
}: {
  settings: Record<string, string | number | boolean>;
  definitions: Definition[];
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(definitions.map((d) => [d.key, String(settings[d.key])])),
  );
  const [saving, setSaving] = useState(false);

  const changed = definitions.filter((d) => values[d.key] !== String(settings[d.key]));

  async function save() {
    if (changed.length === 0) return;
    setSaving(true);
    const result = await api("/api/admin/settings", {
      method: "PATCH",
      json: { updates: changed.map((d) => ({ key: d.key, value: values[d.key] })) },
    });
    setSaving(false);

    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success(`${changed.length} setting${changed.length === 1 ? "" : "s"} saved`);
    router.refresh();
  }

  const groups = Array.from(new Set(definitions.map((d) => d.group)));

  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <Card key={group}>
          <CardHeader>
            <CardTitle>{GROUP_LABELS[group] ?? group}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {definitions
              .filter((d) => d.group === group)
              .map((definition) => {
                const value = values[definition.key];
                const isMoney = MONEY_KEYS.has(definition.key);
                const numeric = Number(value);

                return (
                  <div key={definition.key} className="grid gap-2 sm:grid-cols-[1fr_200px] sm:items-start sm:gap-4">
                    <div>
                      <label htmlFor={definition.key} className="text-sm font-medium">
                        {definition.label}
                      </label>
                      <p className="mt-0.5 text-xs text-muted-foreground">{definition.description}</p>
                      {isMoney && Number.isFinite(numeric) ? (
                        <p className="mt-0.5 text-xs font-medium text-primary">= {formatMoney(numeric)}</p>
                      ) : null}
                      {definition.key === "referralPercentage" && Number.isFinite(numeric) ? (
                        <p className="mt-0.5 text-xs font-medium text-primary">= {numeric / 100}%</p>
                      ) : null}
                      {definition.key === "pendingRewardCooldown" && Number.isFinite(numeric) ? (
                        <p className="mt-0.5 text-xs font-medium text-primary">
                          = {(numeric / 60).toFixed(1)} hours
                        </p>
                      ) : null}
                    </div>

                    {definition.type === "BOOLEAN" ? (
                      <Select
                        id={definition.key}
                        value={value}
                        onChange={(event) =>
                          setValues((current) => ({ ...current, [definition.key]: event.target.value }))
                        }
                      >
                        <option value="true">On</option>
                        <option value="false">Off</option>
                      </Select>
                    ) : (
                      <Input
                        id={definition.key}
                        inputMode="numeric"
                        value={value}
                        onChange={(event) =>
                          setValues((current) => ({ ...current, [definition.key]: event.target.value }))
                        }
                      />
                    )}
                  </div>
                );
              })}
          </CardContent>
        </Card>
      ))}

      <div className="sticky bottom-4 flex items-center justify-between gap-3 rounded-xl border bg-card p-4 shadow-lift">
        <p className="text-sm text-muted-foreground">
          {changed.length === 0
            ? "No changes yet."
            : `${changed.length} unsaved change${changed.length === 1 ? "" : "s"}.`}
        </p>
        <Button onClick={save} disabled={saving || changed.length === 0}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
