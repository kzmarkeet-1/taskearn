import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { getSettings, SETTING_DEFINITIONS } from "@/lib/settings";
import { payoutStatuses } from "@/lib/payouts";
import { listAdapters } from "@/lib/surveys";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  await requireAdmin();
  const settings = await getSettings();
  const payouts = payoutStatuses();
  const surveys = listAdapters();

  return (
    <>
      <PageHeader
        title="Settings"
        description="Platform rules. Changes apply immediately and are written to the audit log with their previous values."
      />

      <Alert variant="info" className="mb-5">
        <AlertTitle>Amounts are in minor units</AlertTitle>
        <AlertDescription>
          100 equals PKR 1.00. Storing money as whole numbers is what keeps rounding out of the ledger, so the form
          shows both the raw value and what it means.
        </AlertDescription>
      </Alert>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <SettingsForm settings={settings} definitions={SETTING_DEFINITIONS} />

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Integrations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Survey panels</p>
                <ul className="mt-2 space-y-1.5">
                  {surveys.map((adapter) => (
                    <li key={adapter.slug} className="flex items-center justify-between gap-2">
                      <span>{adapter.name}</span>
                      <Badge variant={adapter.configured ? "success" : "neutral"}>
                        {adapter.configured ? "Connected" : "Not configured"}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Payout channels</p>
                <ul className="mt-2 space-y-1.5">
                  {payouts.map((provider) => (
                    <li key={provider.method} className="flex items-center justify-between gap-2">
                      <span>{provider.name}</span>
                      <Badge variant={provider.configured ? "success" : "neutral"}>
                        {provider.configured ? "Automated" : "Manual"}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>

              <p className="text-xs text-muted-foreground">
                Credentials live in environment variables and are never editable from this panel.
              </p>
            </CardContent>
          </Card>

          <Alert variant="warning">
            <AlertTitle>Think before lowering holds</AlertTitle>
            <AlertDescription>
              The verification hold is what gives you time to catch a bad completion before the money can leave. Cutting
              it to zero removes that window entirely.
            </AlertDescription>
          </Alert>
        </div>
      </div>
    </>
  );
}
