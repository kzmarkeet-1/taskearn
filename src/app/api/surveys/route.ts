import { handler, ok, clientFingerprint } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { listSurveysForUser } from "@/lib/surveys";

export const runtime = "nodejs";

export const GET = handler(async () => {
  const user = await requireUser();
  // Providers match region-locked studies on IP and user agent. They are
  // forwarded to the provider for that request only; the platform stores
  // hashes, never the raw values.
  const fingerprint = await clientFingerprint();

  const result = await listSurveysForUser({
    id: user.id,
    country: user.country,
    ipAddress: fingerprint.ip === "unknown" ? null : fingerprint.ip,
    userAgent: fingerprint.userAgent,
  });

  return ok(result);
});
