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
 * OKX funding account.
 *
 * Credentials: an API key with withdrawal permission, its passphrase, and an
 * IP allowlist (OKX allows five IPs per key).
 *
 * Endpoints used:
 *   POST /api/v5/asset/withdrawal          submit a withdrawal
 *   GET  /api/v5/asset/withdrawal-history  settlement state + tx hash
 *   GET  /api/v5/asset/deposit-history     incoming deposits
 *   GET  /api/v5/asset/currencies          per-chain minimums and fees
 *   GET  /api/v5/asset/balances            funding balance
 *
 * Signing: base64 HMAC-SHA256 over `timestamp + METHOD + requestPath + body`,
 * where timestamp is ISO-8601 with milliseconds. The request path includes the
 * query string, so it has to be built once and reused verbatim for both the
 * signature and the fetch — recomputing it separately is the usual cause of a
 * mysterious 401 here.
 *
 * FEES. OKX requires an explicit `fee` on on-chain withdrawals and rejects the
 * call without one. The correct figure per chain comes from
 * GET /api/v5/asset/currencies, which this adapter reads and caches rather
 * than hardcoding, because chain fees move.
 *
 * TRAVEL RULE. Above jurisdictional thresholds OKX requires `rcvrInfo` with
 * recipient identity. It is sent when a name is available; where OKX demands
 * more than the platform holds, the call fails loudly instead of guessing at
 * someone's legal details.
 */

const BASE = "https://www.okx.com";

const CHAINS: Record<CryptoNetwork, string> = {
  TRC20: "USDT-TRC20",
  ERC20: "USDT-ERC20",
  BEP20: "USDT-BSC",
  POLYGON: "USDT-Polygon",
};

const REVERSE_CHAINS: Record<string, CryptoNetwork> = {
  "USDT-TRC20": "TRC20",
  "USDT-ERC20": "ERC20",
  "USDT-BSC": "BEP20",
  "USDT-Polygon": "POLYGON",
};

type OkxEnvelope<T> = { code: string; msg: string; data: T[] };

let feeCache: { at: number; fees: Record<string, string> } | null = null;

export class OkxExchange implements ExchangeClient {
  readonly id = "okx" as const;
  readonly name = "OKX";

  isConfigured() {
    return Boolean(
      process.env.OKX_API_KEY && process.env.OKX_API_SECRET && process.env.OKX_API_PASSPHRASE,
    );
  }

  networkCode(network: CryptoNetwork) {
    return CHAINS[network] ?? null;
  }

  private async call<T>(
    method: "GET" | "POST",
    requestPath: string,
    body?: unknown,
  ): Promise<{ ok: true; data: T[] } | { ok: false; reason: string; retryable: boolean }> {
    if (!this.isConfigured()) {
      return { ok: false, reason: "OKX credentials are not set.", retryable: false };
    }

    const timestamp = new Date().toISOString();
    const payload = body ? JSON.stringify(body) : "";
    const prehash = `${timestamp}${method}${requestPath}${payload}`;
    const signature = createHmac("sha256", process.env.OKX_API_SECRET ?? "")
      .update(prehash)
      .digest("base64");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);

