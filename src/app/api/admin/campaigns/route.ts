import { prisma } from "@/lib/prisma";
import { handler, ok, parseBody, paginate, assertSameOrigin } from "@/lib/api";
import { requireAdmin } from "@/lib/auth";
import { campaignSchema } from "@/lib/validation";
import { audit } from "@/lib/audit";
import { Err } from "@/lib/errors";

export const runtime = "nodejs";

export const GET = handler(async (request) => {
  await requireAdmin();
  const params = new URL(request.url).searchParams;
  const { page, size, skip, take } = paginate(params);
  const status = params.get("status");

  const where = status && status !== "ALL" ? { status: status as never } : {};

  const [rows, total] = await Promise.all([
    prisma.campaign.findMany({ where, orderBy: { createdAt: "desc" }, skip, take }),
    prisma.campaign.count({ where }),
  ]);

  return ok({ rows, page, size, total });
});

export const POST = handler(async (request) => {
  await assertSameOrigin(request);
  const admin = await requireAdmin();
  const body = await parseBody(request, campaignSchema);

  if (body.endDate <= body.startDate) throw Err.invalid("The end date must come after the start date.");
  if (body.totalBudget < body.rewardAmount) {
    throw Err.invalid("The budget must cover at least one reward.");
  }
  if (body.dailyQuota > body.totalQuota) {
    throw Err.invalid("The daily quota cannot exceed the total quota.");
  }
  const affordable = Math.floor(body.totalBudget / body.rewardAmount);
  if (body.totalQuota > affordable) {
    throw Err.invalid(`This budget covers ${affordable} completions. Lower the total quota or raise the budget.`);
  }

  const campaign = await prisma.campaign.create({
    data: {
      name: body.name,
      advertiser: body.advertiser,
      description: body.description,
      videoUrl: body.videoUrl,
      thumbnailUrl: body.thumbnailUrl || null,
      rewardAmount: body.rewardAmount,
      requiredWatchSeconds: body.requiredWatchSeconds,
      totalBudget: body.totalBudget,
      dailyQuota: body.dailyQuota,
      totalQuota: body.totalQuota,
      targetCountries: body.targetCountries,
      startDate: body.startDate,
      endDate: body.endDate,
      status: body.status,
    },
  });

  await audit({
    actorId: admin.id,
    actorEmail: admin.email,
    action: "admin.campaign.create",
    entityType: "Campaign",
    entityId: campaign.id,
    after: { name: campaign.name, rewardAmount: campaign.rewardAmount, totalBudget: campaign.totalBudget },
  });

  return ok(campaign, { status: 201 });
});
