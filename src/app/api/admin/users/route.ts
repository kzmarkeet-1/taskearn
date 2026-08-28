import { prisma } from "@/lib/prisma";
import { handler, ok, paginate } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import type { Prisma } from "@prisma/client";

export const runtime = "nodejs";

export const GET = handler(async (request) => {
  await requireAdmin();
  const params = new URL(request.url).searchParams;
  const { page, size, skip, take } = paginate(params);
  const query = params.get("q")?.trim();
  const status = params.get("status");

  const where: Prisma.UserWhereInput = {
    ...(status && status !== "ALL" ? { status: status as never } : {}),
    ...(query
      ? {
          OR: [
            { email: { contains: query, mode: "insensitive" } },
            { fullName: { contains: query, mode: "insensitive" } },
            { phone: { contains: query } },
            { referralCode: { contains: query.toUpperCase() } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        country: true,
        status: true,
        role: true,
        createdAt: true,
        emailVerifiedAt: true,
        wallet: { select: { availableBalance: true, pendingBalance: true } },
        riskScore: { select: { score: true, level: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);

  return ok({ rows, page, size, total, pages: Math.ceil(total / size) });
});
