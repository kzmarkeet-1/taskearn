import { createHash, randomBytes, timingSafeEqual, createHmac } from "node:crypto";

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** IP and user-agent are stored hashed so raw identifiers are not retained. */
export function hashIdentifier(value: string | null | undefined): string | null {
  if (!value) return null;
  return sha256(`${value}:${process.env.AUTH_SECRET ?? "taskearn"}`);
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function randomReference(prefix: string): string {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${randomBytes(3)
    .toString("hex")
    .toUpperCase()}`;
}

export function generateReferralCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  const buf = randomBytes(8);
  for (let i = 0; i < 8; i++) out += alphabet[buf[i] % alphabet.length];
  return out;
}

export function hmacSha256Hex(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * MD5, present only because CPX Research signs with it and the scheme is not
 * ours to choose. Never use it for anything this codebase controls.
 */
export function md5Hex(payload: string): string {
  return createHash("md5").update(payload).digest("hex");
}

/** BitLabs signs callbacks with a hex HMAC-SHA1 over the whole URL. */
export function hmacSha1Hex(secret: string, payload: string): string {
  return createHmac("sha1", secret).update(payload).digest("hex");
}

/** Pollfish signs the concatenated parameter values, base64-encoded. */
export function hmacSha1Base64(secret: string, payload: string): string {
  return createHmac("sha1", secret).update(payload).digest("base64");
}

export function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
