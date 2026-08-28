import { handler, ok, guard, clientFingerprint, assertSameOrigin } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { startTaskSession } from "@/lib/tasks";

export const runtime = "nodejs";

export const POST = handler(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  await assertSameOrigin(request);
  const user = await requireUser();
  await guard("taskStart", user.id);

  const { id } = await context.params;
  const fingerprint = await clientFingerprint();

  const { session, campaign, resumed } = await startTaskSession({
    userId: user.id,
    country: user.country,
    campaignId: id,
    ipHash: fingerprint.ipHash,
    userAgentHash: fingerprint.userAgentHash,
  });

  return ok({
    sessionId: session.id,
    nonce: session.nonce,
    startedAt: session.startedAt,
    requiredSeconds: session.requiredSeconds,
    expiresAt: session.expiresAt,
    resumed,
    campaign: {
      id: campaign.id,
      name: campaign.name,
      advertiser: campaign.advertiser,
      description: campaign.description,
      videoUrl: campaign.videoUrl,
      rewardAmount: campaign.rewardAmount,
    },
  });
});
