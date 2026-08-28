import { handler, ok, assertSameOrigin } from "@/lib/api";
import { destroySession } from "@/lib/auth";

export const runtime = "nodejs";

export const POST = handler(async (request) => {
  // Without this a third-party page could sign the person out unprompted.
  await assertSameOrigin(request);
  await destroySession();
  return ok({ signedOut: true });
});
