import { handler, ok, parseBody, guard, assertSameOrigin } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { completeTaskSession } from "@/lib/tasks";
import { completeTaskSchema } from "@/lib/validation";

export const runtime = "nodejs";

export const POST = handler(async (request) => {
  await assertSameOrigin(request);
  const user = await requireUser();
  await guard("taskComplete", user.id);

  const body = await parseBody(request, completeTaskSchema);

  const result = await completeTaskSession({
    userId: user.id,
    sessionId: body.sessionId,
    nonce: body.nonce,
    reportedSeconds: body.watchedSeconds,
  });

  return ok(result);
});
