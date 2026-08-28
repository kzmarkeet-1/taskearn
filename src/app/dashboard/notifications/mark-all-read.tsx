"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck } from "lucide-react";
import { api } from "@/lib/client";
import { Button } from "@/components/ui/button";

export function MarkAllRead() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function markAll() {
    setBusy(true);
    await api("/api/notifications", { method: "PATCH", json: {} });
    setBusy(false);
    router.refresh();
  }

  return (
    <Button variant="outline" onClick={markAll} disabled={busy}>
      <CheckCheck className="size-4" />
      {busy ? "Marking…" : "Mark all read"}
    </Button>
  );
}
