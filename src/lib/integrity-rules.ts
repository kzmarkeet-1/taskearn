/**
 * Anti-cheat scoring rules.
 *
 * Split out from integrity.ts so the rules can be read, argued with and tested
 * without a database standing behind them. Nothing in this file touches
 * Prisma, the network, or the clock — given the same numbers it always returns
 * the same verdict.
 */

/** What the open page reports since its previous heartbeat. */
export type HeartbeatReport = {
  /** Milliseconds the page was visible and focused during the interval. */
  activeMs: number;
  /** Milliseconds the page was hidden or the window unfocused. */
  hiddenMs: number;
  /** Times the window lost focus during the interval. */
  focusLost: number;
  /** Times the tab was backgrounded during the interval. */
  blurred: number;
  /** Whether the page was visible at the moment the beat was sent. */
  visible: boolean;
};

export const INTEGRITY_RULES = {
  /** Share of the session that may be hidden before the session is suspect. */
  maxHiddenShare: 0.35,
  /** Focus changes tolerated before the pattern itself looks automated. */
  maxFocusLosses: 12,
  /** A gap longer than this means the page was closed or throttled to sleep. */
  maxHeartbeatGapSeconds: 90,
  /** Share of required time that must be genuinely active to earn the reward. */
  minActiveShare: 0.8,
  /** Below this score the session is rejected outright. */
  rejectBelowScore: 50,
} as const;

export type IntegrityVerdict = {
  score: number;
  flags: string[];
  /** True when the session should not be paid. */
  reject: boolean;
  activeSeconds: number;
  hiddenSeconds: number;
  requiredActiveSeconds: number;
};

type SessionIntegrityState = {
  requiredSeconds: number;
  activeSeconds: number;
  hiddenSeconds: number;
  focusLostCount: number;
  blurCount: number;
  maxGapSeconds: number;
  heartbeatCount: number;
  elapsedSeconds: number;
};

/**
 * Scores a session from what the server accumulated.
 *
 * Pure and synchronous on purpose: the rules are the interesting part and they
 * should be readable, testable and arguable without a database.
 */
export function evaluateIntegrity(state: SessionIntegrityState): IntegrityVerdict {
  const flags: string[] = [];
  let score = 100;

  const requiredActiveSeconds = Math.ceil(state.requiredSeconds * INTEGRITY_RULES.minActiveShare);
  const observed = state.activeSeconds + state.hiddenSeconds;

  // No heartbeats at all: nothing was ever open behind this session.
  if (state.heartbeatCount < 1) {
    return {
      score: 0,
      flags: ["NO_HEARTBEAT"],
      reject: true,
      activeSeconds: state.activeSeconds,
      hiddenSeconds: state.hiddenSeconds,
      requiredActiveSeconds,
    };
  }

  // A page that reported nothing about its own visibility is running an older
  // client, or one with the tracker stripped out. Not fatal on its own — the
  // wall-clock and heartbeat checks still apply — but it earns no benefit of
  // the doubt on the checks that need the data.
  if (observed === 0) {
    flags.push("NO_VISIBILITY_DATA");
    score -= 20;
    return {
      score,
      flags,
      reject: false,
      activeSeconds: state.activeSeconds,
      hiddenSeconds: state.hiddenSeconds,
      requiredActiveSeconds,
    };
  }

  const hiddenShare = state.hiddenSeconds / observed;
  if (hiddenShare > INTEGRITY_RULES.maxHiddenShare) {
    flags.push("HIDDEN_MAJORITY");
    // Scale the penalty with how much of the session was spent elsewhere.
    score -= Math.min(60, Math.round(hiddenShare * 100));
  }

  if (state.activeSeconds < requiredActiveSeconds) {
    flags.push("INSUFFICIENT_ACTIVE_TIME");
    score -= 40;
  }

  if (state.focusLostCount > INTEGRITY_RULES.maxFocusLosses) {
    flags.push("EXCESSIVE_FOCUS_CHANGES");
    score -= 15;
  }

  if (state.maxGapSeconds > INTEGRITY_RULES.maxHeartbeatGapSeconds) {
    flags.push("HEARTBEAT_GAP");
    score -= 25;
  }

  // Perfectly uniform reporting with zero hidden time over a long session is
  // the signature of a script replaying a fixed payload, not of a person. Only
  // flagged, never fatal on its own: a member watching one video attentively on
  // a desktop legitimately produces exactly this.
  if (state.elapsedSeconds >= 120 && state.hiddenSeconds === 0 && state.focusLostCount === 0 && state.blurCount === 0) {
    flags.push("SUSPICIOUSLY_UNIFORM");
    score -= 10;
  }

  score = Math.max(0, Math.min(100, score));

  return {
    score,
    flags,
    reject: score < INTEGRITY_RULES.rejectBelowScore,
    activeSeconds: state.activeSeconds,
    hiddenSeconds: state.hiddenSeconds,
    requiredActiveSeconds,
  };
}

/** A member-facing explanation of why a session was not paid. */
export function explainRejection(verdict: IntegrityVerdict): string {
  if (verdict.flags.includes("NO_HEARTBEAT")) {
    return "We did not see the task page stay open. Open the task and let the video run.";
  }
  if (verdict.flags.includes("INSUFFICIENT_ACTIVE_TIME") || verdict.flags.includes("HIDDEN_MAJORITY")) {
    return `The task tab needs to stay visible for at least ${verdict.requiredActiveSeconds}s. We counted ${verdict.activeSeconds}s.`;
  }
  if (verdict.flags.includes("HEARTBEAT_GAP")) {
    return "The task page stopped reporting partway through. Keep the tab open and try again.";
  }
  return "We could not verify that session. Open the task page and let the video run.";
}
