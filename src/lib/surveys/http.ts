import "server-only";

/**
 * Outbound calls to survey providers.
 *
 * Every provider call goes through here so three things are guaranteed rather
 * than remembered: a timeout, a bounded response read, and a failure that
 * returns instead of throwing. A survey provider having a bad afternoon must
 * degrade the surveys list, not take down the dashboard that renders it.
 */

const DEFAULT_TIMEOUT_MS = 8_000;
const MAX_BODY_BYTES = 512 * 1024;

export type ProviderResponse<T> =
  | { ok: true; data: T }
  | { ok: false; reason: string; status?: number };

export async function providerGet<T>(
  url: string,
  options: { headers?: Record<string, string>; timeoutMs?: number } = {},
): Promise<ProviderResponse<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { accept: "application/json", ...options.headers },
      signal: controller.signal,
      // Provider inventory is per-user and time-sensitive; a cached list would
      // show surveys the member can no longer enter.
      cache: "no-store",
    });

    if (!response.ok) {
      return { ok: false, reason: `Provider returned ${response.status}.`, status: response.status };
    }

    const text = await response.text();
    if (text.length > MAX_BODY_BYTES) {
      return { ok: false, reason: "Provider response was too large to process." };
    }

    try {
      return { ok: true, data: JSON.parse(text) as T };
    } catch {
      return { ok: false, reason: "Provider response was not valid JSON." };
    }
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return { ok: false, reason: aborted ? "Provider timed out." : "Provider could not be reached." };
  } finally {
    clearTimeout(timer);
  }
}

/** Converts a provider's USD figure to platform minor units. */
export function usdToMinor(usd: number | string | null | undefined, rateMinorPerUsd: number): number {
  const value = typeof usd === "string" ? Number(usd) : (usd ?? 0);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.max(0, Math.round(value * rateMinorPerUsd));
}

/**
 * Postback source check.
 *
 * A signature already proves the payload came from the provider, so this is a
 * second, independent gate rather than the primary one — useful when a secret
 * leaks. Left empty it allows everything, because a half-configured allowlist
 * that silently drops real callbacks costs members money.
 */
export function isAllowedPostbackIp(ip: string | null, allowlist: string): boolean {
  const entries = allowlist
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  if (entries.length === 0) return true;
  if (!ip) return false;
  return entries.includes(ip);
}
