import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";

export const prisma = new PrismaClient();

export async function createTestUser(overrides: { country?: string } = {}) {
  const id = randomUUID().slice(0, 8);
  return prisma.user.create({
    data: {
      fullName: `Test User ${id}`,
      email: `test-${id}@example.test`,
      phone: `+9230000${id.slice(0, 5)}`,
      country: overrides.country ?? "Pakistan",
      passwordHash: await bcrypt.hash("TestPass123", 4),
      referralCode: `T${id.toUpperCase()}`,
      emailVerifiedAt: new Date(),
      wallet: { create: {} },
      riskScore: { create: {} },
    },
    include: { wallet: true },
  });
}

export async function cleanupUser(userId: string) {
  await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
}
