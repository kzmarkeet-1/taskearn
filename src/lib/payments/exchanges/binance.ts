import "server-only";
import { createHmac } from "node:crypto";
import type { CryptoNetwork } from "@prisma/client";
import type {
  ExchangeClient,
  ExchangeDeposit,
  ExchangeWithdrawalStatus,
  WithdrawRequest,
  WithdrawResult,
} from "./types";
import { USDT } from "./types";

/**
 * Binance spot wallet.
 *
 * Credentials: an API key with "Enable Withdrawals" turned on, restricted to
 * your server's IP. Binance refuses withdrawal calls from a key without an IP
 * allowlist, which is the one piece of friction here worth being grateful for.
 *
 * Endpoints used:
 *   POST /sapi/v1/capital/withdraw/apply   submit a withdrawal
 *   GET  /sapi/v1/capital/withdraw/history settlement state + tx hash
 *   GET  /sapi/v1/capital/deposit/hisrec   incoming deposits
 *   GET  /sapi/v1/capital/config/getall    per-network minimums and fees
 *   GET  /sapi/v1/account                  (via /sapi/v3/asset/getUserAsset) balance
 *
 * Signing: every private call is a query string ending in `timestamp`, signed
 * with HMAC-SHA256 of that exact string. The signature must be appended last
 * and the string must not be re-ordered afterwards, which is why the query is
 * built once as text rather than reassembled from an object.
 *
 * TRAVEL RULE. Binance is migrating withdrawals in regulated jurisdictions to
 * POST /sapi/v1/localentity/withdraw/apply, which requires recipient identity
 * fields. Check GET /sapi/v1/localentity/questionnaire-requirements for your
 * entity: if it returns anything other than NIL, the call below will be
 * rejected and you must switch endpoints. This adapter does not guess which
 * regime you are under — it surfaces the error rather than silently failing.
 */

const BASE = "https://api.binance.com";

/** Binance network codes for USDT. Sending on the wrong one is unrecoverable. */
const NETWORKS: Record<CryptoNetwork, string> = {
  TRC20: "TRX",
  ERC20: "ETH",
  BEP20: "BSC",
  POLYGON: "MATIC",
};

const REVERSE_NETWORKS: Record<string, CryptoNetwork> = {
  TRX: "TRC20",
  ETH: "ERC20",
  BSC: "BEP20",
  MATIC: "POLYGON",
  POL: "POLYGON",
};

type BinanceError = { code?: number; msg?: string };

export class BinanceExchange implements ExchangeClient {
  readonly id = "binance" as const;
  readonly name = "Binance";

  isConfigured() {
    return Boolean(process.env.BINANCE_API_KEY && process.env.BINANCE_API_SECRET);
  }

  networkCode(network: CryptoNetwork) {
    return NETWORKS[network] ?? null;
  }

  private sign(query: string) {
    return createHmac("sha256", process.env.BINANCE_API_SECRET ?? "").update(query).digest("hex");
  }

