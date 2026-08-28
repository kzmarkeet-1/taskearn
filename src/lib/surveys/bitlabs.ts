import { BaseSurveyAdapter } from "./base";
import type { ProviderSurvey, StartSurveyResult, SurveyUserContext, WebhookVerification } from "./types";
import { hmacSha1Hex, safeCompare, randomReference } from "../crypto";
import { providerGet, usdToMinor } from "./http";
import { env } from "../env";

/**
 * BitLabs.
 *
 * Credentials, from the BitLabs publisher dashboard -> Apps -> Integration:
 *   BITLABS_API_KEY        — the app token, sent as the X-Api-Token header
 *   BITLABS_WEBHOOK_SECRET — the app secret used to sign callbacks. BitLabs
 *                            uses the same value for both in most accounts, so
 *                            this falls back to the API key when unset.
 *
 * Callback signing, per BitLabs' documented scheme: a hex HMAC-SHA1 of the
 * *entire callback URL with `&hash=...` removed*, keyed by the app secret. That
 * means the URL must be reconstructed exactly as BitLabs built it — same host,
 * same parameter order — which is why the raw query string is used below rather
 * than a re-serialised URLSearchParams.
 *
 * Reward callback to configure on the dashboard:
 *   https://YOUR_DOMAIN/api/webhooks/surveys/bitlabs
 *     ?uid=[%UID%]&val=[%VAL%]&raw=[%RAW%]&tx=[%TX%]&type=[%TYPE%]
 */

type BitLabsSurvey = {
  id?: string | number;
  network_id?: string | number;
  cpi?: string | number;
  value?: string | number;
  loi?: string | number;
  rating?: number;
  country?: string;
  click_url?: string;
  link?: string;
};

type BitLabsResponse = {
  status?: string;
  data?: { surveys?: BitLabsSurvey[] } | BitLabsSurvey[];
  error?: unknown;
};

const API_SURVEYS = "https://api.bitlabs.ai/v2/client/surveys";

export class BitLabsAdapter extends BaseSurveyAdapter {
  readonly slug = "bitlabs" as const;
  readonly name = "BitLabs";

  isConfigured() {
    return Boolean(process.env.BITLABS_API_KEY);
  }

  private secret() {
    return process.env.BITLABS_WEBHOOK_SECRET || process.env.BITLABS_API_KEY || "";
  }

  async getAvailableSurveys(ctx: SurveyUserContext): Promise<ProviderSurvey[]> {
    if (!this.isConfigured()) return [];

    const result = await providerGet<BitLabsResponse>(API_SURVEYS, {
      headers: {
        "X-Api-Token": process.env.BITLABS_API_KEY ?? "",
        "X-User-Id": ctx.externalUserId,
      },
    });

    if (!result.ok) {
      console.warn(`[surveys:bitlabs] inventory unavailable — ${result.reason}`);
      return [];
    }

    // BitLabs has shipped both `{data: {surveys: []}}` and `{data: []}` across
    // API revisions. Accepting either costs one line and avoids an outage the
    // next time the envelope changes.
    const payload = result.data.data;
    const surveys: BitLabsSurvey[] = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.surveys)
        ? payload.surveys
        : [];

    const rate = env().USD_RATE_MINOR;

    return surveys
      .filter((s) => s.id !== undefined)
      .map((survey) => {
        const loi = Number(survey.loi ?? 0) || 0;
        return {
          externalId: String(survey.id),
          name: loi > 0 ? `Survey · about ${loi} min` : "Survey",
          // `cpi` is the publisher payout in USD.
          payoutAmount: usdToMinor(survey.cpi ?? survey.value, rate),
          estimatedMinutes: loi > 0 ? loi : 6,
          loi: loi > 0 ? loi : undefined,
          targetCountries: survey.country ? [survey.country] : undefined,
          clickUrl: survey.click_url ?? survey.link,
        };
      });
  }

  /**
   * BitLabs carries publisher-defined parameters through the `tags` query
   * parameter on the click URL and returns them on the callback.
   */
  async startSurvey(
    ctx: SurveyUserContext,
    survey: { externalId: string; clickUrl?: string | null },
  ): Promise<StartSurveyResult> {
    if (!this.isConfigured()) return { ok: false, reason: "BitLabs is not configured." };
    if (!survey.clickUrl) {
      return { ok: false, reason: "That survey no longer has an entry link. Refresh the list." };
    }

    const clickId = randomReference("BL");

    let redirectUrl: string;
    try {
      const url = new URL(survey.clickUrl);
      url.searchParams.set("tags", `click_id=${clickId}`);
      redirectUrl = url.toString();
    } catch {
      return { ok: false, reason: "That survey's entry link could not be read." };
    }

    return { ok: true, redirectUrl, transactionId: clickId, clickId };
  }

  async handleWebhook(_rawBody: string, headers: Headers, url: URL): Promise<WebhookVerification> {
    const secret = this.secret();
    if (!secret) return { ok: false, reason: "BITLABS_WEBHOOK_SECRET is not set." };

    const params = url.searchParams;
    const signature = params.get("hash") ?? "";
    if (!signature) return { ok: false, reason: "The callback carried no hash." };

    // Rebuild the URL BitLabs signed: everything up to, but not including, the
    // "&hash=" it appended last. Slicing the raw string rather than rebuilding
    // from parsed parameters preserves the exact encoding and ordering that
    // went into their HMAC.
    const forwardedHost = headers.get("x-forwarded-host") ?? headers.get("host") ?? url.host;
    const protocol = headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
    const fullUrl = `${protocol}://${forwardedHost}${url.pathname}${url.search}`;

    const marker = `&hash=${signature}`;
    const signedPortion = fullUrl.endsWith(marker) ? fullUrl.slice(0, -marker.length) : null;

    if (!signedPortion) {
      // `hash` must be the final parameter for the scheme to be reproducible.
      // If it is not, the callback URL on the dashboard has been edited into a
      // shape this check cannot verify, and guessing would defeat the point.
      return { ok: false, reason: "The hash parameter must be last in the callback URL." };
    }

    const expected = hmacSha1Hex(secret, signedPortion);
    if (!safeCompare(signature.toLowerCase(), expected)) {
      return { ok: false, reason: "Signature did not match." };
    }

    const transactionId = params.get("tx") ?? params.get("transaction_id") ?? "";
    const externalUserId = params.get("uid") ?? params.get("user_id") ?? "";
    if (!transactionId || !externalUserId) {
      return { ok: false, reason: "The callback is missing its transaction or user id." };
    }

    const type = (params.get("type") ?? "COMPLETE").toUpperCase();
    const status =
      type === "COMPLETE" || type === "COMPLETED"
        ? "COMPLETED"
        : type === "RECONCILIATION" || type === "REVERSAL" || type === "CHARGEBACK"
          ? "REVERSED"
          : type === "SCREENOUT"
            ? "SCREENED_OUT"
            : "DISQUALIFIED";

    // `raw` is the publisher payout in USD; `val` is the member-facing value in
    // the app's own currency setting. Prefer `raw` so the revenue share is
    // applied to real revenue.
    const payoutUsd = params.get("raw") ?? params.get("val") ?? params.get("value");

    return {
      ok: true,
      callback: {
        eventId: `${transactionId}:${type}`,
        transactionId,
        externalUserId,
        clickId: params.get("click_id") ?? undefined,
        status,
        payoutAmount: usdToMinor(payoutUsd, env().USD_RATE_MINOR),
        surveyExternalId: params.get("survey_id") ?? undefined,
        raw: Object.fromEntries(params.entries()),
      },
    };
  }
}
