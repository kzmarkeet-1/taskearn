"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/lib/client";
import { Button } from "@/components/ui/button";

export function ResolveEvent({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function resolve() {
    setBusy(true);
    const result = await api(`/api/admin/fraud/${id}`, { method: "PATCH", json: { resolved: true } });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success("Signal closed");
    router.refresh();
  }

  return (
    <Button size="sm" variant="outline" onClick={resolve} disabled={busy}>
      {busy ? "Closing…" : "Mark reviewed"}
    </Button>
  );
}
