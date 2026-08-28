import { prisma } from "@/lib/prisma";
import { handler, ok, paginate } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";

export const runtime = "nodejs";

export const GET = handler(async (request) => {
  await requireAdmin();
  const params = new URL(request.url).searchParams;
  const { page, size, skip, take } = paginate(params);
  const status = params.get("status");

  const where = status && status !== "ALL" ? { status: status as never } : {};

  const [rows, total, pendingSum] = await Promise.all([
    prisma.withdrawal.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
      include: { user: { select: { fullName: true, email: true, status: true, riskScore: { select: { level: true } } } } },
    }),
    prisma.withdrawal.count({ where }),
    prisma.withdrawal.aggregate({
      where: { status: { in: ["PENDING", "UNDER_REVIEW", "APPROVED", "PROCESSING"] } },
      _sum: { netAmount: true },
    }),
  ]);

  return ok({ rows, page, size, total, inFlight: pendingSum._sum.netAmount ?? 0 });
});
