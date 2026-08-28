import "server-only";
import type { NotificationType } from "@prisma/client";
import { prisma } from "./prisma";

/**
 * In-app notifications are written immediately. Email delivery is queued by
 * stamping emailQueuedAt; wire a provider in `deliverQueuedEmails` when one is
 * available. Nothing here pretends an email was sent.
 */
export async function notify(args: {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  href?: string;
  email?: boolean;
}) {
  return prisma.notification.create({
    data: {
      userId: args.userId,
      type: args.type,
      title: args.title,
      body: args.body,
      href: args.href,
      emailQueuedAt: args.email ? new Date() : null,
    },
  });
}

export async function notifyMany(userIds: string[], args: Omit<Parameters<typeof notify>[0], "userId">) {
  if (userIds.length === 0) return { count: 0 };
  return prisma.notification.createMany({
    data: userIds.map((userId) => ({
      userId,
      type: args.type,
      title: args.title,
      body: args.body,
      href: args.href,
      emailQueuedAt: args.email ? new Date() : null,
    })),
  });
}

export async function unreadCount(userId: string) {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

/**
 * Placeholder delivery loop. Returns the queue without sending until an email
 * provider is configured, so no message is ever silently dropped.
 */
export async function deliverQueuedEmails() {
  const queued = await prisma.notification.findMany({
    where: { emailQueuedAt: { not: null }, emailSentAt: null },
    take: 100,
    orderBy: { createdAt: "asc" },
  });
  if (!process.env.EMAIL_PROVIDER_API_KEY) {
    return { sent: 0, queued: queued.length, reason: "Email provider is not configured." };
  }
  // Wire the provider SDK here, then stamp emailSentAt for each delivered row.
  return { sent: 0, queued: queued.length, reason: "No email transport implemented." };
}
