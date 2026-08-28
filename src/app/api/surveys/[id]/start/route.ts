import { handler, ok, guard, clientFingerprint, assertSameOrigin } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { startSurvey } from "@/lib/surveys";
import { AppError } from "@/lib/errors";

export const runtime = "nodejs";

export const POST = handler(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  await assertSameOrigin(request);
  const user = await requireUser();
  await guard("surveyStart", user.id);

  const { id } = await context.params;
  const fingerprint = await clientFingerprint();

  const result = await startSurvey(
    {
      id: user.id,
      country: user.country,
      ipAddress: fingerprint.ip === "unknown" ? null : fingerprint.ip,
      userAgent: fingerprint.userAgent,
    },
    id,
  );

  if (!result.ok) throw new AppError(result.reason, 409, "SURVEY_UNAVAILABLE");

  return ok({ redirectUrl: result.redirectUrl });
});
