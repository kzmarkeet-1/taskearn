/**
 * Fixed-window rate limiter.
 *
 * The in-memory store below is process-local and exists so the limiter is
 * usable in development and single-instance deployments. Swap `store` for a
 * Redis-backed implementation of `RateLimitStore` before running more than
 * one instance — nothing else needs to change.
 */

export type RateLimitResult = { ok: boolean; remaining: number; resetAt: number };

export interface RateLimitStore {
  increment(key: string, windowMs: number): Promise<{ count: number; resetAt: number }>;
}

class MemoryStore implements RateLimitStore {
  private buckets = new Map<string, { count: number; resetAt: number }>();

  async increment(key: string, windowMs: number) {
    const now = Date.now();
    const existing = this.buckets.get(key);
    if (!existing || existing.resetAt <= now) {
      const fresh = { count: 1, resetAt: now + windowMs };
      this.buckets.set(key, fresh);
      if (this.buckets.size > 10_000) this.sweep(now);
      return fresh;
    }
    existing.count += 1;
    return existing;
  }

  private sweep(now: number) {
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }
}

const globalForLimiter = globalThis as unknown as { rateLimitStore?: RateLimitStore };
const store: RateLimitStore = globalForLimiter.rateLimitStore ?? new MemoryStore();
globalForLimiter.rateLimitStore = store;

export const LIMITS = {
  login: { limit: 8, windowMs: 10 * 60_000 },
  register: { limit: 5, windowMs: 60 * 60_000 },
  passwordReset: { limit: 5, windowMs: 60 * 60_000 },
  taskStart: { limit: 40, windowMs: 60 * 60_000 },
  taskComplete: { limit: 40, windowMs: 60 * 60_000 },
  withdrawal: { limit: 5, windowMs: 60 * 60_000 },
  surveyStart: { limit: 30, windowMs: 60 * 60_000 },
  // Deliberately tight: each attempt can create a gateway payment, and a member
  // with three open addresses is a member about to pay the same fee three times.
  tierPurchase: { limit: 6, windowMs: 60 * 60_000 },
  support: { limit: 10, windowMs: 60 * 60_000 },
  api: { limit: 120, windowMs: 60_000 },
} as const;

export async function rateLimit(
  bucket: keyof typeof LIMITS,
  identifier: string,
): Promise<RateLimitResult> {
  const { limit, windowMs } = LIMITS[bucket];
  const { count, resetAt } = await store.increment(`${bucket}:${identifier}`, windowMs);
  return { ok: count <= limit, remaining: Math.max(0, limit - count), resetAt };
}
