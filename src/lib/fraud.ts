import "server-only";
import type { FraudEventType, RiskLevel } from "@prisma/client";
import { prisma } from "./prisma";

/**
 * Risk engine.
 *
 * Signals come from data the platform already holds for the service to work —
 * account timestamps, task timings, referral counts, withdrawal patterns. There
 * is no device fingerprinting, no background location, and no third-party
 * tracking. Anything added later must be disclosed in the privacy policy first.
 */

const WEIGHTS: Record<FraudEventType, number> = {
  REPEATED_ACCOUNT_CREATION: 30,
  DUPLICATE_SURVEY_COMPLETION: 35,
  ABNORMAL_TASK_SPEED: 25,
  EXCESSIVE_REFERRAL_ACTIVITY: 20,
  SUSPICIOUS_WITHDRAWAL: 30,
  UNUSUAL_ACCOUNT_ACTIVITY: 15,
  // A task session that failed the visible-time checks. Weighted like the
  // other task-timing signal: one is noise, a run of them is not.
  SESSION_INTEGRITY_FAILURE: 25,
};

export function levelForScore(score: number): RiskLevel {
  if (score >= 80) return "CRITICAL";
  if (score >= 50) return "HIGH";
  if (score >= 25) return "MEDIUM";
  return "LOW";
}

export async function recordFraudEvent(args: {
  userId?: string | null;
  type: FraudEventType;
  summary: string;
  details?: Record<string, unknown>;
  level?: RiskLevel;
}) {
  const score = WEIGHTS[args.type];
  const level = args.level ?? levelForScore(score);

  const event = await prisma.fraudEvent.create({
    data: {
      userId: args.userId ?? undefined,
      type: args.type,
      level,
      score,
      summary: args.summary,
      details: args.details as never,
    },
  });

  if (args.userId) await recalculateRiskScore(args.userId);
  return event;
}

/** Recent events decay out of the score after 30 days. */
export async function recalculateRiskScore(userId: string) {
  const since = new Date(Date.now() - 30 * 24 * 3600_000);
  const events = await prisma.fraudEvent.findMany({
    where: { userId, resolvedAt: null, createdAt: { gte: since } },
    select: { score: true, createdAt: true },
  });

  const total = Math.min(100, events.reduce((sum, e) => sum + e.score, 0));
  const level = levelForScore(total);

  await prisma.riskScore.upsert({
    where: { userId },
    update: { score: total, level, lastEventAt: events.at(-1)?.createdAt ?? null },
    create: { userId, score: total, level, lastEventAt: events.at(-1)?.createdAt ?? null },
  });

  if (level === "CRITICAL") {
    await prisma.user.updateMany({
      where: { id: userId, status: "ACTIVE" },
      data: { status: "UNDER_REVIEW" },
    });
  }

  return { score: total, level };
}

// ----------------------------------------------------------------------
// Signal checks — called from the flows that can produce them
// ----------------------------------------------------------------------

/** Several accounts opened from one network in a short window. */
export async function checkSignupVelocity(ipHash: string | null) {
  if (!ipHash) return;
  const since = new Date(Date.now() - 24 * 3600_000);
  const count = await prisma.authSession.count({ where: { ipHash, createdAt: { gte: since } } });
  if (count >= 5) {
    await recordFraudEvent({
      type: "REPEATED_ACCOUNT_CREATION",
      summary: `${count} accounts signed in from one network in 24 hours.`,
      details: { count },
    });
  }
}

/** A task marked complete faster than the video could possibly have played. */
export async function checkTaskSpeed(args: {
  userId: string;
  campaignId: string;
  requiredSeconds: number;
  elapsedSeconds: number;
}) {
  if (args.elapsedSeconds >= args.requiredSeconds * 0.9) return false;
  await recordFraudEvent({
    userId: args.userId,
    type: "ABNORMAL_TASK_SPEED",
    summary: `Task submitted after ${args.elapsedSeconds}s of a ${args.requiredSeconds}s requirement.`,
    details: { campaignId: args.campaignId, elapsedSeconds: args.elapsedSeconds, requiredSeconds: args.requiredSeconds },
  });
  return true;
}

export async function checkReferralVelocity(referrerId: string) {
  const since = new Date(Date.now() - 24 * 3600_000);
  const count = await prisma.referral.count({ where: { referrerId, createdAt: { gte: since } } });
  if (count >= 15) {
    await recordFraudEvent({
      userId: referrerId,
      type: "EXCESSIVE_REFERRAL_ACTIVITY",
      summary: `${count} sign-ups from one referral code in 24 hours.`,
      details: { count },
    });
  }
}

/** Withdrawal to an account number already used by another user, or an unusually fast first cash-out. */
export async function checkWithdrawalRisk(args: {
  userId: string;
  accountNumber: string;
  grossAmount: number;
  accountAgeMs: number;
}) {
  const shared = await prisma.withdrawal.findFirst({
    where: { accountNumber: args.accountNumber, userId: { not: args.userId } },
    select: { userId: true },
  });

  if (shared) {
    await recordFraudEvent({
      userId: args.userId,
      type: "SUSPICIOUS_WITHDRAWAL",
      summary: "Payout account is already in use by another account.",
      details: { accountNumber: args.accountNumber.slice(-4).padStart(args.accountNumber.length, "*") },
      level: "HIGH",
    });
    return true;
  }

  if (args.accountAgeMs < 24 * 3600_000) {
    await recordFraudEvent({
      userId: args.userId,
      type: "SUSPICIOUS_WITHDRAWAL",
      summary: "First withdrawal requested within a day of sign-up.",
      details: { grossAmount: args.grossAmount },
    });
    return true;
  }
  return false;
}

export async function checkDuplicateSurvey(args: { userId: string; providerSlug: string; transactionId: string }) {
  await recordFraudEvent({
    userId: args.userId,
    type: "DUPLICATE_SURVEY_COMPLETION",
    summary: `Repeat callback for ${args.providerSlug} transaction ${args.transactionId}.`,
    details: args,
  });
}
