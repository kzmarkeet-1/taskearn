"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Clock, Loader2 } from "lucide-react";
import { api } from "@/lib/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/money";

type Survey = {
  id: string;
  name: string;
  providerName: string;
  rewardAmount: number;
  estimatedMinutes: number;
  isDemo: boolean;
};

export function SurveyCard({ survey }: { survey: Survey }) {
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    const result = await api<{ redirectUrl: string }>(`/api/surveys/${survey.id}/start`, { json: {} });
    setBusy(false);

    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    window.location.href = result.data.redirectUrl;
  }

  return (
    <Card className="flex flex-col">
      <CardContent className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{survey.providerName}</p>
          {survey.isDemo ? <Badge variant="neutral">Demo</Badge> : null}
        </div>
        <h3 className="mt-1.5 font-semibold leading-snug">{survey.name}</h3>

        <div className="mt-4 flex items-center gap-4 text-sm">
          <span className="money font-semibold text-success">{formatMoney(survey.rewardAmount)}</span>
          <span className="flex items-center gap-1 text-muted-foreground">
            <Clock className="size-3.5" />
            about {survey.estimatedMinutes} min
          </span>
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          The panel screens you first. If you are not a match, the survey ends early and no reward is due.
        </p>

        <Button className="mt-5 w-full" onClick={start} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          {busy ? "Opening…" : "Start survey"}
        </Button>
      </CardContent>
    </Card>
  );
}
