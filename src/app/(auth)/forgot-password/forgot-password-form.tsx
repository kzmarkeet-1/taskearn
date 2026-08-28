"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { forgotPasswordSchema } from "@/lib/validation";
import { api } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type Values = z.infer<typeof forgotPasswordSchema>;

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const [devLink, setDevLink] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(forgotPasswordSchema) });

  async function onSubmit(values: Values) {
    const result = await api<{ resetUrl?: string }>("/api/auth/forgot-password", { json: values });
    setSent(true);
    if (result.ok && result.data.resetUrl) setDevLink(result.data.resetUrl);
  }

  if (sent) {
    return (
      <Alert variant="info">
        <AlertTitle>Check your inbox</AlertTitle>
        <AlertDescription>
          If that email belongs to an account, a reset link is on its way. The link is valid for one hour.
          {devLink ? (
            <span className="mt-3 block break-all rounded-md bg-muted p-2 text-xs">
              Development only — no email provider is configured, so here is the link:{" "}
              <a className="font-medium text-primary underline" href={devLink}>
                {devLink}
              </a>
            </span>
          ) : null}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <Field label="Email" htmlFor="email" error={errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" autoFocus {...register("email")} />
      </Field>
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}
