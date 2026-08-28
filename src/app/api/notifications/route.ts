import { prisma } from "@/lib/prisma";
import { handler, ok, paginate, assertSameOrigin } from "@/lib/api";
import { requireUser } from "@/lib/auth";

export const runtime = "nodejs";

export const GET = handler(async (request) => {
  const user = await requireUser();
  const { skip, take, page, size } = paginate(new URL(request.url).searchParams, 30);

  const [rows, unread] = await Promise.all([
    prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, skip, take }),
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);

  return ok({ rows, unread, page, size });
});

/** Marks everything read. */
export const PATCH = handler(async (request) => {
  await assertSameOrigin(request);
  const user = await requireUser();
  const result = await prisma.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  return ok({ updated: result.count });
});
