/**
 * Survey provider contract.
 *
 * Adapters translate a provider's API into these shapes and nothing more.
 * No adapter may invent a survey, a completion, or a payout. When credentials
 * are missing an adapter reports `configured: false` and returns nothing.
 */

export type ProviderSurvey = {
  externalId: string;
  name: string;
  /** What the platform is paid, in minor units. */
  payoutAmount: number;
  estimatedMinutes: number;
  loi?: number;
  conversionRate?: number;
  targetCountries?: string[];
  clickUrl?: string;
};

export type SurveyUserContext = {
  userId: string;
  country: string;
  /** Opaque per-user identifier passed to the provider. Never the email. */
  externalUserId: string;
  /**
   * Providers match region-locked studies on these. They are forwarded, not
   * stored: the platform keeps only hashes of both (see hashIdentifier).
   */
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type StartSurveyResult =
  | {
      ok: true;
      redirectUrl: string;
      transactionId: string;
      /** Our reference, tagged onto the entry link and echoed in the postback. */
      clickId?: string;
    }
  | { ok: false; reason: string };

export type NormalizedCallback = {
  eventId: string;
  transactionId: string;
  externalUserId: string;
  /** Echoed back from the entry link, when the provider supports pass-through. */
  clickId?: string;
  status: "COMPLETED" | "DISQUALIFIED" | "SCREENED_OUT" | "REVERSED";
  /** What the provider pays the platform, in minor units. */
  payoutAmount: number;
  surveyExternalId?: string;
  raw: Record<string, unknown>;
};

export type WebhookVerification =
  | { ok: true; callback: NormalizedCallback }
  | { ok: false; reason: string; eventId?: string };

export interface SurveyProviderAdapter {
  readonly slug: "cpx" | "pollfish" | "bitlabs";
  readonly name: string;
  /** True only when every credential this adapter needs is present. */
  isConfigured(): boolean;
  getAvailableSurveys(ctx: SurveyUserContext): Promise<ProviderSurvey[]>;
  startSurvey(
    ctx: SurveyUserContext,
    survey: { externalId: string; clickUrl?: string | null },
  ): Promise<StartSurveyResult>;
  handleCompletion(callback: NormalizedCallback): Promise<{ credit: boolean; payoutAmount: number }>;
  handleDisqualification(callback: NormalizedCallback): Promise<{ credit: false }>;
  handleWebhook(rawBody: string, headers: Headers, url: URL): Promise<WebhookVerification>;
}

export const NOT_CONFIGURED_MESSAGE = "Survey provider is not configured.";
