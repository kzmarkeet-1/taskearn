import { NextResponse } from "next/server";
import { releaseMaturedRewards } from "@/lib/wallet";
import { expireCampaigns, reconcileMissingTaskRewards } from "@/lib/tasks";
import { abandonStaleSurveyEntries } from "@/lib/surveys";
import { expireSubscriptions, notifyExpiringSubscriptions } from "@/lib/tiers";
import { expireStaleDeposits } from "@/lib/payments";
import {
  dispatchApprovedWithdrawals,
  pollExchangeDeposits,
  pollWithdrawalSettlements,
} from "@/lib/payments/exchanges";
import { deliverQueuedEmails } from "@/lib/notifications";
import { safeCompare } from "@/lib/crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Scheduled maintenance.
 *
 * Runs the jobs that keep money moving: clearing matured rewards into
 * withdrawable balances, closing campaigns that have run their course,
 * repairing any completion whose reward was lost to a crash, and flushing
 * queued mail.
 *
 * Authenticated with a shared secret rather than a session, because the caller
 * is a scheduler and not a person. If CRON_SECRET is unset the route refuses
 * outright — an unauthenticated endpoint that mutates balances would be worse
 * than no endpoint at all.
 *
 * Every job here is idempotent, so a scheduler that retries or overlaps cannot
 * double-credit anything.
 */
async function run(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "Maintenance is disabled because CRON_SECRET is not set." },
      { status: 503 },
    );
  }

  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!provided || !safeCompare(provided, secret)) {
    return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 401 });
  }

  const started = Date.now();
  const results: Record<string, unknown> = {};

  // Each job is isolated: one failing must not stop the others, because they
  // are independent and skipping the reward release for a whole cycle is
  // exactly the failure this endpoint exists to prevent.
  for (const [name, job] of [
    ["releasedRewards", () => releaseMaturedRewards()],
    ["expiredCampaigns", () => expireCampaigns()],
    ["reconciledTaskRewards", () => reconcileMissingTaskRewards()],
    // Memberships that ran their term, and the warnings that precede them.
    ["expiredMemberships", () => expireSubscriptions()],
    ["expiringMembershipWarnings", () => notifyExpiringSubscriptions()],
    // Payment addresses nobody paid, and survey entries nobody returned from.
    ["expiredDeposits", () => expireStaleDeposits()],
    // Exchange rails. Neither exchange pushes deposit events, so incoming
    // payments are found by polling; outgoing ones are sent and then followed
    // until the chain settles them.
    ["exchangeDeposits", () => pollExchangeDeposits()],
    ["cryptoPayouts", () => dispatchApprovedWithdrawals()],
    ["cryptoSettlements", () => pollWithdrawalSettlements()],
    ["abandonedSurveyEntries", () => abandonStaleSurveyEntries()],
    ["deliveredEmails", () => deliverQueuedEmails()],
  ] as const) {
    try {
      results[name] = await job();
    } catch (error) {
      console.error(`[maintenance] ${name} failed:`, error);
      results[name] = { failed: true };
    }
  }

  return NextResponse.json({ ok: true, tookMs: Date.now() - started, ...results });
}

export const GET = run;
export const POST = run;
