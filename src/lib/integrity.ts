import "server-only";
import { prisma } from "./prisma";
import { Err } from "./errors";
import { recordFraudEvent } from "./fraud";
import { evaluateIntegrity, type HeartbeatReport, type IntegrityVerdict } from "./integrity-rules";

/**
 * Anti-cheat: window and tab tracking for video task sessions.
 *
 * The shape of the problem: a member is paid for attention. A script, a
 * background tab, or a phone in a pocket can all keep a session "open" without
 * anyone watching. Wall-clock elapsed time alone cannot tell those apart from a
 * real viewing, because it counts the same either way.
 *
 * What this module does about it. The open page reports, at each heartbeat, how
 * much of the interval it was visible and focused, and how many times focus or
 * visibility changed. That report is *evidence, not accounting*: every delta is
 * clamped to the real time that passed on the server clock since the previous
 * heartbeat, so the arithmetic below cannot be inflated no matter what the
 * browser sends. A tampered client can under-report and lose itself credit; it
 * cannot over-report and gain any.
 *
 * What this module deliberately does not do: no device fingerprinting, no
 * keystroke or mouse capture, no screen recording, no reading of other tabs. It
 * can see only whether *its own page* was frontmost, which is what the
 * Page Visibility and focus APIs expose to any web page. Anything beyond that
 * would need to be disclosed in the privacy policy before it is written.
 */

export {
  INTEGRITY_RULES,
  evaluateIntegrity,
  explainRejection,
  type HeartbeatReport,
  type IntegrityVerdict,
} from "./integrity-rules";

/**
 * Folds one heartbeat report into a session.
 *
 * The clamp is the whole security argument. `elapsedSinceLast` is measured from
 * the server's own record of the previous beat, and the reported active and
 * hidden milliseconds are scaled down to fit inside it if their sum exceeds it.
 * A client that claims sixty seconds of attention in a five-second interval
 * gets five seconds credited, not sixty.
 */
export async function recordTrackedHeartbeat(args: {
  sessionId: string;
  userId: string;
  nonce: string;
  report?: HeartbeatReport;
}) {
  const session = await prisma.taskSession.findUnique({ where: { id: args.sessionId } });
  if (!session || session.userId !== args.userId || session.nonce !== args.nonce) {
    throw Err.notFound("That task session was not found.");
  }
  if (session.status !== "STARTED") throw Err.conflict("This session is already closed.");
  if (session.expiresAt < new Date()) throw Err.conflict("This session expired. Start the task again.");

  const now = Date.now();
  const previous = (session.lastHeartbeatAt ?? session.startedAt).getTime();
  const elapsedSinceLast = Math.max(0, Math.floor((now - previous) / 1000));

  let activeDelta = 0;
  let hiddenDelta = 0;

  if (args.report) {
    const claimedActive = Math.max(0, Math.floor(args.report.activeMs / 1000));
    const claimedHidden = Math.max(0, Math.floor(args.report.hiddenMs / 1000));
    const claimedTotal = claimedActive + claimedHidden;

    if (claimedTotal <= elapsedSinceLast || claimedTotal === 0) {
      activeDelta = claimedActive;
      hiddenDelta = claimedHidden;
    } else {
      // Over-claim: keep the ratio the client reported but fit it into the time
      // that actually passed. Discarding the beat entirely would punish a slow
      // network; trusting it would make the tracker decorative.
      const scale = elapsedSinceLast / claimedTotal;
      activeDelta = Math.floor(claimedActive * scale);
      hiddenDelta = Math.max(0, elapsedSinceLast - activeDelta);
    }
  } else {
    // Legacy client with no tracker. The interval is unattributed: it is not
    // counted as active, so it cannot earn a reward, and not counted as hidden,
    // so it is not held against the member either.
    activeDelta = 0;
    hiddenDelta = 0;
  }

  const gap = Math.max(session.maxGapSeconds, elapsedSinceLast);

  const updated = await prisma.taskSession.update({
    where: { id: session.id },
    data: {
      heartbeatCount: { increment: 1 },
      activeSeconds: { increment: activeDelta },
      hiddenSeconds: { increment: hiddenDelta },
      focusLostCount: { increment: Math.max(0, Math.min(50, args.report?.focusLost ?? 0)) },
      blurCount: { increment: Math.max(0, Math.min(50, args.report?.blurred ?? 0)) },
      maxGapSeconds: gap,
      lastHeartbeatAt: new Date(now),
      watchedSeconds: Math.min(
        Math.floor((now - session.startedAt.getTime()) / 1000),
        session.requiredSeconds * 3,
      ),
    },
  });

  return updated;
}

/**
 * Final integrity pass at submission time. Persists the verdict on the session
 * so a rejected member can be shown, and an operator can audit, exactly which
 * rule tripped.
 */
export async function finaliseIntegrity(args: {
  sessionId: string;
  userId: string;
  campaignId: string;
  elapsedSeconds: number;
}): Promise<IntegrityVerdict> {
  const session = await prisma.taskSession.findUniqueOrThrow({ where: { id: args.sessionId } });

  const verdict = evaluateIntegrity({
    requiredSeconds: session.requiredSeconds,
    activeSeconds: session.activeSeconds,
    hiddenSeconds: session.hiddenSeconds,
    focusLostCount: session.focusLostCount,
    blurCount: session.blurCount,
    maxGapSeconds: session.maxGapSeconds,
    heartbeatCount: session.heartbeatCount,
    elapsedSeconds: args.elapsedSeconds,
  });

  await prisma.taskSession.update({
    where: { id: session.id },
    data: { integrityScore: verdict.score, integrityFlags: verdict.flags },
  });

  if (verdict.reject) {
    await recordFraudEvent({
      userId: args.userId,
      type: "SESSION_INTEGRITY_FAILURE",
      summary: `Task session failed the window checks (score ${verdict.score}): ${verdict.flags.join(", ")}.`,
      details: {
        campaignId: args.campaignId,
        sessionId: session.id,
        activeSeconds: verdict.activeSeconds,
        hiddenSeconds: verdict.hiddenSeconds,
        flags: verdict.flags,
      },
    });
  }

  return verdict;
}
