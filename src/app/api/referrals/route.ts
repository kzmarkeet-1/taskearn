import { handler, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getReferralSummary } from "@/lib/referrals";

export const runtime = "nodejs";

export const GET = handler(async () => {
  const user = await requireUser();
  return ok(await getReferralSummary(user.id));
});
