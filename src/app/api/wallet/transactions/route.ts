import { prisma } from "@/lib/prisma";
import { handler, ok, paginate } from "@/lib/api";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";

export const GET = handler(async (request) => {
  const user = await requireUser();
  const url = new URL(request.url);
  const { page, size, skip, take } = paginate(url.searchParams);
  const type = url.searchParams.get("type");

  const where = {
    userId: user.id,
    ...(type && type !== "ALL" ? { type: type as never } : {}),
  };

  const [rows, total] = await Promise.all([
    prisma.walletTransaction.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
    prisma.walletTransaction.count({ where }),
  ]);

  return ok({ rows, page, size, total, pages: Math.ceil(total / size) });
});
