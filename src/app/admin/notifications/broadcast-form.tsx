"use client";

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

type Values = { audience: string; title: string; body: string; href: string; email: boolean };

export function BroadcastForm() {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ defaultValues: { audience: "ACTIVE", email: false } });

  async function onSubmit(values: Values) {
    const result = await api<{ count: number }>("/api/admin/notifications", { json: values });
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success(`Sent to ${result.data.count} members`);
    reset({ audience: values.audience, title: "", body: "", href: "", email: false });
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <Field label="Who should receive this?" htmlFor="audience">
        <Select id="audience" {...register("audience")}>
          <option value="ACTIVE">Active members</option>
          <option value="ALL">Everyone</option>
          <option value="WITH_BALANCE">Members holding a balance</option>
          <option value="UNDER_REVIEW">Members under review</option>
        </Select>
      </Field>

      <Field label="Title" htmlFor="title" error={errors.title?.message}>
        <Input id="title" {...register("title", { required: "Give the announcement a title." })} />
      </Field>

      <Field label="Message" htmlFor="body" error={errors.body?.message}>
        <Textarea id="body" rows={4} {...register("body", { required: "Write the message." })} />
      </Field>

      <Field label="Link" htmlFor="href" hint="Optional. A path within the app, such as /dashboard/wallet.">
        <Input id="href" {...register("href")} />
      </Field>

      <label className="flex items-center gap-2.5 text-sm text-muted-foreground">
        <input
          type="checkbox"
          className="size-4 rounded border-input text-primary focus-visible:ring-2 focus-visible:ring-ring"
          {...register("email")}
        />
        Also queue this as an email
      </label>

      <Alert variant="warning">
        <AlertDescription>
          Write announcements that are true and useful. Nothing here should promise earnings, imply guaranteed income,
          or pressure people into completing more work than they want to.
        </AlertDescription>
      </Alert>

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Sending…" : "Send announcement"}
      </Button>
    </form>
  );
}
