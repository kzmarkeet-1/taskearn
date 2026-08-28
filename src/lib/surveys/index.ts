import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { creditPendingReward, reverseReward } from "../wallet";
import { notify } from "../notifications";
import { handleRefereeEarning } from "../referrals";
import { checkDuplicateSurvey } from "../fraud";
import { getSettings } from "../settings";
import { assertSurveyAllowance, getEntitlements } from "../tiers";
import { isAllowedPostbackIp } from "./http";
import { env } from "../env";
import { CpxAdapter } from "./cpx";
import { PollfishAdapter } from "./pollfish";
import { BitLabsAdapter } from "./bitlabs";
import { NOT_CONFIGURED_MESSAGE, type SurveyProviderAdapter } from "./types";

export * from "./types";

const ADAPTERS: SurveyProviderAdapter[] = [new CpxAdapter(), new PollfishAdapter(), new BitLabsAdapter()];

export function getAdapter(slug: string): SurveyProviderAdapter | null {
  return ADAPTERS.find((a) => a.slug === slug) ?? null;
}

export function listAdapters() {
  return ADAPTERS.map((a) => ({ slug: a.slug, name: a.name, configured: a.isConfigured() }));
}

/** Keeps the SurveyProvider rows in step with which credentials are actually present. */
export async function syncProviderRows() {
  for (const adapter of ADAPTERS) {
    await prisma.surveyProvider.upsert({
      where: { slug: adapter.slug },
      update: { configured: adapter.isConfigured(), name: adapter.name },
      create: {
        slug: adapter.slug,
        name: adapter.name,
        configured: adapter.isConfigured(),
        enabled: adapter.isConfigured(),
      },
    });
  }
}

/**
 * Pulls each configured provider's live inventory for one member and writes it
 * into the Survey table.
 *
 * Providers quote per-user inventory, so this runs on the member's own request
 * rather than on a global schedule. CPX asks callers to cache for no more than
 * 120 seconds, and that figure is the tightest of the three, so it governs.
 *
 * Failures are swallowed on purpose: a provider outage should leave the member
 * with whatever was already listed, not an error page.
 */
const INVENTORY_TTL_MS = 120_000;
const lastRefresh = new Map<string, number>();

