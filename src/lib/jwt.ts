import { SignJWT, jwtVerify, type JWTPayload } from "jose";

/**
 * Edge-compatible token helpers. Used by middleware (edge runtime) and by
 * server routes (node runtime), so this module must not import node:crypto
 * or the Prisma client.
 */

export type SessionClaims = JWTPayload & {
  sub: string;
  role: "USER" | "ADMIN";
  sid: string;
};

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("AUTH_SECRET is missing or too short.");
  }
  return new TextEncoder().encode(secret);
}

export async function signSessionToken(
  claims: Omit<SessionClaims, "iat" | "exp">,
  ttlHours: number,
): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setIssuer("taskearn")
    .setAudience("taskearn-app")
    .setExpirationTime(`${ttlHours}h`)
    .sign(secretKey());
}

export async function verifySessionToken(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: "taskearn",
      audience: "taskearn-app",
    });
    if (typeof payload.sub !== "string" || typeof payload.sid !== "string") return null;
    return payload as SessionClaims;
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = process.env.AUTH_COOKIE_NAME || "taskearn_session";
