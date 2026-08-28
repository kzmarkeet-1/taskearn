import "server-only";
import { headers } from "next/headers";
import { prisma } from "./prisma";
import { hashIdentifier } from "./crypto";
import type { Prisma } from "@prisma/client";

/** Records an administrative or security-relevant action. Audit rows are append-only. */
export async function audit(entry: {
  actorId?: string | null;
  actorEmail?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
}) {
  let ipHash: string | null = null;
  try {
    const headerList = await headers();
    ipHash = hashIdentifier(headerList.get("x-forwarded-for")?.split(",")[0]?.trim());
  } catch {
    ipHash = null;
  }

  return prisma.auditLog.create({
    data: {
      actorId: entry.actorId ?? undefined,
      actorEmail: entry.actorEmail ?? undefined,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? undefined,
      before: entry.before,
      after: entry.after,
      ipHash,
    },
  });
}
