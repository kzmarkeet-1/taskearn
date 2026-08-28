import "server-only";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import type { Role, User } from "@prisma/client";
import { prisma } from "./prisma";
import { env } from "./env";
import { signSessionToken, verifySessionToken, SESSION_COOKIE } from "./jwt";
import { hashIdentifier, randomToken, sha256 } from "./crypto";
import { Err } from "./errors";

export type SessionUser = Pick<
  User,
  "id" | "fullName" | "email" | "role" | "status" | "referralCode" | "emailVerifiedAt" | "country"
>;

const SELECT = {
  id: true,
  fullName: true,
  email: true,
  role: true,
  status: true,
  referralCode: true,
  emailVerifiedAt: true,
  country: true,
} as const;

/**
 * Issues a session: a random opaque token is stored hashed in the database,
 * and a signed JWT referencing that session row goes into an httpOnly cookie.
 * Revoking the database row invalidates the cookie immediately.
 */
export async function createSession(userId: string, role: Role) {
  const config = env();
  const raw = randomToken(32);
  const expiresAt = new Date(Date.now() + config.AUTH_SESSION_TTL_HOURS * 3600_000);
  const headerList = await headers();

  const session = await prisma.authSession.create({
    data: {
      userId,
      tokenHash: sha256(raw),
      expiresAt,
      userAgent: headerList.get("user-agent")?.slice(0, 255) ?? null,
      ipHash: hashIdentifier(headerList.get("x-forwarded-for")?.split(",")[0]?.trim()),
    },
  });

  const token = await signSessionToken(
    { sub: userId, role, sid: session.id },
    config.AUTH_SESSION_TTL_HOURS,
  );

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });

  return session;
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    const claims = await verifySessionToken(token);
    if (claims?.sid) {
      await prisma.authSession
        .update({ where: { id: claims.sid }, data: { revokedAt: new Date() } })
        .catch(() => undefined);
    }
  }
  store.delete(SESSION_COOKIE);
}

export async function revokeAllSessions(userId: string) {
  await prisma.authSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Returns the signed-in user, or null. Cached per request. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const claims = await verifySessionToken(token);
  if (!claims) return null;

  const session = await prisma.authSession.findUnique({
    where: { id: claims.sid },
    select: { revokedAt: true, expiresAt: true, user: { select: SELECT } },
  });

  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
  if (session.user.status === "BANNED" || session.user.status === "SUSPENDED") return null;

  return session.user;
});

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw Err.unauthorized();
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw Err.forbidden("Administrator access only.");
  return user;
}
