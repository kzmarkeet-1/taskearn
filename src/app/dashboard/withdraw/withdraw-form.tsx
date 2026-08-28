"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/field";
import { formatMoney, parseMoneyInput, toMajor } from "@/lib/money";
import { Alert, AlertDescription } from "@/components/ui/alert";

type SavedAccount = {
  id: string;
  method: string;
  accountName: string;
  accountNumber: string;
  bankName: string | null;
  network?: string | null;
};

type PayoutMethodOption = { method: string; name: string };

type FormValues = {
  amount: string;
  method: "JAZZCASH" | "EASYPAISA" | "BANK_TRANSFER" | "CRYPTO_USDT" | "STRIPE";
  accountName: string;
  accountNumber: string;
  bankName: string;
  network: string;
  saveAccount: boolean;
};

const CRYPTO_NETWORKS = ["TRC20", "ERC20", "BEP20", "POLYGON"];

export function WithdrawForm({
  withdrawable,
  minimum,
  maximum,
  fee,
  savedAccounts,
  methods,
}: {
  withdrawable: number;
  minimum: number;
  maximum: number;
  fee: number;
  savedAccounts: SavedAccount[];
  /** Which rails this deployment actually offers. */
  methods?: PayoutMethodOption[];
}) {
  const available =
    methods && methods.length > 0
      ? methods
      : [
          { method: "JAZZCASH", name: "JazzCash" },
          { method: "EASYPAISA", name: "Easypaisa" },
          { method: "BANK_TRANSFER", name: "Bank transfer" },
        ];
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    defaultValues: {
      method: (available[0]?.method as FormValues["method"]) ?? "JAZZCASH",
      amount: "",
      accountName: "",
      accountNumber: "",
      bankName: "",
      network: "TRC20",
      saveAccount: true,
    },
  });

  const method = watch("method");
  const amountInput = watch("amount");
  const amountMinor = parseMoneyInput(amountInput || "");
  const total = amountMinor === null ? null : amountMinor + fee;

  async function onSubmit(values: FormValues) {
    setFormError(null);
    const minor = parseMoneyInput(values.amount);

    if (minor === null) {
      setFormError("Enter an amount like 750 or 750.50.");
      return;
    }
    if (minor + fee > withdrawable) {
      setFormError(
        `Your withdrawable balance covers ${formatMoney(Math.max(0, withdrawable - fee))} after the ${formatMoney(fee)} fee.`,
      );
      return;
    }

    const result = await api<{ reference: string }>("/api/withdrawals", {
      json: {
        amount: minor,
        method: values.method,
        accountName: values.accountName,
        accountNumber: values.accountNumber,
        bankName: values.method === "BANK_TRANSFER" ? values.bankName : undefined,
        network: values.method === "CRYPTO_USDT" ? values.network : undefined,
        saveAccount: values.saveAccount,
      },
    });

    if (!result.ok) {
      setFormError(result.message);
      return;
    }

    toast.success(`Withdrawal ${result.data.reference} submitted for review`);
    reset({ ...values, amount: "" });
    router.refresh();
  }

  function applySavedAccount(account: SavedAccount) {
    setValue("method", account.method as FormValues["method"]);
    setValue("accountName", account.accountName);
    setValue("accountNumber", account.accountNumber);
    setValue("bankName", account.bankName ?? "");
    if (account.network) setValue("network", account.network);
  }

  const canWithdraw = withdrawable >= minimum + fee;

  if (!canWithdraw) {
    return (
      <Alert variant="info">
        <AlertDescription>
          You need {formatMoney(minimum + fee)} withdrawable to make a request — that is the {formatMoney(minimum)}{" "}
          minimum plus the {formatMoney(fee)} fee. You have {formatMoney(withdrawable)} so far.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      {savedAccounts.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {savedAccounts.map((account) => (
            <Button key={account.id} type="button" variant="outline" size="sm" onClick={() => applySavedAccount(account)}>
              {account.method.replace("_", " ")} · {account.accountNumber.slice(-4)}
            </Button>
          ))}
        </div>
      ) : null}

      <Field
        label="Amount"
        htmlFor="amount"
        error={errors.amount?.message}
        hint={`Between ${formatMoney(minimum)} and ${formatMoney(maximum)}. You have ${formatMoney(withdrawable)} withdrawable.`}
      >
        <Input
          id="amount"
          inputMode="decimal"
          placeholder={String(toMajor(minimum))}
          {...register("amount", { required: "Enter an amount." })}
        />
      </Field>

      <Field label="Payment method" htmlFor="method" error={errors.method?.message}>
        <Select id="method" {...register("method")}>
          {available.map((option) => (
            <option key={option.method} value={option.method}>
              {option.name}
            </option>
          ))}
        </Select>
      </Field>

      {method === "CRYPTO_USDT" ? (
        <Field
          label="Network"
          htmlFor="network"
          error={errors.network?.message}
          hint="Check this against the network your wallet or exchange expects. USDT sent on the wrong chain is gone — nobody can reverse it."
        >
          <Select id="network" {...register("network")}>
            {CRYPTO_NETWORKS.map((chain) => (
              <option key={chain} value={chain}>
                {chain}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      <Field
        label={method === "CRYPTO_USDT" ? "Label for this wallet" : "Account holder name"}
        htmlFor="accountName"
        error={errors.accountName?.message}
        hint={
          method === "CRYPTO_USDT"
            ? "Just for your own reference — it is not checked against the chain."
            : "Must match the name on the receiving account."
        }
      >
        <Input id="accountName" {...register("accountName", { required: "Enter the account holder's name." })} />
      </Field>

      <Field
        label={
          method === "BANK_TRANSFER"
            ? "Account number / IBAN"
            : method === "CRYPTO_USDT"
              ? "USDT wallet address"
              : "Mobile number"
        }
        htmlFor="accountNumber"
        error={errors.accountNumber?.message}
      >
        <Input
          id="accountNumber"
          {...register("accountNumber", { required: "Enter the account or mobile number." })}
        />
      </Field>

      {method === "BANK_TRANSFER" ? (
        <Field label="Bank name" htmlFor="bankName" error={errors.bankName?.message}>
          <Input id="bankName" {...register("bankName", { required: "Enter the bank name." })} />
        </Field>
      ) : null}

      <label className="flex items-center gap-2.5 text-sm text-muted-foreground">
        <input
          type="checkbox"
          className="size-4 rounded border-input text-primary focus-visible:ring-2 focus-visible:ring-ring"
          {...register("saveAccount")}
        />
        Save these details for next time
      </label>

      {total !== null ? (
        <div className="rounded-lg bg-muted/60 p-4 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">You receive</span>
            <span className="money font-medium">{formatMoney(amountMinor ?? 0)}</span>
          </div>
          <div className="mt-1.5 flex justify-between">
            <span className="text-muted-foreground">Fee</span>
            <span className="money">{formatMoney(fee)}</span>
          </div>
          <div className="mt-1.5 flex justify-between border-t pt-1.5 font-semibold">
            <span>Leaves your wallet</span>
            <span className="money">{formatMoney(total)}</span>
          </div>
        </div>
      ) : null}

      {formError ? (
        <p className="text-sm font-medium text-destructive" role="alert">
          {formError}
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
        {isSubmitting ? "Submitting…" : "Request withdrawal"}
      </Button>
      <p className="text-xs text-muted-foreground">
        The amount leaves your wallet as soon as you submit so it cannot be requested twice. If the request is
        rejected, everything including the fee comes back.
      </p>
    </form>
  );
}