export async function refreshInventoryForUser(ctx: {
  userId: string;
  country: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  const now = Date.now();
  const previous = lastRefresh.get(ctx.userId) ?? 0;
  if (now - previous < INVENTORY_TTL_MS) return { refreshed: false as const, providers: 0 };
  lastRefresh.set(ctx.userId, now);

  const providers = await prisma.surveyProvider.findMany({ where: { enabled: true, configured: true } });
  let touched = 0;

  for (const provider of providers) {
    const adapter = getAdapter(provider.slug);
    if (!adapter || !adapter.isConfigured()) continue;

    let inventory;
    try {
      inventory = await adapter.getAvailableSurveys({
        userId: ctx.userId,
        country: ctx.country,
        externalUserId: ctx.userId,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      });
    } catch (error) {
      console.error(`[surveys] ${provider.slug} inventory failed:`, error);
      continue;
    }

    if (inventory.length === 0) continue;

    for (const item of inventory) {
      // The reward stored on the row is the member's share, computed once here
      // from the provider's payout. The webhook recomputes it from the payout
      // it is actually paid, so a stale row can never overpay.
      const rewardAmount = Math.floor((item.payoutAmount * provider.revenueShareBps) / 10_000);

      await prisma.survey.upsert({
        where: { providerId_externalId: { providerId: provider.id, externalId: item.externalId } },
        update: {
          name: item.name,
          rewardAmount,
          estimatedMinutes: item.estimatedMinutes,
          loi: item.loi,
          conversionRate: item.conversionRate,
          targetCountries: item.targetCountries ?? [],
          clickUrl: item.clickUrl,
          active: true,
        },
        create: {
          providerId: provider.id,
          externalId: item.externalId,
          name: item.name,
          rewardAmount,
          estimatedMinutes: item.estimatedMinutes,
          loi: item.loi,
          conversionRate: item.conversionRate,
          targetCountries: item.targetCountries ?? [],
          clickUrl: item.clickUrl,
        },
      });
      touched += 1;
    }

    // Entry links are per-user and short-lived. Anything this provider did not
    // return is retired rather than left to hand out a dead link later.
    const liveIds = inventory.map((i) => i.externalId);
    await prisma.survey.updateMany({
      where: { providerId: provider.id, isDemo: false, externalId: { notIn: liveIds } },
      data: { active: false },
    });
  }

  return { refreshed: true as const, providers: providers.length, surveys: touched };
}

export type SurveyOffer = {
  id: string;
  providerSlug: string;
  providerName: string;
  name: string;
  rewardAmount: number;
  estimatedMinutes: number;
  eligible: boolean;
  eligibilityNote: string;
  isDemo: boolean;
};

/**
 * Lists what a user can actually start right now.
 * Demo rows are returned only in development and are labelled as such.
 */
export async function listSurveysForUser(user: {
  id: string;
  country: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}): Promise<{
  offers: SurveyOffer[];
  configuredProviders: number;
  allowance: { used: number; limit: number; remaining: number } | null;
  message?: string;
}> {
  const settings = await getSettings();
  if (!settings.enableSurveys) {
    return {
      offers: [],
      configuredProviders: 0,
      allowance: null,
      message: "Surveys are turned off right now.",
    };
  }

  // Pull fresh inventory before listing. Rate-limited internally to CPX's
  // 120-second caching guidance, so this is cheap on repeat views.
  await refreshInventoryForUser({
    userId: user.id,
    country: user.country,
    ipAddress: user.ipAddress,
    userAgent: user.userAgent,
  }).catch((error) => {
    console.error("[surveys] inventory refresh failed:", error);
  });

  const providers = await prisma.surveyProvider.findMany({ where: { enabled: true } });
  const configured = providers.filter((p) => p.configured);

  const surveys = await prisma.survey.findMany({
    where: { active: true, providerId: { in: providers.map((p) => p.id) } },
    include: { provider: true },
    orderBy: { rewardAmount: "desc" },
    take: 50,
  });

  const alreadyDone = await prisma.surveyCompletion.findMany({
    where: { userId: user.id, status: "COMPLETED" },
    select: { surveyId: true },
  });
  const doneIds = new Set(alreadyDone.map((c) => c.surveyId));

  const offers = surveys
    .filter((s) => !s.isDemo || process.env.NODE_ENV !== "production")
    .map((s) => {
      const countryOk = s.targetCountries.length === 0 || s.targetCountries.includes(user.country);
      const providerOk = s.provider.configured || s.isDemo;
      const notRepeated = !doneIds.has(s.id);
      return {
        id: s.id,
        providerSlug: s.provider.slug,
        providerName: s.provider.name,
        name: s.name,
        rewardAmount: s.rewardAmount,
        estimatedMinutes: s.estimatedMinutes,
        eligible: countryOk && providerOk && notRepeated,
        eligibilityNote: !countryOk
          ? "Not available in your country"
          : !notRepeated
            ? "You have already completed this survey"
            : !providerOk
              ? NOT_CONFIGURED_MESSAGE
              : "Open to you",
        isDemo: s.isDemo,
      };
    });

  const entitlements = await getEntitlements(user.id);
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const startedToday = await prisma.surveyCompletion.count({
    where: { userId: user.id, startedAt: { gte: startOfDay }, status: { in: ["STARTED", "COMPLETED"] } },
  });
  const remaining = Math.max(0, entitlements.dailySurveyLimit - startedToday);

  return {
    offers: offers.map((offer) => ({
      ...offer,
      eligible: offer.eligible && remaining > 0,
      eligibilityNote:
        offer.eligible && remaining <= 0
          ? `You have started today's ${entitlements.dailySurveyLimit} surveys on ${entitlements.planName}`
          : offer.eligibilityNote,
    })),
    configuredProviders: configured.length,
    allowance: { used: startedToday, limit: entitlements.dailySurveyLimit, remaining },
    message: configured.length === 0 ? NOT_CONFIGURED_MESSAGE : undefined,
  };
}

export async function startSurvey(
  user: { id: string; country: string; ipAddress?: string | null; userAgent?: string | null },
  surveyId: string,
) {
  const survey = await prisma.survey.findUnique({ where: { id: surveyId }, include: { provider: true } });
  if (!survey) return { ok: false as const, reason: "That survey is no longer listed." };

  const adapter = getAdapter(survey.provider.slug);
  if (!adapter || !adapter.isConfigured()) {
    return { ok: false as const, reason: NOT_CONFIGURED_MESSAGE };
  }

  // Daily allowance from the member's tier. Throws with a member-facing message.
  await assertSurveyAllowance(user.id);

  const existing = await prisma.surveyCompletion.findFirst({
    where: { userId: user.id, surveyId, status: { in: ["COMPLETED", "STARTED"] } },
  });
  if (existing?.status === "COMPLETED") {
    return { ok: false as const, reason: "You have already completed this survey." };
  }

  const result = await adapter.startSurvey(
    {
      userId: user.id,
      country: user.country,
      externalUserId: user.id,
      ipAddress: user.ipAddress,
      userAgent: user.userAgent,
    },
    { externalId: survey.externalId, clickUrl: survey.clickUrl },
  );

  if (!result.ok) return { ok: false as const, reason: result.reason };

  await prisma.surveyCompletion.upsert({
    where: { providerId_transactionId: { providerId: survey.providerId, transactionId: result.transactionId } },
    update: {},
    create: {
      userId: user.id,
      providerId: survey.providerId,
      surveyId: survey.id,
      transactionId: result.transactionId,
      clickId: result.clickId ?? null,
      status: "STARTED",
    },
  });

  return { ok: true as const, redirectUrl: result.redirectUrl };
}

/**
 * Retires entry rows nobody ever came back from.
 *
 * A member who opens a survey and closes the tab leaves a STARTED row behind.
 * Left alone those rows accumulate and eat the member's daily survey allowance
 * for good, which looks from their side like the limit silently shrinking.
 */
export async function abandonStaleSurveyEntries(olderThanMinutes = 180) {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000);
  const result = await prisma.surveyCompletion.updateMany({
    where: { status: "STARTED", startedAt: { lt: cutoff } },
    data: { status: "DISQUALIFIED" },
  });
  return { abandoned: result.count };
}

