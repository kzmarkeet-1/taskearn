import "server-only";
import { z } from "zod";

/**
 * Server-only environment access. Importing this from a client component
 * will fail the build, which is intentional — keys never reach the browser.
 */
const serverEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  AUTH_SECRET: z.string().min(16, "AUTH_SECRET must be at least 16 characters"),
  AUTH_COOKIE_NAME: z.string().default("taskearn_session"),
  AUTH_SESSION_TTL_HOURS: z.coerce.number().int().positive().default(168),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),

  // --- Survey providers ------------------------------------------------
  // CPX_API_KEY is the "secure hash" from publisher.cpx-research.com; it signs
  // both outbound API calls and inbound postbacks, so CPX_WEBHOOK_SECRET is
  // optional and falls back to it.
  CPX_API_KEY: z.string().optional().default(""),
  CPX_APP_ID: z.string().optional().default(""),
  CPX_WEBHOOK_SECRET: z.string().optional().default(""),

  POLLFISH_API_KEY: z.string().optional().default(""),
  POLLFISH_WEBHOOK_SECRET: z.string().optional().default(""),
  /**
   * Ordered, comma-separated list of the postback parameters Pollfish signs.
   * Pollfish signs the substituted *values* in the order they appear in the
   * URL you configured on its dashboard, so this must match that URL exactly.
   */
  POLLFISH_SIGNED_PARAMS: z.string().optional().default("tx_id,click_id,cpa,timestamp"),

  BITLABS_API_KEY: z.string().optional().default(""),
  BITLABS_WEBHOOK_SECRET: z.string().optional().default(""),

  /** Comma-separated CIDR-less IPs allowed to deliver postbacks. Blank = any. */
  SURVEY_POSTBACK_IP_ALLOWLIST: z.string().optional().default(""),

  /**
   * Minor units of the platform currency per 1 USD. Providers quote publisher
   * revenue in USD; the ledger is in paisa. 28000 = PKR 280.00 per USD.
   * Review it on the same schedule you review payout rates.
   */
  USD_RATE_MINOR: z.coerce.number().int().positive().default(28_000),

  // --- Payouts ---------------------------------------------------------
  JAZZCASH_API_KEY: z.string().optional().default(""),
  JAZZCASH_MERCHANT_ID: z.string().optional().default(""),
  EASYPAISA_API_KEY: z.string().optional().default(""),
  EASYPAISA_MERCHANT_ID: z.string().optional().default(""),

  // --- Crypto gateway (USDT) -------------------------------------------
  // A custodial gateway is assumed: it issues deposit addresses, watches the
  // chain, and calls back. The platform holds no keys and never signs
  // transactions itself.
  CRYPTO_GATEWAY_API_KEY: z.string().optional().default(""),
  CRYPTO_GATEWAY_API_URL: z.string().optional().default(""),
  CRYPTO_GATEWAY_WEBHOOK_SECRET: z.string().optional().default(""),
  /** Chains this deployment accepts, comma-separated: TRC20,ERC20,BEP20,POLYGON */
  CRYPTO_NETWORKS: z.string().optional().default("TRC20"),
  /** Confirmations required before a deposit is treated as final. */
  CRYPTO_MIN_CONFIRMATIONS: z.coerce.number().int().min(1).default(19),
  /** Minor units of the platform currency per 1 USDT. 28000 = PKR 280.00. */
  CRYPTO_USDT_RATE_MINOR: z.coerce.number().int().positive().default(28_000),

  // --- Exchange rails (OKX / Binance) ----------------------------------
  // An alternative to the hosted gateway above: pay out directly from an
  // exchange account. Read the warnings in src/lib/payments/exchanges/types.ts
  // before enabling — a withdrawal-enabled API key is the whole account.
  CRYPTO_EXCHANGE: z.enum(["", "binance", "okx"]).optional().default(""),

  /**
   * The exchange's own USDT deposit address, one per deployment.
   *
   * Copy it from the exchange rather than fetching it: a wrong address here
   * sends every member's payment somewhere unrecoverable, and that is a value
   * a human should paste in deliberately and check twice.
   */
  CRYPTO_DEPOSIT_ADDRESS: z.string().optional().default(""),

  BINANCE_API_KEY: z.string().optional().default(""),
  BINANCE_API_SECRET: z.string().optional().default(""),

  OKX_API_KEY: z.string().optional().default(""),
  OKX_API_SECRET: z.string().optional().default(""),
  OKX_API_PASSPHRASE: z.string().optional().default(""),

  /**
   * Hard ceiling on how many payouts one scheduled run may send.
   *
   * This is the blast radius of any bug in the dispatch loop. Keep it low
   * enough that a bad run is an inconvenience rather than an emptied float.
   */
  CRYPTO_MAX_PAYOUTS_PER_RUN: z.coerce.number().int().positive().max(200).default(20),

  // --- Stripe -----------------------------------------------------------
  STRIPE_SECRET_KEY: z.string().optional().default(""),
  STRIPE_WEBHOOK_SECRET: z.string().optional().default(""),
  /** Required for Stripe payouts (Connect transfers), not for checkout. */
  // Not z.coerce.boolean(): Boolean("false") is true, so the string "false"
  // would silently enable payouts. Only the literal "true" turns this on.
  STRIPE_PAYOUT_ENABLED: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),

  // Shared secret for the scheduled maintenance endpoint. Unset disables it.
  CRON_SECRET: z.string().optional().default(""),

  EMAIL_FROM: z.string().optional().default("no-reply@taskearn.example"),
  EMAIL_PROVIDER_API_KEY: z.string().optional().default(""),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | null = null;

export function env(): ServerEnv {
  if (cached) return cached;
  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration — ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export function isConfigured(...keys: (keyof ServerEnv)[]): boolean {
  const e = env();
  return keys.every((k) => typeof e[k] === "string" && (e[k] as string).length > 0);
}
