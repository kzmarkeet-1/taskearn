"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatMoney } from "@/lib/money";

/**
 * Withdrawal state changes.
 *
 * The wording is deliberate: this records what an operator did outside the
 * system. Marking something completed does not send money.
 */
export function WithdrawalActions({
  id,
  status,
  reference,
  netAmount,
}: {
  id: string;
  status: string;
  reference: string;
  netAmount: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [providerReference, setProviderReference] = useState("");
  const [reason, setReason] = useState("");

  async function act(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    const result = await api<{ providerNote?: string }>(`/api/admin/withdrawals/${id}`, {
      method: "PATCH",
      json: { action, ...extra },
    });
    setBusy(false);

    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    if (result.data.providerNote) {
      toast.warning(`Recorded, but the provider did not accept it: ${result.data.providerNote}`);
    } else {
      toast.success(`${reference} updated`);
    }
    setProviderReference("");
    setReason("");
    router.refresh();
  }

  const canApprove = status === "PENDING" || status === "UNDER_REVIEW";
  const canProcess = status === "APPROVED";
  const canComplete = status === "PROCESSING" || status === "APPROVED";
  const canReject = ["PENDING", "UNDER_REVIEW", "APPROVED"].includes(status);

  if (!canApprove && !canProcess && !canComplete && !canReject) {
    return <span className="text-xs text-muted-foreground">Closed</span>;
  }

  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {canApprove ? (
        <Button size="sm" disabled={busy} onClick={() => act("APPROVE")}>
          Approve
        </Button>
      ) : null}

      {canProcess ? (
        <ConfirmDialog
          trigger={
            <Button size="sm" variant="outline" disabled={busy}>
              Mark processing
            </Button>
          }
          title={`Mark ${reference} as processing?`}
          description={`Use this once you have sent ${formatMoney(netAmount)} through the payment channel. If a provider is connected, the transfer is attempted now.`}
          confirmLabel="Mark processing"
          onConfirm={() => act("PROCESS", { providerReference: providerReference || undefined })}
        >
          <Input
            value={providerReference}
            onChange={(event) => setProviderReference(event.target.value)}
            placeholder="Provider reference (optional)"
            aria-label="Provider reference"
          />
        </ConfirmDialog>
      ) : null}

      {canComplete ? (
        <ConfirmDialog
          trigger={
            <Button size="sm" variant="outline" disabled={busy}>
              Complete
            </Button>
          }
          title={`Confirm ${reference} was paid?`}
          description="Only do this once the money has actually left your account. This closes the withdrawal and tells the member it was sent."
          confirmLabel="Confirm payment sent"
          onConfirm={() => act("COMPLETE", { providerReference: providerReference || undefined })}
        >
          <Input
            value={providerReference}
            onChange={(event) => setProviderReference(event.target.value)}
            placeholder="Transaction reference"
            aria-label="Transaction reference"
          />
        </ConfirmDialog>
      ) : null}

      {canReject ? (
        <ConfirmDialog
          trigger={
            <Button size="sm" variant="destructive" disabled={busy}>
              Reject
            </Button>
          }
          title={`Return ${reference} to the member?`}
          description="The full amount including the fee goes back to their wallet and they are told why. Write the reason for them, not for us."
          confirmLabel="Reject and refund"
          variant="destructive"
          onConfirm={() => act("REJECT", { reason })}
        >
          <Textarea
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Reason shown to the member"
            aria-label="Rejection reason"
          />
        </ConfirmDialog>
      ) : null}
    </div>
  );
}