    try {
      const response = await fetch(`${BASE}${requestPath}`, {
        method,
        headers: {
          "OK-ACCESS-KEY": process.env.OKX_API_KEY ?? "",
          "OK-ACCESS-SIGN": signature,
          "OK-ACCESS-TIMESTAMP": timestamp,
          "OK-ACCESS-PASSPHRASE": process.env.OKX_API_PASSPHRASE ?? "",
          "content-type": "application/json",
        },
        body: payload || undefined,
        signal: controller.signal,
        cache: "no-store",
      });

      const text = await response.text();
      let envelope: OkxEnvelope<T>;
      try {
        envelope = JSON.parse(text) as OkxEnvelope<T>;
      } catch {
        return { ok: false, reason: `OKX returned a non-JSON response (${response.status}).`, retryable: true };
      }

      // OKX signals failure in the body, not the status line: a 200 with
      // code !== "0" is an error and treating it as success would mark a
      // rejected withdrawal as sent.
      if (envelope.code !== "0") {
        const detail = envelope.data?.[0] as { sMsg?: string } | undefined;
        return {
          ok: false,
          reason: `OKX error ${envelope.code}: ${detail?.sMsg ?? envelope.msg ?? "unknown"}`,
          retryable: response.status >= 500 || envelope.code === "50011",
        };
      }

      return { ok: true, data: envelope.data ?? [] };
    } catch (error) {
      const aborted = error instanceof Error && error.name === "AbortError";
      return { ok: false, reason: aborted ? "OKX timed out." : "OKX could not be reached.", retryable: true };
    } finally {
      clearTimeout(timer);
    }
  }

  /** Current on-chain fee per chain, cached for an hour. */
  private async chainFee(chain: string): Promise<string | null> {
    if (feeCache && Date.now() - feeCache.at < 3600_000) return feeCache.fees[chain] ?? null;

    const result = await this.call<{ chain: string; minFee?: string; fee?: string }>(
      "GET",
      `/api/v5/asset/currencies?ccy=${USDT}`,
    );
    if (!result.ok) return null;

    const fees: Record<string, string> = {};
    for (const row of result.data) {
      const fee = row.minFee ?? row.fee;
      if (row.chain && fee) fees[row.chain] = fee;
    }
    feeCache = { at: Date.now(), fees };
    return fees[chain] ?? null;
  }

  async withdraw(request: WithdrawRequest): Promise<WithdrawResult> {
    const chain = this.networkCode(request.network);
    if (!chain) return { ok: false, reason: `${request.network} is not mapped for OKX.`, retryable: false };

    const fee = await this.chainFee(chain);
    if (!fee) {
      return {
        ok: false,
        reason: "OKX did not report a withdrawal fee for that chain, so the amount cannot be quoted.",
        retryable: true,
      };
    }

    const result = await this.call<{ wdId?: string }>("POST", "/api/v5/asset/withdrawal", {
      ccy: USDT,
      amt: request.amount,
      dest: "4", // on-chain
      chain,
      toAddr: request.address,
      fee,
      // OKX deduplicates on clientId, which is what makes a retried dispatch
      // safe. Alphanumeric only, 32 characters.
      clientId: request.withdrawalId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 32),
      ...(request.recipient.name
        ? {
            rcvrInfo: {
              walletType: "private",
              rcvrFirstName: request.recipient.name.split(" ")[0] ?? request.recipient.name,
              rcvrLastName: request.recipient.name.split(" ").slice(1).join(" ") || request.recipient.name,
              rcvrCountry: request.recipient.country ?? "",
            },
          }
        : {}),
    });

    if (!result.ok) return { ok: false, reason: result.reason, retryable: result.retryable };

    const wdId = result.data[0]?.wdId;
    if (!wdId) return { ok: false, reason: "OKX accepted the request but returned no withdrawal id.", retryable: false };
    return { ok: true, providerReference: String(wdId) };
  }

  async listDeposits(since: Date): Promise<ExchangeDeposit[]> {
    const result = await this.call<{
      depId?: string;
      amt: string;
      chain: string;
      txId: string;
      to: string;
      state: string;
      ts: string;
    }>("GET", `/api/v5/asset/deposit-history?ccy=${USDT}&after=${since.getTime()}&limit=100`);

    if (!result.ok) {
      console.warn(`[exchange:okx] deposit poll failed — ${result.reason}`);
      return [];
    }

    return result.data.map((row) => ({
      id: row.depId ? String(row.depId) : `${row.txId}:${row.amt}`,
      amount: row.amt,
      network: REVERSE_CHAINS[row.chain] ?? null,
      txHash: row.txId || null,
      address: row.to || null,
      // state "2" is credited. Anything else is still in flight.
      credited: row.state === "2",
      at: new Date(Number(row.ts)),
    }));
  }

  async getWithdrawalStatus(providerReference: string): Promise<ExchangeWithdrawalStatus | null> {
    const result = await this.call<{ wdId: string; txId?: string; state: string }>(
      "GET",
      `/api/v5/asset/withdrawal-history?ccy=${USDT}&wdId=${encodeURIComponent(providerReference)}`,
    );
    if (!result.ok || result.data.length === 0) return null;

    const row = result.data[0];
    // "2" withdrawal complete, "-3"/"-2"/"-1" cancelled or failed,
    // "0" waiting withdrawal, "1" broadcasting.
    const state =
      row.state === "2"
        ? "COMPLETED"
        : row.state === "1"
          ? "SENT"
          : row.state.startsWith("-")
            ? "FAILED"
            : "PENDING";

    return {
      providerReference,
      state,
      txHash: row.txId ?? null,
      failureReason: state === "FAILED" ? `OKX state ${row.state}` : undefined,
    };
  }

  async availableBalance(): Promise<number | null> {
    const result = await this.call<{ ccy: string; availBal: string }>(
      "GET",
      `/api/v5/asset/balances?ccy=${USDT}`,
    );
    if (!result.ok) return null;
    const row = result.data.find((entry) => entry.ccy === USDT);
    return row ? Number(row.availBal) : 0;
  }
}
