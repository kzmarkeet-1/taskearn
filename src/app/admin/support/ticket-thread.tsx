"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { api } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/utils";

type Message = { id: string; body: string; isStaff: boolean; createdAt: string };

export function TicketThread({
  id,
  status,
  priority,
  messages,
}: {
  id: string;
  status: string;
  priority: string;
  messages: Message[];
}) {
  const router = useRouter();
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);

  async function patch(payload: Record<string, unknown>, message: string) {
    setBusy(true);
    const result = await api(`/api/admin/support/${id}`, { method: "PATCH", json: payload });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success(message);
    setReply("");
    router.refresh();
  }

  return (
    <div className="mt-4 space-y-3">
      <ul className="space-y-2.5">
        {messages.map((message) => (
          <li
            key={message.id}
            className={`rounded-lg border p-3 text-sm ${message.isStaff ? "border-primary/20 bg-primary/5" : "bg-muted/40"}`}
          >
            <p className="text-xs font-medium text-muted-foreground">
              {message.isStaff ? "Support" : "Member"} · {formatDateTime(message.createdAt)}
            </p>
            <p className="mt-1.5 whitespace-pre-wrap">{message.body}</p>
          </li>
        ))}
      </ul>

      <Textarea
        rows={3}
        value={reply}
        onChange={(event) => setReply(event.target.value)}
        placeholder="Reply to the member…"
        aria-label="Reply"
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={busy || reply.trim().length === 0} onClick={() => patch({ reply }, "Reply sent")}>
          <Send className="size-4" />
          Send reply
        </Button>

        <Select
          value={status}
          onChange={(event) => patch({ status: event.target.value }, "Status updated")}
          aria-label="Ticket status"
          className="h-9 w-auto text-sm"
        >
          <option value="OPEN">Open</option>
          <option value="IN_PROGRESS">In progress</option>
          <option value="WAITING_FOR_USER">Waiting on member</option>
          <option value="RESOLVED">Resolved</option>
          <option value="CLOSED">Closed</option>
        </Select>

        <Select
          value={priority}
          onChange={(event) => patch({ priority: event.target.value }, "Priority updated")}
          aria-label="Ticket priority"
          className="h-9 w-auto text-sm"
        >
          <option value="LOW">Low</option>
          <option value="NORMAL">Normal</option>
          <option value="HIGH">High</option>
        </Select>
      </div>
    </div>
  );
}
