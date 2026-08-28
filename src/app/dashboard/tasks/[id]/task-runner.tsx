"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, ExternalLink, Eye, EyeOff, Loader2 } from "lucide-react";
import { api } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatMoney } from "@/lib/money";
import { useTabActivity } from "@/lib/use-tab-activity";

type Session = {
  sessionId: string;
  nonce: string;
  requiredSeconds: number;
  startedAt: string;
  resumed: boolean;
  campaign: { videoUrl: string; description: string };
};

/**
 * Runs one task session.
 *
 * The countdown here is a convenience for the member. The reward decision is
 * made on the server from its own clock, so nothing this component reports can
 * shorten the required viewing time.
 *
 * Each heartbeat also carries what the tab tracker observed since the previous
 * one — how long this page was visible and focused, and how often that changed.
 * The server clamps those figures against the time that really passed, so the
 * report can only ever cost the member credit, never invent it. The counter
 * shown below is the server's own count, echoed back, so a member can see what
 * is actually accruing rather than finding out at submission.
 */
export function TaskRunner({
  campaignId,
  description,
  videoUrl,
  requiredSeconds,
  rewardAmount,
}: {
  campaignId: string;
  description: string;
  videoUrl: string;
  requiredSeconds: number;
  rewardAmount: number;
}) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [activeSeconds, setActiveSeconds] = useState(0);
  const startedAtRef = useRef<number | null>(null);

  const { isVisible, drain } = useTabActivity(Boolean(session) && !done);

  // The server needs 80% of the required time to have been genuinely visible.
  // Mirroring that threshold here means the submit button unlocks when the
  // submission will actually succeed, instead of when the clock alone says so.
  const requiredActive = Math.ceil(requiredSeconds * 0.8);
  const ready = elapsed >= requiredSeconds && activeSeconds >= requiredActive;

  async function start() {
    setStarting(true);
    const result = await api<Session>(`/api/tasks/${campaignId}/start`, { json: {} });
    setStarting(false);

    if (!result.ok) {
      toast.error(result.message);
      return;
    }

    setSession(result.data);
    startedAtRef.current = new Date(result.data.startedAt).getTime();
    setElapsed(Math.floor((Date.now() - new Date(result.data.startedAt).getTime()) / 1000));
    window.open(result.data.campaign.videoUrl, "_blank", "noopener,noreferrer");
    toast.success(
      result.data.resumed ? "Picking up your open session" : "Session started — keep this tab open",
    );
  }

  const beat = useCallback(async () => {
    if (!session) return;
    const result = await api<{ activeSeconds: number; hiddenSeconds: number }>(
      `/api/tasks/${campaignId}/heartbeat`,
      {
        // drain() hands over one interval and resets, so consecutive beats
        // never overlap and never double-count the same seconds.
        json: { sessionId: session.sessionId, nonce: session.nonce, report: drain() },
      },
    );
    if (result.ok) setActiveSeconds(result.data.activeSeconds);
  }, [campaignId, session, drain]);

  useEffect(() => {
    if (!session || done) return;

    const tick = setInterval(() => {
      if (startedAtRef.current) {
        setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }
    }, 1000);

    void beat();
    const heartbeat = setInterval(() => void beat(), 15_000);

    return () => {
      clearInterval(tick);
      clearInterval(heartbeat);
    };
  }, [session, done, beat]);

  async function submit() {
    if (!session) return;
    setSubmitting(true);
    const result = await api<{ alreadyCompleted: boolean; reward?: number }>(`/api/tasks/${campaignId}/complete`, {
      json: { sessionId: session.sessionId, nonce: session.nonce, watchedSeconds: elapsed },
    });
    setSubmitting(false);

    if (!result.ok) {
      toast.error(result.message);
      return;
    }

    setDone(true);
    toast.success("Task complete — the reward is pending verification");
    router.refresh();
  }

  if (done) {
    return (
      <Alert variant="success">
        <AlertTitle className="flex items-center gap-2">
          <CheckCircle2 className="size-4 text-success" />
          Task complete
        </AlertTitle>
        <AlertDescription>
          {formatMoney(rewardAmount)} has been added to your pending balance. It clears to your available balance once
          the verification hold passes.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <Card>
        <CardHeader>
          <CardTitle>What the advertiser asked for</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <p className="text-sm text-muted-foreground">{description}</p>

          <ol className="space-y-2.5 text-sm">
            <li className="flex gap-2.5">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                1
              </span>
              Start the session. The video opens in a new tab.
            </li>
            <li className="flex gap-2.5">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                2
              </span>
              Watch it for at least {requiredSeconds} seconds. Leave this tab visible while you do — time
              spent with it hidden behind another window is not counted.
            </li>
            <li className="flex gap-2.5">
              <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                3
              </span>
              Come back here and submit.
            </li>
          </ol>

          <Alert variant="info">
            <AlertDescription>
              The timer runs on our server, not in your browser, so closing this tab or changing the clock will not
              help. This page reports only whether it is the tab you are looking at — it cannot see your other tabs,
              your screen or anything else. Sessions that cannot be verified are rejected without a reward.
            </AlertDescription>
          </Alert>

          {session ? (
            <Button variant="outline" asChild className="w-full sm:w-auto">
              <a href={videoUrl} target="_blank" rel="noopener noreferrer">
                Open the video again
                <ExternalLink className="size-4" />
              </a>
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <Card className="h-fit">
        <CardHeader>
          <CardTitle>Your session</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!session ? (
            <>
              <p className="text-sm text-muted-foreground">
                You will earn {formatMoney(rewardAmount)} once the session is verified.
              </p>
              <Button className="w-full" onClick={start} disabled={starting}>
                {starting ? <Loader2 className="size-4 animate-spin" /> : null}
                {starting ? "Starting…" : "Start task"}
              </Button>
            </>
          ) : (
            <>
              <div>
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-muted-foreground">Time watched</span>
                  <span className="text-lg money font-semibold">
                    {Math.min(elapsed, requiredSeconds)}s / {requiredSeconds}s
                  </span>
                </div>
                <Progress className="mt-2" value={Math.min(elapsed, requiredSeconds)} max={requiredSeconds} label="Viewing progress" />
              </div>

              <div className="rounded-md border border-border/60 bg-muted/40 p-3">
                <div className="flex items-center gap-2 text-sm">
                  {isVisible ? (
                    <Eye className="size-4 text-success" aria-hidden />
                  ) : (
                    <EyeOff className="size-4 text-muted-foreground" aria-hidden />
                  )}
                  <span className={isVisible ? "text-success" : "text-muted-foreground"}>
                    {isVisible ? "This tab is counting" : "Paused — this tab is in the background"}
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Counted so far: <span className="money font-medium">{activeSeconds}s</span> of{" "}
                  {requiredActive}s needed. Time with this tab hidden does not count.
                </p>
              </div>

              <p className="text-sm text-muted-foreground">
                {ready
                  ? "You can submit now."
                  : elapsed < requiredSeconds
                    ? `${requiredSeconds - elapsed}s to go. Keep the video playing.`
                    : `Keep this tab open for ${Math.max(0, requiredActive - activeSeconds)}s more.`}
              </p>

              <Button className="w-full" onClick={submit} disabled={!ready || submitting}>
                {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
                {submitting ? "Submitting…" : "Submit task"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
