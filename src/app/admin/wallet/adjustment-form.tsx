"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { api } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { parseMoneyInput } from "@/lib/money";

type Values = { email: string; amount: string; direction: "CREDIT" | "DEBIT"; bucket: string; reason: string };

export function AdjustmentForm() {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ defaultValues: { direction: "CREDIT", bucket: "AVAILABLE" } });

  // One id per attempt. It is regenerated only after a success, so a retry
  // after a network failure reuses it and the server recognises the duplicate.
  const requestId = useRef(crypto.randomUUID());

  async function onSubmit(values: Values) {
    const minor = parseMoneyInput(values.amount);
    if (minor === null || minor <= 0) {
      toast.error("Enter a positive amount like 250 or 250.50.");
      return;
    }

    const result = await api("/api/admin/wallet/adjust", {
      json: {
        email: values.email,
        amount: values.direction === "DEBIT" ? -minor : minor,
        bucket: values.bucket,
        reason: values.reason,
        requestId: requestId.current,
      },
    });

    if (!result.ok) {
      toast.error(result.message);
      return;
    }

    toast.success("Adjustment recorded");
    requestId.current = crypto.randomUUID();
    reset({ email: "", amount: "", direction: "CREDIT", bucket: "AVAILABLE", reason: "" });
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <Field label="Member email" htmlFor="email" error={errors.email?.message}>
        <Input id="email" type="email" {...register("email", { required: "Whose wallet?" })} />
      </Field>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Direction" htmlFor="direction">
          <Select id="direction" {...register("direction")}>
            <option value="CREDIT">Credit — add funds</option>
            <option value="DEBIT">Debit — remove funds</option>
          </Select>
        </Field>
        <Field label="Amount" htmlFor="amount" hint="In PKR.">
          <Input id="amount" inputMode="decimal" {...register("amount", { required: "How much?" })} />
        </Field>
      </div>

      <Field label="Bucket" htmlFor="bucket" hint="Which balance the adjustment lands in.">
        <Select id="bucket" {...register("bucket")}>
          <option value="AVAILABLE">Available</option>
          <option value="PENDING">Pending</option>
          <option value="BONUS">Bonus</option>
          <option value="REFERRAL">Referral</option>
        </Select>
      </Field>

      <Field
        label="Reason"
        htmlFor="reason"
        error={errors.reason?.message}
        hint="Recorded on the transaction and in the audit log. Write it for someone reading this in a year."
      >
        <Textarea id="reason" rows={3} {...register("reason", { required: "A reason is required." })} />
      </Field>

      <Alert variant="warning">
        <AlertDescription>
          Adjustments are new ledger rows, not edits. A debit cannot push a balance below zero — it will be refused
          instead.
        </AlertDescription>
      </Alert>

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Recording…" : "Record adjustment"}
      </Button>
    </form>
  );
}
