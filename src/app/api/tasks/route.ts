import { handler, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { listAvailableCampaigns } from "@/lib/tasks";

export const runtime = "nodejs";

export const GET = handler(async () => {
  const user = await requireUser();
  const result = await listAvailableCampaigns({ id: user.id, country: user.country });
  return ok(result);
});
