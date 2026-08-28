import { BaseSurveyAdapter } from "./base";
import type { ProviderSurvey, StartSurveyResult, SurveyUserContext, WebhookVerification } from "./types";
import { md5Hex, safeCompare, randomReference } from "../crypto";
import { providerGet, usdToMinor } from "./http";
import { env } from "../env";

/**
 * CPX Research (Make Opinion GmbH).
 *
 * Credentials, from publisher.cpx-research.com -> Apps:
 *   CPX_APP_ID  — the numeric app id
 *   CPX_API_KEY — the "secure hash" string. CPX uses this one secret in both
 *                 directions, so CPX_WEBHOOK_SECRET is optional and falls back
 *                 to it.
 *
 * Two different hashes, and mixing them up is the usual integration bug:
 *   outbound API call  ->  md5(ext_user_id + "-" + secure_hash)
 *   inbound postback   ->  md5(trans_id    + "-" + secure_hash)
 *
 * Postback URL to configure on the CPX dashboard (Postback Settings tab):
 *   https://YOUR_DOMAIN/api/webhooks/surveys/cpx
 *     ?status={status}&trans_id={trans_id}&user_id={user_id}
 *     &amount_local={amount_local}&amount_usd={amount_usd}
 *     &offer_id={offer_id}&hash={secure_hash}&subid_1={subid_1}
 */

type CpxSurvey = {
  id: string | number;
  loi?: string | number;
  payout?: string | number;
  payout_publisher_usd?: string | number;
  conversion_rate?: string | number;
  href?: string;
  href_new?: string;
};

type CpxResponse = {
  status?: string;
  count_available_surveys?: number;
  surveys?: CpxSurvey[];
};

const API_BASE = "https://live-api.cpx-research.com/api/get-surveys.php";

export class CpxAdapter extends BaseSurveyAdapter {
  readonly slug = "cpx" as const;
  readonly name = "CPX Research";

  isConfigured() {
    return Boolean(process.env.CPX_API_KEY && process.env.CPX_APP_ID);
  }

  private secret() {
    return process.env.CPX_API_KEY ?? "";
  }

  /** The hash CPX expects on outbound API calls: md5(ext_user_id - secure_hash). */
  private userHash(externalUserId: string) {
    return md5Hex(`${externalUserId}-${this.secret()}`);
  }

  async getAvailableSurveys(ctx: SurveyUserContext): Promise<ProviderSurvey[]> {
    if (!this.isConfigured()) return [];

    const params = new URLSearchParams({
      app_id: process.env.CPX_APP_ID ?? "",
      ext_user_id: ctx.externalUserId,
      output_method: "api",
      // CPX matches region-locked studies on the member's IP. When the caller
      // has none the request still goes out; CPX degrades to a generic list
      // rather than rejecting it.
      ip_user: ctx.ipAddress ?? "",
      user_agent: ctx.userAgent ?? "",
      limit: "20",
      secure_hash: this.userHash(ctx.externalUserId),
    });

    const result = await providerGet<CpxResponse>(`${API_BASE}?${params.toString()}`);
    if (!result.ok) {
      console.warn(`[surveys:cpx] inventory unavailable — ${result.reason}`);
      return [];
    }
    if (result.data.status !== "success" || !Array.isArray(result.data.surveys)) return [];

    const rate = env().USD_RATE_MINOR;

    return result.data.surveys.map((survey) => {
      const loi = Number(survey.loi ?? 0) || 0;
      return {
        externalId: String(survey.id),
        name: loi > 0 ? `Survey · about ${loi} min` : "Survey",
        // What CPX pays *us*. The member's share is applied centrally from the
        // provider's revenueShareBps, never guessed at here.
        payoutAmount: usdToMinor(survey.payout_publisher_usd, rate),
        estimatedMinutes: loi > 0 ? loi : 5,
        loi: loi > 0 ? loi : undefined,
        conversionRate: Number(survey.conversion_rate ?? 0) || undefined,
        clickUrl: survey.href_new ?? survey.href,
      };
    });
  }

  /**
   * CPX issues the entry link itself; we only tag it so the postback can be
   * traced back to this click. `subid_1` is echoed back verbatim.
   */
  async startSurvey(
    ctx: SurveyUserContext,
    survey: { externalId: string; clickUrl?: string | null },
  ): Promise<StartSurveyResult> {
    if (!this.isConfigured()) return { ok: false, reason: "CPX Research is not configured." };
    if (!survey.clickUrl) {
      return { ok: false, reason: "That survey no longer has an entry link. Refresh the list." };
    }

    const clickId = randomReference("CPX");

    let redirectUrl: string;
    try {
      const url = new URL(survey.clickUrl);
      url.searchParams.set("subid_1", clickId);
      redirectUrl = url.toString();
    } catch {
      return { ok: false, reason: "That survey's entry link could not be read." };
    }

    return { ok: true, redirectUrl, transactionId: clickId, clickId };
  }

  async handleWebhook(_rawBody: string, _headers: Headers, url: URL): Promise<WebhookVerification> {
    const secret = process.env.CPX_WEBHOOK_SECRET || process.env.CPX_API_KEY;
    if (!secret) return { ok: false, reason: "CPX_WEBHOOK_SECRET is not set." };

    const params = url.searchParams;
    const transactionId = params.get("trans_id") ?? "";
    const externalUserId = params.get("user_id") ?? "";
    const status = params.get("status") ?? "";
    const signature = params.get("hash") ?? "";

    if (!transactionId || !externalUserId) {
      return { ok: false, reason: "The callback is missing its transaction or user id." };
    }

    // md5(trans_id + "-" + secure_hash), compared in constant time. A length
    // mismatch fails closed inside safeCompare.
    const expected = md5Hex(`${transactionId}-${secret}`);
    if (!signature || !safeCompare(signature.toLowerCase(), expected)) {
      return { ok: false, reason: "Signature did not match.", eventId: `${transactionId}:${status}` };
    }

    // CPX sends status=1 for a credit and status=2 for a chargeback.
    const normalizedStatus =
      status === "1" ? "COMPLETED" : status === "2" ? "REVERSED" : "DISQUALIFIED";

    // amount_usd is what CPX pays the publisher; amount_local is what the
    // member would see in the publisher's configured currency. The ledger runs
    // off the publisher figure so the revenue share is applied in one place.
    const payout = usdToMinor(params.get("amount_usd"), env().USD_RATE_MINOR);

    return {
      ok: true,
      callback: {
        // Status is part of the event id so a completion and a later reversal
        // are two distinct deliveries rather than a duplicate.
        eventId: `${transactionId}:${status}`,
        transactionId,
        externalUserId,
        clickId: params.get("subid_1") ?? undefined,
        status: normalizedStatus,
        payoutAmount: payout,
        surveyExternalId: params.get("offer_id") ?? params.get("survey_id") ?? undefined,
        raw: Object.fromEntries(params.entries()),
      },
    };
  }
}
