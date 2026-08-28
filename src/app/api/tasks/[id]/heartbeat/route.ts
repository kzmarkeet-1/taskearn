import { handler, ok, parseBody, assertSameOrigin } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { recordHeartbeat } from "@/lib/tasks";
import { heartbeatSchema } from "@/lib/validation";

export const runtime = "nodejs";

/**
 * Called by the open task page.
 *
 * Carries two things: proof that a real page is still there, and the page's
 * report of how much of the last interval it was actually visible and focused.
 * The report is clamped server-side against the time that genuinely passed, so
 * it can lose the member credit but never manufacture it.
 */
export const POST = handler(async (request) => {
  await assertSameOrigin(request);
  const user = await requireUser();
  const body = await parseBody(request, heartbeatSchema);

  const session = await recordHeartbeat({
    sessionId: body.sessionId,
    userId: user.id,
    nonce: body.nonce,
    report: body.report,
  });

  const elapsed = Math.floor((Date.now() - session.startedAt.getTime()) / 1000);

  return ok({
    elapsedSeconds: elapsed,
    requiredSeconds: session.requiredSeconds,
    remainingSeconds: Math.max(0, session.requiredSeconds - elapsed),
    // Echoed back so the page can show the member what actually counted,
    // rather than letting them discover it only when a submission is refused.
    activeSeconds: session.activeSeconds,
    hiddenSeconds: session.hiddenSeconds,
  });
});