  private async call<T>(
    path: string,
    params: Record<string, string>,
    method: "GET" | "POST" = "GET",
  ): Promise<{ ok: true; data: T } | { ok: false; reason: string; retryable: boolean }> {
    if (!this.isConfigured()) {
      return { ok: false, reason: "Binance credentials are not set.", retryable: false };
    }

    const query = new URLSearchParams({ ...params, timestamp: String(Date.now()), recvWindow: "10000" }).toString();
    const signed = `${query}&signature=${this.sign(query)}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);

    try {
      const response = await fetch(`${BASE}${path}${method === "GET" ? `?${signed}` : ""}`, {
        method,
        headers: {
          "X-MBX-APIKEY": process.env.BINANCE_API_KEY ?? "",
          ...(method === "POST" ? { "content-type": "application/x-www-form-urlencoded" } : {}),
        },
        body: method === "POST" ? signed : undefined,
        signal: controller.signal,
        cache: "no-store",
      });

      const text = await response.text();
      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        return { ok: false, reason: `Binance returned a non-JSON response (${response.status}).`, retryable: true };
      }

      if (!response.ok) {
        const err = payload as BinanceError;
        // 5xx and rate limits are worth retrying. A rejected withdrawal —
        // bad address, insufficient balance, unwhitelisted IP — is not, and
        // retrying it just burns the rate limit and hides the real problem.
        const retryable = response.status >= 500 || response.status === 429;
        return {
          ok: false,
          reason: `Binance error ${err.code ?? response.status}: ${err.msg ?? "unknown"}`,
          retryable,
        };
      }

      return { ok: true, data: payload as T };
    } catch (error) {
      const aborted = error instanceof Error && error.name === "AbortError";
      return { ok: false, reason: aborted ? "Binance timed out." : "Binance could not be reached.", retryable: true };
    } finally {
      clearTimeout(timer);
    }
  }

  async withdraw(request: WithdrawRequest): Promise<WithdrawResult> {
    const network = this.networkCode(request.network);
    if (!network) return { ok: false, reason: `${request.network} is not mapped for Binance.`, retryable: false };

    const result = await this.call<{ id?: string }>(
      "/sapi/v1/capital/withdraw/apply",
      {
        coin: USDT,
        network,
        address: request.address,
        amount: request.amount,
        // Binance deduplicates on withdrawOrderId. This is what stops a retried
        // dispatch from sending the money a second time — the single failure
        // mode in this whole file that cannot be undone.
        withdrawOrderId: request.withdrawalId.replace(/-/g, "").slice(0, 32),
      },
      "POST",
    );

    if (!result.ok) return { ok: false, reason: result.reason, retryable: result.retryable };
    if (!result.data.id) {
      return { ok: false, reason: "Binance accepted the request but returned no withdrawal id.", retryable: false };
    }
    return { ok: true, providerReference: result.data.id };
  }

  async listDeposits(since: Date): Promise<ExchangeDeposit[]> {
    const result = await this.call<
      { amount: string; coin: string; network: string; txId: string; address: string; insertTime: number; status: number; id?: string }[]
    >("/sapi/v1/capital/deposit/hisrec", {
      coin: USDT,
      startTime: String(since.getTime()),
      limit: "500",
    });

    if (!result.ok) {
      console.warn(`[exchange:binance] deposit poll failed — ${result.reason}`);
      return [];
    }

    return result.data.map((row) => ({
      // txId is the honest anchor; Binance's own id is not always present.
      id: row.id ? String(row.id) : `${row.txId}:${row.amount}`,
      amount: row.amount,
      network: REVERSE_NETWORKS[row.network] ?? null,
      txHash: row.txId || null,
      address: row.address || null,
      // 1 = success. 6 means credited but not yet withdrawable, which is still
      // money that arrived, so it counts for paying a membership.
      credited: row.status === 1 || row.status === 6,
      at: new Date(row.insertTime),
    }));
  }

  async getWithdrawalStatus(providerReference: string): Promise<ExchangeWithdrawalStatus | null> {
    const result = await this.call<{ id: string; txId?: string; status: number; info?: string }[]>(
      "/sapi/v1/capital/withdraw/history",
      { coin: USDT, limit: "500" },
    );
    if (!result.ok) return null;

    const row = result.data.find((entry) => String(entry.id) === providerReference);
    if (!row) return null;

    // 0 email sent, 2 awaiting approval, 4 processing, 6 completed,
    // 1 cancelled, 3 rejected, 5 failed.
    const state =
      row.status === 6
        ? "COMPLETED"
        : row.status === 4
          ? "SENT"
          : row.status === 1 || row.status === 3 || row.status === 5
            ? "FAILED"
            : "PENDING";

    return {
      providerReference,
      state,
      txHash: row.txId ?? null,
      failureReason: state === "FAILED" ? (row.info ?? `Binance status ${row.status}`) : undefined,
    };
  }

  async availableBalance(): Promise<number | null> {
    const result = await this.call<{ asset: string; free: string }[]>(
      "/sapi/v3/asset/getUserAsset",
      { asset: USDT },
      "POST",
    );
    if (!result.ok) return null;
    const row = result.data.find((entry) => entry.asset === USDT);
    return row ? Number(row.free) : 0;
  }
}
