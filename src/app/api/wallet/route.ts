import { handler, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getBalances, releaseMaturedRewards } from "@/lib/wallet";

export const runtime = "nodejs";

export const GET = handler(async () => {
  const user = await requireUser();
  // Opportunistic release, so a reward clears without waiting for a cron run.
  await releaseMaturedRewards(user.id);
  const balances = await getBalances(user.id);
  return ok(balances);
});
