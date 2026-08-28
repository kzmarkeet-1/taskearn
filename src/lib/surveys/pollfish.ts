import { BaseSurveyAdapter } from "./base";
import type { StartSurveyResult, SurveyUserContext, WebhookVerification } from "./types";
import { hmacSha1Base64, safeCompare, randomReference } from "../crypto";
import { usdToMinor } from "./http";
import { env } from "../env";

/**
 * Pollfish.
 *
 * Pollfish is offerwall- and SDK-driven: there is no publisher endpoint that
 * lists a member's available surveys server-side the way CPX and BitLabs have.
 * `getAvailableSurveys` therefore returns nothing and inventory is expected to
 * come from admin-configured Survey rows carrying an offerwall `clickUrl`.
 * Inventing a fake list here would be worse than returning none.
 *
 * Callback signing, per Pollfish's documented scheme: HMAC-SHA1 over the
 * *concatenated substituted values* of the signed template parameters, in the
 * order they appear in the postback URL configured on the dashboard, keyed by
 * the account secret, then base64-encoded. Because the signed set is chosen by
 * whoever configured that URL, it has to be declared here too:
 *
 *   POLLFISH_SIGNED_PARAMS="tx_id,click_id,cpa,timestamp"
 *
 * That list must match the dashboard URL exactly, in the same order, or every
 * callback will fail verification. Set the postback to:
 *   https://YOUR_DOMAIN/api/webhooks/surveys/pollfish
 *     ?tx_id=[[tx_id]]&click_id=[[click_id]]&cpa=[[cpa]]
 *     &timestamp=[[timestamp]]&status=[[status]]&signature=[[signature]]
 */

export class PollfishAdapter extends BaseSurveyAdapter {
  readonly slug = "pollfish" as const;
  readonly name = "Pollfish";

  isConfigured() {
    return Boolean(process.env.POLLFISH_API_KEY);
  }

  private secret() {
    return process.env.POLLFISH_WEBHOOK_SECRET || process.env.POLLFISH_API_KEY || "";
  }

  /**
   * Entry is through the offerwall link held on the Survey row. The member's
   * click reference rides along as `click_id`, which Pollfish passes through to
   * the postback untouched.
   */
  async startSurvey(
    ctx: SurveyUserContext,
    survey: { externalId: string; clickUrl?: string | null },
  ): Promise<StartSurveyResult> {
    if (!this.isConfigured()) return { ok: false, reason: "Pollfish is not configured." };
    if (!survey.clickUrl) {
      return {
        ok: false,
        reason: "This Pollfish survey has no offerwall link configured yet.",
      };
    }

    const clickId = randomReference("PF");

    let redirectUrl: string;
    try {
      const url = new URL(survey.clickUrl);
      url.searchParams.set("click_id", clickId);
      url.searchParams.set("request_uuid", ctx.externalUserId);
      redirectUrl = url.toString();
    } catch {
      return { ok: false, reason: "That survey's entry link could not be read." };
    }

    return { ok: true, redirectUrl, transactionId: clickId, clickId };
  }

  async handleWebhook(rawBody: string, headers: Headers, url: URL): Promise<WebhookVerification> {
    const secret = this.secret();
    if (!secret) return { ok: false, reason: "POLLFISH_WEBHOOK_SECRET is not set." };

    // Pollfish delivers by GET. A JSON body is accepted as a fallback so a
    // dashboard configured for POST is not silently unsupported.
    const params = url.searchParams;
    let body: Record<string, unknown> = {};
    if (rawBody) {
      try {
        body = JSON.parse(rawBody) as Record<string, unknown>;
      } catch {
        // A non-JSON body on a GET-style callback is not an error.
      }
    }

    const read = (key: string): string => {
      const fromQuery = params.get(key);
      if (fromQuery !== null) return fromQuery;
      const fromBody = body[key];
      return fromBody === undefined || fromBody === null ? "" : String(fromBody);
    };

    const signature = read("signature");
    if (!signature) return { ok: false, reason: "The callback carried no signature." };

    const signedParams = env()
      .POLLFISH_SIGNED_PARAMS.split(",")
      .map((v) => v.trim())
      .filter(Boolean);

    if (signedParams.length === 0) {
      return { ok: false, reason: "POLLFISH_SIGNED_PARAMS is empty, so no callback can be verified." };
    }

    // Concatenated values, in the declared order. Missing values contribute an
    // empty string rather than being skipped, matching Pollfish's substitution.
    const signedPayload = signedParams.map((key) => read(key)).join("");
    const expected = hmacSha1Base64(secret, signedPayload);

    if (!safeCompare(signature, expected)) {
      return { ok: false, reason: "Signature did not match." };
    }

    const transactionId = read("tx_id") || read("transaction_id") || read("id");
    const externalUserId = read("request_uuid") || read("user_id") || read("device_id");
    if (!transactionId || !externalUserId) {
      return { ok: false, reason: "The callback is missing its transaction or user id." };
    }

    const rawStatus = read("status").toLowerCase();
    const status =
      rawStatus === "" || rawStatus === "complete" || rawStatus === "completed" || rawStatus === "1"
        ? "COMPLETED"
        : rawStatus === "reversed" || rawStatus === "chargeback"
          ? "REVERSED"
          : rawStatus === "screenout" || rawStatus === "screened_out"
            ? "SCREENED_OUT"
            : "DISQUALIFIED";

    // `cpa` is quoted in USD cents by Pollfish, not dollars.
    const cpaCents = Number(read("cpa"));
    const payoutAmount = Number.isFinite(cpaCents)
      ? usdToMinor(cpaCents / 100, env().USD_RATE_MINOR)
      : 0;

    return {
      ok: true,
      callback: {
        eventId: `${transactionId}:${rawStatus || "complete"}`,
        transactionId,
        externalUserId,
        clickId: read("click_id") || undefined,
        status,
        payoutAmount,
        surveyExternalId: read("survey_id") || undefined,
        raw: { ...Object.fromEntries(params.entries()), ...body },
      },
    };
  }
}
