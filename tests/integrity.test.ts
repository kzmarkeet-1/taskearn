import { describe, expect, it } from "vitest";
import { evaluateIntegrity, INTEGRITY_RULES } from "@/lib/integrity-rules";

/**
 * These exercise the scoring rules directly rather than through a session,
 * because the rules are the part worth arguing about and they should be
 * readable without a database standing behind them.
 */

const clean = {
  requiredSeconds: 60,
  activeSeconds: 62,
  hiddenSeconds: 4,
  focusLostCount: 1,
  blurCount: 1,
  maxGapSeconds: 16,
  heartbeatCount: 5,
  elapsedSeconds: 66,
};

describe("window tracking decides whether a session was watched", () => {
  it("passes an ordinary session with a little tab switching", () => {
    const verdict = evaluateIntegrity(clean);
    expect(verdict.reject).toBe(false);
    expect(verdict.flags).toEqual([]);
    expect(verdict.score).toBe(100);
  });

  it("rejects a session that reported no heartbeats at all", () => {
    const verdict = evaluateIntegrity({ ...clean, heartbeatCount: 0 });
    expect(verdict.reject).toBe(true);
    expect(verdict.flags).toContain("NO_HEARTBEAT");
  });

  it("rejects a session that sat in the background for most of its length", () => {
    // Wall-clock elapsed time is fine here — this is exactly the case the old
    // heartbeat-count check could not tell apart from a real viewing.
    const verdict = evaluateIntegrity({
      ...clean,
      activeSeconds: 8,
      hiddenSeconds: 58,
    });
    expect(verdict.reject).toBe(true);
    expect(verdict.flags).toContain("HIDDEN_MAJORITY");
    expect(verdict.flags).toContain("INSUFFICIENT_ACTIVE_TIME");
  });

  it("requires most of the required time to have been genuinely visible", () => {
    const verdict = evaluateIntegrity({
      ...clean,
      activeSeconds: 40, // under 80% of 60
      hiddenSeconds: 2,
    });
    expect(verdict.flags).toContain("INSUFFICIENT_ACTIVE_TIME");
    expect(verdict.requiredActiveSeconds).toBe(48);
  });

  it("flags a long silence between heartbeats", () => {
    const verdict = evaluateIntegrity({
      ...clean,
      maxGapSeconds: INTEGRITY_RULES.maxHeartbeatGapSeconds + 30,
    });
    expect(verdict.flags).toContain("HEARTBEAT_GAP");
  });

  it("does not reject a client that sent no visibility data at all", () => {
    // An older client, or one with the tracker stripped. It earns no benefit of
    // the doubt, but the wall-clock and heartbeat checks still stand on their
    // own — refusing outright would break every member mid-rollout.
    const verdict = evaluateIntegrity({
      ...clean,
      activeSeconds: 0,
      hiddenSeconds: 0,
    });
    expect(verdict.reject).toBe(false);
    expect(verdict.flags).toEqual(["NO_VISIBILITY_DATA"]);
  });

  it("notes a suspiciously uniform long session without rejecting it", () => {
    // A person watching one video attentively produces exactly this shape, so
    // it must never be fatal on its own.
    const verdict = evaluateIntegrity({
      requiredSeconds: 180,
      activeSeconds: 185,
      hiddenSeconds: 0,
      focusLostCount: 0,
      blurCount: 0,
      maxGapSeconds: 16,
      heartbeatCount: 12,
      elapsedSeconds: 185,
    });
    expect(verdict.flags).toContain("SUSPICIOUSLY_UNIFORM");
    expect(verdict.reject).toBe(false);
  });
});
