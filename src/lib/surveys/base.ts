import type {
  NormalizedCallback,
  ProviderSurvey,
  StartSurveyResult,
  SurveyProviderAdapter,
  SurveyUserContext,
  WebhookVerification,
} from "./types";
import { NOT_CONFIGURED_MESSAGE } from "./types";

/**
 * Shared behaviour for every adapter. The default methods are deliberately
 * inert: an unconfigured provider offers nothing rather than pretending.
 */
export abstract class BaseSurveyAdapter implements SurveyProviderAdapter {
  abstract readonly slug: "cpx" | "pollfish" | "bitlabs";
  abstract readonly name: string;
  abstract isConfigured(): boolean;

  async getAvailableSurveys(_ctx: SurveyUserContext): Promise<ProviderSurvey[]> {
    if (!this.isConfigured()) return [];
    // Implement the provider's inventory call here once access is granted.
    return [];
  }

  async startSurvey(
    _ctx: SurveyUserContext,
    _survey: { externalId: string; clickUrl?: string | null },
  ): Promise<StartSurveyResult> {
    if (!this.isConfigured()) return { ok: false, reason: NOT_CONFIGURED_MESSAGE };
    return { ok: false, reason: `${this.name} entry links are not implemented yet.` };
  }

  async handleCompletion(callback: NormalizedCallback) {
    return { credit: callback.status === "COMPLETED", payoutAmount: callback.payoutAmount };
  }

  async handleDisqualification(_callback: NormalizedCallback) {
    return { credit: false as const };
  }

  abstract handleWebhook(rawBody: string, headers: Headers, url: URL): Promise<WebhookVerification>;
}