// ----------------------------------------------------------------------
// Webhook processing
// ----------------------------------------------------------------------

export type WebhookOutcome = {
  status: number;
  body: { received: boolean; message: string };
};

/**
 * Processes one provider callback.
 *
 * Duplicate protection has two layers: a unique index on
 * (providerSlug, eventId) here, and a unique idempotencyKey on the wallet
 * transaction. A replayed delivery can never credit a user twice.
 */
export async function processSurveyWebhook(
  slug: string,
  request: Request,
): Promise<WebhookOutcome> {
  const adapter = getAdapter(slug);
  if (!adapter) return { status: 404, body: { received: false, message: "Unknown survey provider." } };

  // Optional second gate. The signature is the real authentication; this only
  // narrows the blast radius if a secret ever leaks. Empty allowlist = open,
  // because a half-configured allowlist silently drops real callbacks and
  // members lose money without anyone noticing.
  const callerIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  if (!isAllowedPostbackIp(callerIp, env().SURVEY_POSTBACK_IP_ALLOWLIST)) {
    return { status: 403, body: { received: false, message: "Caller is not on the postback allowlist." } };
  }

  const rawBody = await request.text();
  const url = new URL(request.url);
  const verification = await adapter.handleWebhook(rawBody, request.headers, url);

  if (!verification.ok) {
    await prisma.webhookEvent
      .create({
        data: {
          providerSlug: slug,
          eventId: verification.eventId ?? `rejected:${Date.now()}`,
          signatureOk: false,
          payload: { query: Object.fromEntries(url.searchParams.entries()), body: rawBody.slice(0, 2000) },
          error: verification.reason,
        },
      })
      .catch(() => undefined);
    return { status: 401, body: { received: false, message: verification.reason } };
  }

  const callback = verification.callback;
  const provider = await prisma.surveyProvider.findUnique({ where: { slug } });
  if (!provider) return { status: 404, body: { received: false, message: "Provider is not registered." } };

  // Layer one: has this exact delivery been seen before?
  let event;
  try {
    event = await prisma.webhookEvent.create({
      data: {
        providerId: provider.id,
        providerSlug: slug,
        eventId: callback.eventId,
        signatureOk: true,
        payload: callback.raw as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { status: 200, body: { received: true, message: "Already processed." } };
    }
    throw error;
  }

  // The provider echoes back whatever it was given as the sub-id. Anything that
  // is not a well-formed uuid would make the lookup below throw, and a 500
  // tells the provider to retry a delivery that can never succeed. Treat it as
  // handled-and-unmatched instead so the retry loop never starts.
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const user = UUID.test(callback.externalUserId)
    ? await prisma.user.findUnique({ where: { id: callback.externalUserId } })
    : null;

  if (!user) {
    await prisma.webhookEvent.update({
      where: { id: event.id },
      data: { processedAt: new Date(), error: "No matching user." },
    });
    return { status: 200, body: { received: true, message: "No matching user." } };
  }

  const rewardKey = `survey:${provider.id}:${callback.transactionId}`;

  if (callback.status === "COMPLETED") {
    const result = await adapter.handleCompletion(callback);
    const userReward = Math.floor((result.payoutAmount * provider.revenueShareBps) / 10_000);

    const existing = await prisma.surveyCompletion.findUnique({
      where: { providerId_transactionId: { providerId: provider.id, transactionId: callback.transactionId } },
    });

    if (existing?.status === "COMPLETED") {
      await checkDuplicateSurvey({ userId: user.id, providerSlug: slug, transactionId: callback.transactionId });
      await prisma.webhookEvent.update({
        where: { id: event.id },
        data: { processedAt: new Date(), error: "Duplicate completion." },
      });
      return { status: 200, body: { received: true, message: "Already credited." } };
    }

    const survey = callback.surveyExternalId
      ? await prisma.survey.findUnique({
          where: { providerId_externalId: { providerId: provider.id, externalId: callback.surveyExternalId } },
        })
      : null;

    // Reconcile the entry row with the provider's own transaction id.
    //
    // A STARTED row is keyed on the click reference we generated, because at
    // entry time the provider has not issued a transaction id yet. Renaming
    // that row here — rather than inserting a second one — is what keeps one
    // survey to one row. Without it the member's entry would sit STARTED
    // forever, consuming a slot of their daily allowance that they did in fact
    // finish.
    if (callback.clickId && !existing) {
      await prisma.surveyCompletion
        .updateMany({
          where: {
            providerId: provider.id,
            clickId: callback.clickId,
            userId: user.id,
            status: "STARTED",
          },
          data: { transactionId: callback.transactionId },
        })
        .catch((error) => {
          // A unique violation here means the real transaction id already has a
          // row. The upsert below will find it, so this is recoverable.
          console.warn(`[surveys:${slug}] could not link click ${callback.clickId}:`, error);
        });
    }

    await prisma.surveyCompletion.upsert({
      where: { providerId_transactionId: { providerId: provider.id, transactionId: callback.transactionId } },
      update: {
        status: "COMPLETED",
        rewardAmount: userReward,
        payoutAmount: result.payoutAmount,
        completedAt: new Date(),
      },
      create: {
        userId: user.id,
        providerId: provider.id,
        surveyId: survey?.id,
        transactionId: callback.transactionId,
        clickId: callback.clickId ?? null,
        status: "COMPLETED",
        rewardAmount: userReward,
        payoutAmount: result.payoutAmount,
        completedAt: new Date(),
      },
    });

    if (result.credit && userReward > 0) {
      const credited = await creditPendingReward({
        userId: user.id,
        amount: userReward,
        type: "SURVEY_REWARD",
        description: `Survey reward — ${provider.name}`,
        idempotencyKey: rewardKey,
        referenceType: "survey",
        referenceId: callback.transactionId,
        metadata: { provider: slug, surveyId: survey?.id ?? null },
      });

      if (!credited.duplicate) {
        await notify({
          userId: user.id,
          type: "REWARD_CREDITED",
          title: "Survey reward added",
          body: "Your survey reward is pending verification and will clear shortly.",
          href: "/dashboard/wallet",
        });
        await handleRefereeEarning({ refereeId: user.id, rewardAmount: userReward, sourceKey: rewardKey });
      }
    }
  } else if (callback.status === "REVERSED") {
    const completion = await prisma.surveyCompletion.findUnique({
      where: { providerId_transactionId: { providerId: provider.id, transactionId: callback.transactionId } },
    });
    if (completion && completion.status === "COMPLETED" && completion.rewardAmount > 0) {
      await reverseReward({
        userId: user.id,
        amount: completion.rewardAmount,
        description: `Survey reward reversed by ${provider.name}`,
        idempotencyKey: `${rewardKey}:reversal`,
        referenceType: "survey",
        referenceId: callback.transactionId,
      });
      await prisma.surveyCompletion.update({ where: { id: completion.id }, data: { status: "REVERSED" } });
      await notify({
        userId: user.id,
        type: "SECURITY_ALERT",
        title: "A survey reward was reversed",
        body: `${provider.name} withdrew a completion after review. The reward has been removed from your wallet.`,
        href: "/dashboard/wallet",
      });
    }
  } else {
    await adapter.handleDisqualification(callback);
    await prisma.surveyCompletion.upsert({
      where: { providerId_transactionId: { providerId: provider.id, transactionId: callback.transactionId } },
      update: { status: callback.status },
      create: {
        userId: user.id,
        providerId: provider.id,
        transactionId: callback.transactionId,
        clickId: callback.clickId ?? null,
        status: callback.status,
      },
    });
  }

  await prisma.webhookEvent.update({ where: { id: event.id }, data: { processedAt: new Date() } });
  return { status: 200, body: { received: true, message: "Processed." } };
}
