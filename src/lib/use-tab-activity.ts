"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Window and tab tracking for a running task session.
 *
 * What it observes: whether *this page* is the visible tab and whether the
 * window has focus. Both come from APIs every web page already has — the Page
 * Visibility API and window focus events. It cannot see other tabs, other
 * windows, other applications, the mouse, the keyboard or the screen, and it
 * must never be extended to try.
 *
 * How it is used: `drain()` returns everything observed since the last call and
 * resets the counters, so each heartbeat carries one interval and intervals do
 * not overlap or double-count. The server clamps whatever arrives against its
 * own clock, so this is a convenience for honest members rather than a
 * defence — a member with the tracker disabled simply accrues no active time.
 *
 * The counters are refs, not state. Re-rendering the task page on every
 * visibility flicker would restart timers and fight the countdown for no
 * benefit; only `isVisible` is state, because the UI does show it.
 */

export type TabActivityReport = {
  activeMs: number;
  hiddenMs: number;
  focusLost: number;
  blurred: number;
  visible: boolean;
};

export function useTabActivity(enabled: boolean) {
  const [isVisible, setIsVisible] = useState(true);

  const activeMs = useRef(0);
  const hiddenMs = useRef(0);
  const focusLost = useRef(0);
  const blurred = useRef(0);
  const lastTick = useRef<number>(Date.now());
  const currentlyActive = useRef(true);

  /** Closes off the interval that just ended and attributes it. */
  const settle = useCallback(() => {
    const now = Date.now();
    const delta = Math.max(0, now - lastTick.current);
    lastTick.current = now;
    if (currentlyActive.current) {
      activeMs.current += delta;
    } else {
      hiddenMs.current += delta;
    }
  }, []);

  useEffect(() => {
    if (!enabled || typeof document === "undefined") return;

    const evaluate = () => document.visibilityState === "visible" && document.hasFocus();

    // Prime the state from the current reality rather than assuming visible:
    // a session started in a background tab should not begin by accruing time.
    currentlyActive.current = evaluate();
    setIsVisible(currentlyActive.current);
    lastTick.current = Date.now();

    const onVisibility = () => {
      settle();
      const nowActive = evaluate();
      if (!nowActive && document.visibilityState === "hidden") blurred.current += 1;
      currentlyActive.current = nowActive;
      setIsVisible(nowActive);
    };

    const onBlur = () => {
      settle();
      if (currentlyActive.current) focusLost.current += 1;
      currentlyActive.current = false;
      setIsVisible(false);
    };

    const onFocus = () => {
      settle();
      currentlyActive.current = evaluate();
      setIsVisible(currentlyActive.current);
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);

    // A slow tick keeps the split roughly current even if the page sits in one
    // state for minutes, so a heartbeat that lands mid-interval still reports
    // something sensible.
    const tick = setInterval(settle, 5_000);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      clearInterval(tick);
    };
  }, [enabled, settle]);

  /** Everything since the previous drain. Resets the counters. */
  const drain = useCallback((): TabActivityReport => {
    settle();
    const report: TabActivityReport = {
      activeMs: Math.round(activeMs.current),
      hiddenMs: Math.round(hiddenMs.current),
      focusLost: focusLost.current,
      blurred: blurred.current,
      visible: currentlyActive.current,
    };
    activeMs.current = 0;
    hiddenMs.current = 0;
    focusLost.current = 0;
    blurred.current = 0;
    return report;
  }, [settle]);

  return { isVisible, drain };
}
