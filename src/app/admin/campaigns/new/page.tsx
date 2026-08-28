import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { CampaignForm } from "../campaign-form";

export const metadata: Metadata = { title: "New campaign" };
export const dynamic = "force-dynamic";

export default async function NewCampaignPage() {
  await requireAdmin();
  const settings = await getSettings();

  return (
    <>
      <PageHeader
        title="Create campaign"
        description="The budget is a hard ceiling. Completions stop automatically once it, the quota or the end date is reached."
      />
      <Card className="max-w-3xl">
        <CardContent className="p-6">
          <CampaignForm defaultReward={settings.taskRewardDefault} />
        </CardContent>
      </Card>
    </>
  );
}
