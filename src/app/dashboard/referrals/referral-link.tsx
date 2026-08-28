"use client";

import { useState } from "react";
import { Check, Copy, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ReferralLink({ code, link }: { code: string; link: string }) {
  const [copied, setCopied] = useState(false);

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`${label} copied`);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Copying is blocked in this browser. Select the text and copy it by hand.");
    }
  }

  async function share() {
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title: "Join me on TaskEarn", url: link });
        return;
      } catch {
        // The person dismissed the share sheet; fall through to copying.
      }
    }
    void copy(link, "Invite link");
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input readOnly value={link} className="money text-xs" aria-label="Your invite link" />
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => copy(link, "Invite link")}>
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? "Copied" : "Copy"}
          </Button>
          <Button type="button" onClick={share}>
            <Share2 className="size-4" />
            Share
          </Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Or give them your code:{" "}
        <button
          type="button"
          onClick={() => copy(code, "Referral code")}
          className="font-mono font-semibold text-foreground underline-offset-4 hover:underline"
        >
          {code}
        </button>
      </p>
    </div>
  );
}
