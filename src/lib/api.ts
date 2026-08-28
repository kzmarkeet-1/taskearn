import "server-only";
import { NextResponse } from "next/server";
import { ZodError, type ZodTypeAny, type output as ZodOutput } from "zod";
import { AppError, Err } from "./errors";
import { headers } from "next/headers";
import { hashIdentifier } from "./crypto";
import { rateLimit, type LIMITS } from "./rate-limit";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ ok: true, data }, init);
}

export function fail(error: unknown) {
  if (error instanceof AppError) {
    return NextResponse.json(
      { ok: false, error: { message: error.message, code: error.code, details: error.details } },
      { status: error.status },
    );
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          message: "Check the highlighted fields and try again.",
          code: "VALIDATION_ERROR",
          details: error.flatten().fieldErrors,
        },
      },
      { status: 422 },
    );
  }
  console.error("[api]", error);
  return NextResponse.json(
    { ok: false, error: { message: "Something went wrong on our side.", code: "SERVER_ERROR" } },
    { status: 500 },
  );
}

/** Wraps a route handler so thrown AppErrors and Zod errors become clean responses. */
export function handler<Args extends unknown[]>(
  fn: (request: Request, ...args: Args) => Promise<Response>,
) {
  return async (request: Request, ...args: Args) => {
    try {
      return await fn(request, ...args);
    } catch (error) {
      return fail(error);
    }
  };
}

export async function parseBody<S extends ZodTypeAny>(
  request: Request,
  schema: S,
): Promise<ZodOutput<S>> {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    throw Err.invalid("The request body must be valid JSON.");
  }
  return schema.parse(json);
}

export async function clientFingerprint() {
  const headerList = await headers();
  const ip = headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  return {
    ip,
    ipHash: hashIdentifier(ip),
    userAgent: headerList.get("user-agent") ?? null,
    userAgentHash: hashIdentifier(headerList.get("user-agent")),
  };
}

export async function guard(bucket: keyof typeof LIMITS, identifier: string) {
  const result = await rateLimit(bucket, identifier);
  if (!result.ok) {
    throw Err.rateLimited(
      `Too many attempts. Try again after ${new Date(result.resetAt).toLocaleTimeString("en-PK")}.`,
    );
  }
  return result;
}

/**
 * Rejects cross-site form posts. Next.js server actions carry their own
 * protection; this covers the JSON API routes.
 */
/** Normalises a URL or origin string down to `scheme://host[:port]`, or null. */
function toOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * Rejects state-changing requests that did not come from this site.
 *
 * Origins are compared exactly. Prefix matching would be a hole rather than a
 * check: `https://example.com.attacker.test` starts with `https://example.com`,
 * so a `startsWith` comparison would wave it straight through.
 */
export async function assertSameOrigin(request: Request) {
  // Browsers set this on every cross-site request and it cannot be forged by
  // page script, so it is the strongest signal available when present.
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    throw Err.forbidden("This request came from an unrecognised origin.");
  }

  const origin = toOrigin(request.headers.get("origin"));
  if (!origin) return; // same-origin navigations and server-to-server calls

  const host = request.headers.get("host");
  const allowed = new Set(
    [
      toOrigin(process.env.NEXT_PUBLIC_APP_URL),
      host ? toOrigin(`https://${host}`) : null,
      // Only trust the plain-http form of the Host header in development;
      // in production an attacker-supplied Host must not open a hole.
      host && process.env.NODE_ENV !== "production" ? toOrigin(`http://${host}`) : null,
    ].filter(Boolean) as string[],
  );

  if (!allowed.has(origin)) {
    throw Err.forbidden("This request came from an unrecognised origin.");
  }
}

export function paginate(searchParams: URLSearchParams, defaultSize = 20) {
  const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);
  const size = Math.min(100, Math.max(1, Number(searchParams.get("size") ?? defaultSize) || defaultSize));
  return { page, size, skip: (page - 1) * size, take: size };
}
