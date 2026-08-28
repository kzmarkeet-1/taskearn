"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export function UserActions({
  userId,
  status,
  emailVerified,
}: {
  userId: string;
  status: string;
  emailVerified: boolean;
}) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function update(payload: Record<string, unknown>, successMessage: string) {
    setBusy(true);
    const result = await api(`/api/admin/users/${userId}`, { method: "PATCH", json: { ...payload, note } });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success(successMessage);
    setNote("");
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Actions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea
          rows={3}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Reason — shown to the member when suspending or closing."
          aria-label="Reason"
        />

        {status !== "ACTIVE" ? (
          <Button className="w-full" disabled={busy} onClick={() => update({ status: "ACTIVE" }, "Account reactivated")}>
            Reactivate account
          </Button>
        ) : null}

        {status !== "UNDER_REVIEW" ? (
          <Button
            variant="outline"
            className="w-full"
            disabled={busy}
            onClick={() => update({ status: "UNDER_REVIEW" }, "Account moved to review")}
          >
            Move to review
          </Button>
        ) : null}

        {!emailVerified ? (
          <Button
            variant="outline"
            className="w-full"
            disabled={busy}
            onClick={() => update({ verifyEmail: true }, "Email marked as confirmed")}
          >
            Mark email confirmed
          </Button>
        ) : null}

        {status !== "SUSPENDED" ? (
          <ConfirmDialog
            trigger={
              <Button variant="outline" className="w-full" disabled={busy}>
                Suspend account
              </Button>
            }
            title="Suspend this account?"
            description="The member is signed out everywhere and cannot earn or withdraw until you reactivate them. They are told the reason you entered."
            confirmLabel="Suspend"
            variant="destructive"
            onConfirm={() => update({ status: "SUSPENDED" }, "Account suspended")}
          />
        ) : null}

        {status !== "BANNED" ? (
          <ConfirmDialog
            trigger={
              <Button variant="destructive" className="w-full" disabled={busy}>
                Close account
              </Button>
            }
            title="Close this account permanently?"
            description="Closing is intended to be final. The member loses access immediately. Their wallet history is kept for audit."
            confirmLabel="Close account"
            variant="destructive"
            onConfirm={() => update({ status: "BANNED" }, "Account closed")}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}
