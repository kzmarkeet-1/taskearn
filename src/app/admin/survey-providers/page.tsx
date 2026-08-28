import type { Metadata } from "next";
import { Plug } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listAdapters } from "@/lib/surveys";
import { env } from "@/lib/env";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export const metadata: Metadata = { title: "Survey providers" };
export const dynamic = "force-dynamic";

const ENV_KEYS: Record<string, string[]> = {
  cpx: ["CPX_APP_ID", "CPX_API_KEY", "CPX_SECRET"],
  pollfish: ["POLLFISH_API_KEY", "POLLFISH_SECRET"],
  bitlabs: ["BITLABS_API_KEY", "BITLABS_SECRET"],
};

export default async function AdminSurveyProvidersPage() {
  await requireAdmin();
  const adapters = listAdapters();
  const rows = await prisma.surveyProvider.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { surveys: true } } },
  });
  const appUrl = env().NEXT_PUBLIC_APP_URL;

  return (
    <>
      <PageHeader
        title="Survey providers"
        description="Credentials come from environment variables, never from the database, and are never shown here."
      />

      <Alert variant="info" className="mb-5">
        <AlertTitle>Nothing is simulated</AlertTitle>
        <AlertDescription>
          An unconfigured provider offers no surveys and credits nothing. Members see{" "}
          <span className="font-medium">Survey provider is not configured.</span> rather than placeholder studies.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 lg:grid-cols-3">
        {adapters.map((adapter) => {
          const row = rows.find((r) => r.slug === adapter.slug);
          const keys = ENV_KEYS[adapter.slug] ?? [];
          return (
            <Card key={adapter.slug}>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="flex items-center gap-2">
                  <Plug className="size-4 text-muted-foreground" />
                  {adapter.name}
                </CardTitle>
                <Badge variant={adapter.configured ? "success" : "neutral"}>
                  {adapter.configured ? "Connected" : "Not configured"}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Environment variables</p>
                  <ul className="mt-2 space-y-1">
                    {keys.map((key) => (
                      <li key={key} className="flex items-center justify-between gap-2">
                        <code className="money text-xs">{key}</code>
                        <Badge variant={adapter.configured ? "success" : "neutral"}>
                          {adapter.configured ? "set" : "missing"}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                </div>

                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Callback URL</p>
                  <code className="mt-1.5 block break-all rounded-md bg-muted px-2.5 py-2 money text-xs">
                    {appUrl}/api/webhooks/surveys/{adapter.slug}
                  </code>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Give this to the panel. Deliveries must be signed with the shared secret or they are rejected.
                  </p>
                </div>

                {row ? (
                  <p className="text-xs text-muted-foreground">
                    {row._count.surveys} surveys cached · {row.enabled ? "enabled" : "disabled"}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">No provider row yet. It is created on first sync.</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
