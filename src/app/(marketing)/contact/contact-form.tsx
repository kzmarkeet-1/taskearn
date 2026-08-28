"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { z } from "zod";
import { contactSchema } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/ui/field";
import { api } from "@/lib/client";

type Values = z.infer<typeof contactSchema>;

export function ContactForm() {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(contactSchema) });

  async function onSubmit(values: Values) {
    const result = await api("/api/contact", { json: values });
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success("Message sent. We will reply to the email you gave us.");
    reset();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Your name" htmlFor="name" error={errors.name?.message}>
          <Input id="name" autoComplete="name" {...register("name")} />
        </Field>
        <Field label="Email" htmlFor="email" error={errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" {...register("email")} />
        </Field>
      </div>
      <Field label="Subject" htmlFor="subject" error={errors.subject?.message}>
        <Input id="subject" {...register("subject")} />
      </Field>
      <Field
        label="Message"
        htmlFor="message"
        error={errors.message?.message}
        hint="Include your account email if this is about a specific reward or withdrawal."
      >
        <Textarea id="message" rows={6} {...register("message")} />
      </Field>
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Sending…" : "Send message"}
      </Button>
    </form>
  );
}
