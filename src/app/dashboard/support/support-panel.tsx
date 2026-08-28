"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { LifeBuoy, Send } from "lucide-react";
import { api } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatDateTime } from "@/lib/utils";

type Message = { id: string; body: string; isStaff: boolean; createdAt: string };
type Ticket = {
  id: string;
  reference: string;
  subject: string;
  status: string;
  createdAt: string;
  messages: Message[];
};

type NewTicket = { subject: string; category: string; message: string };

export function SupportPanel({ tickets }: { tickets: Ticket[] }) {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(tickets[0]?.id ?? null);
  const [reply, setReply] = useState("");
  const [replying, setReplying] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<NewTicket>({ defaultValues: { category: "GENERAL" } });

  const openTicket = tickets.find((t) => t.id === openId) ?? null;

  async function createTicket(values: NewTicket) {
    const result = await api<{ reference: string }>("/api/support/tickets", { json: values });
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success(`Ticket ${result.data.reference} opened`);
    reset({ subject: "", category: "GENERAL", message: "" });
    router.refresh();
  }

  async function sendReply() {
    if (!openTicket || reply.trim().length === 0) return;
    setReplying(true);
    const result = await api(`/api/support/tickets/${openTicket.id}/reply`, { json: { message: reply } });
    setReplying(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    setReply("");
    router.refresh();
  }

  async function closeTicket() {
    if (!openTicket) return;
    const result = await api(`/api/support/tickets/${openTicket.id}/close`, { method: "PATCH", json: {} });
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success("Ticket closed");
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Open a ticket</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(createTicket)} className="space-y-4" noValidate>
            <Field label="Subject" htmlFor="subject" error={errors.subject?.message}>
              <Input id="subject" {...register("subject", { required: "Give the ticket a subject." })} />
            </Field>
            <Field label="Category" htmlFor="category">
              <Select id="category" {...register("category")}>
                <option value="GENERAL">General</option>
                <option value="REWARDS">Rewards</option>
                <option value="WITHDRAWALS">Withdrawals</option>
                <option value="ACCOUNT">Account</option>
                <option value="TECHNICAL">Technical</option>
              </Select>
            </Field>
            <Field label="What happened?" htmlFor="message" error={errors.message?.message}>
              <Textarea
                id="message"
                rows={5}
                placeholder="Include dates, references and what you expected to happen."
                {...register("message", { required: "Describe the problem." })}
              />
            </Field>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Opening…" : "Open ticket"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your tickets</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {tickets.length === 0 ? (
            <EmptyState
              icon={LifeBuoy}
              title="No tickets yet"
              description="When something does not look right, open a ticket above and an operator will pick it up."
            />
          ) : (
            <div className="divide-y">
              {tickets.map((ticket) => (
                <div key={ticket.id}>
                  <button
                    type="button"
                    onClick={() => setOpenId(openId === ticket.id ? null : ticket.id)}
                    className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left hover:bg-muted/50"
                    aria-expanded={openId === ticket.id}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{ticket.subject}</p>
                      <p className="money text-xs text-muted-foreground">{ticket.reference}</p>
                    </div>
                    <StatusBadge status={ticket.status} />
                  </button>

                  {openId === ticket.id && openTicket ? (
                    <div className="space-y-3 border-t bg-muted/30 px-5 py-4">
                      <ul className="space-y-3">
                        {ticket.messages.map((message) => (
                          <li
                            key={message.id}
                            className={`rounded-lg border p-3 text-sm ${
                              message.isStaff ? "border-primary/20 bg-primary/5" : "bg-card"
                            }`}
                          >
                            <p className="text-xs font-medium text-muted-foreground">
                              {message.isStaff ? "Support" : "You"} · {formatDateTime(message.createdAt)}
                            </p>
                            <p className="mt-1.5 whitespace-pre-wrap">{message.body}</p>
                          </li>
                        ))}
                      </ul>

                      {ticket.status !== "CLOSED" ? (
                        <div className="space-y-2">
                          <Textarea
                            rows={3}
                            value={reply}
                            onChange={(event) => setReply(event.target.value)}
                            placeholder="Add to this ticket…"
                            aria-label="Reply"
                          />
                          <div className="flex gap-2">
                            <Button size="sm" onClick={sendReply} disabled={replying || reply.trim().length === 0}>
                              <Send className="size-4" />
                              {replying ? "Sending…" : "Send reply"}
                            </Button>
                            <Button size="sm" variant="outline" onClick={closeTicket}>
                              Close ticket
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          This ticket is closed. Open a new one if you need to continue.
                        </p>
                      )}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
