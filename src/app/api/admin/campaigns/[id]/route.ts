import { prisma } from "@/lib/prisma";
import { handler, ok, parseBody, assertSameOrigin } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { campaignUpdateSchema } from "@/lib/validation";
import { audit } from "@/lib/audit";
import { Err } from "@/lib/errors";

export const runtime = "nodejs";

export const GET = handler(async (_request: Request, context: { params: Promise<{ id: string }> }) => {
  await requireAdmin();
  const { id } = await context.params;
  const campaign = await prisma.campaign.findUnique({
    where: { id },
    include: { _count: { select: { completions: true, sessions: true } } },
  });
  if (!campaign) throw Err.notFound("That campaign does not exist.");
  return ok(campaign);
});

export const PATCH = handler(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  await assertSameOrigin(request);
  const admin = await requireAdmin();
  const { id } = await context.params;
  const body = await parseBody(request, campaignUpdateSchema);

  const before = await prisma.campaign.findUnique({ where: { id } });
  if (!before) throw Err.notFound("That campaign does not exist.");

  // Reducing a live campaign's budget below what it has already spent would
  // break the accounting, so it is refused rather than silently clamped.
  if (body.totalBudget !== undefined && body.totalBudget < before.spentBudget) {
    throw Err.invalid(`This campaign has already spent more than that. The floor is ${before.spentBudget} minor units.`);
  }

  const campaign = await prisma.campaign.update({
    where: { id },
    data: {
      ...body,
      thumbnailUrl: body.thumbnailUrl === "" ? null : body.thumbnailUrl,
    },
  });

  await audit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "admin.campaign.update",
    entityType: "Campaign",
    entityId: id,
    before: { status: before.status, totalBudget: before.totalBudget, rewardAmount: before.rewardAmount },
    after: { status: campaign.status, totalBudget: campaign.totalBudget, rewardAmount: campaign.rewardAmount },
  });

  return ok(campaign);
});
