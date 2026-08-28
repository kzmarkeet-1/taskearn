"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import type { z } from "zod";
import { registerSchema } from "@/lib/validation";
import { PASSWORD_RULES } from "@/lib/password";
import { api } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { COUNTRIES } from "@/lib/countries";

type Values = z.infer<typeof registerSchema>;

export function RegisterForm() {
  const router = useRouter();
  const params = useSearchParams();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      country: "Pakistan",
      referralCode: params.get("ref")?.toUpperCase() ?? "",
    },
  });

  const password = watch("password") ?? "";

  async function onSubmit(values: Values) {
    const result = await api("/api/auth/register", { json: values });
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    toast.success("Account created. Welcome to TaskEarn.");
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <Field label="Full name" htmlFor="fullName" error={errors.fullName?.message}>
        <Input id="fullName" autoComplete="name" {...register("fullName")} />
      </Field>

      <Field label="Email" htmlFor="email" error={errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" {...register("email")} />
      </Field>

      <Field label="Mobile number" htmlFor="phone" error={errors.phone?.message}>
        <Input id="phone" type="tel" autoComplete="tel" placeholder="03xx xxxxxxx" {...register("phone")} />
      </Field>

      <Field label="Country" htmlFor="country" error={errors.country?.message}>
        <Select id="country" {...register("country")}>
          {COUNTRIES.map((country) => (
            <option key={country} value={country}>
              {country}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Password" htmlFor="password" error={errors.password?.message}>
        <Input id="password" type="password" autoComplete="new-password" {...register("password")} />
      </Field>

      <ul className="grid grid-cols-2 gap-1.5">
        {PASSWORD_RULES.map((rule) => {
          const passed = rule.test(password);
          return (
            <li
              key={rule.label}
              className={`flex items-center gap-1.5 text-xs ${passed ? "text-success" : "text-muted-foreground"}`}
            >
              {passed ? <Check className="size-3" /> : <X className="size-3" />}
              {rule.label}
            </li>
          );
        })}
      </ul>

      <Field label="Confirm password" htmlFor="confirmPassword" error={errors.confirmPassword?.message}>
        <Input id="confirmPassword" type="password" autoComplete="new-password" {...register("confirmPassword")} />
      </Field>

      <Field
        label="Referral code"
        htmlFor="referralCode"
        error={errors.referralCode?.message}
        hint="Optional. Leave blank if nobody invited you."
      >
        <Input id="referralCode" className="uppercase" {...register("referralCode")} />
      </Field>

      <label className="flex items-start gap-2.5 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 size-4 rounded border-input text-primary focus-visible:ring-2 focus-visible:ring-ring"
          {...register("acceptTerms")}
        />
        <span className="text-muted-foreground">
          I am 18 or older and I accept the terms, privacy policy and responsible earnings policy.
        </span>
      </label>
      {errors.acceptTerms ? (
        <p className="text-xs font-medium text-destructive" role="alert">
          {errors.acceptTerms.message}
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Creating your account…" : "Create account"}
      </Button>
    </form>
  );
}
