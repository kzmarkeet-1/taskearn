import type { Metadata } from "next";
import { Banknote } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBalances, releaseMaturedRewards } from "@/lib/wallet";
import { getSettings } from "@/lib/settings";
import { payoutStatuses } from "@/lib/payouts";
import { formatMoney } from "@/lib/money";
import { formatDateTime } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getEntitlements } from "@/lib/tiers";
import { WithdrawForm } from "./withdraw-form";

export const metadata: Metadata = { title: "Withdraw" };
export const dynamic = "force-dynamic";

const STATUS_MEANING: Record<string, string> = {
  PENDING: "Waiting for an operator to pick it up.",
  UNDER_REVIEW: "An operator is checking the details.",
  APPROVED: "Approved and queued for payout.",
  PROCESSING: "The transfer has been sent to the payment provider.",
  COMPLETED: "Sent. Check your account.",
  REJECTED: "Returned to your wallet with a reason.",
  CANCELLED: "Cancelled. The amount is back in your wallet.",
};

export default async function WithdrawPage() {
  const user = await requireUser();
  await releaseMaturedRewards(user.id);

  const [balances, settings, withdrawals, savedAccounts] = await Promise.all([
    getBalances(user.id),
    getSettings(),
    prisma.withdrawal.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.payoutAccount.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }),
  ]);

  const manualOnly = payoutStatuses().every((p) => !p.configured);

  // The member's effective fee, after any membership discount. Showing the
  // undiscounted figure here and charging a different one at submission is the
  // kind of mismatch that reads as a bug even when it is in their favour.
  const entitlements = await getEntitlements(user.id);
  const feeDiscount = Math.floor((settings.withdrawalFee * entitlements.withdrawalFeeDiscountBps) / 10_000);
  const effectiveFee = Math.max(0, settings.withdrawalFee - feeDiscount);

  // Crypto and Stripe are only offered once their gateway is actually
  // configured. Listing a rail that cannot pay out just creates support
  // tickets from members whose withdrawal sat unprocessed.
  const methodOptions = [
    { method: "JAZZCASH", name: "JazzCash" },
    { method: "EASYPAISA", name: "Easypaisa" },
    { method: "BANK_TRANSFER", name: "Bank transfer" },
    ...payoutStatuses()
      .filter((p) => p.configured && (p.method === "CRYPTO_USDT" || p.method === "STRIPE"))
      .map((p) => ({ method: p.method, name: p.name })),
  ];

  return (
    <>
      <PageHeader
        title="Withdraw"
        description="Cash out to JazzCash, Easypaisa, a bank account, or USDT where that is available."
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Request a payout</CardTitle>
            </CardHeader>
            <CardContent>
              <WithdrawForm
                withdrawable={balances.withdrawableBalance}
                minimum={settings.minimumWithdrawal}
                maximum={settings.maximumWithdrawal}
                fee={effectiveFee}
                methods={methodOptions}
                savedAccounts={savedAccounts.map((a) => ({
                  id: a.id,
                  method: a.method,
                  accountName: a.accountName,
                  accountNumber: a.accountNumber,
                  bankName: a.bankName,
                  network: a.network,
                }))}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Your requests</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {withdrawals.length === 0 ? (
                <EmptyState
                  icon={Banknote}
                  title="No withdrawals yet"
                  description="Your first payout request will appear here with its full status history."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Reference</TableHead>
                      <TableHead>Requested</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {withdrawals.map((withdrawal) => (
                      <TableRow key={withdrawal.id}>
                        <TableCell className="money text-xs">{withdrawal.reference}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {formatDateTime(withdrawal.createdAt)}
                        </TableCell>
                        <TableCell className="text-xs">{withdrawal.method.replace("_", " ")}</TableCell>
                        <TableCell className="text-right money font-medium">
                          {formatMoney(withdrawal.netAmount)}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <StatusBadge status={withdrawal.status} />
                            <span className="text-xs text-muted-foreground">
                              {withdrawal.rejectionReason ?? STATUS_MEANING[withdrawal.status]}
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>The rules</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Row label="Withdrawable now" value={formatMoney(balances.withdrawableBalance)} strong />
              <Row label="Still pending" value={formatMoney(balances.pendingBalance)} />
              <Row label="Smallest request" value={formatMoney(settings.minimumWithdrawal)} />
              <Row label="Largest request" value={formatMoney(settings.maximumWithdrawal)} />
              <Row label="Fee per request" value={formatMoney(settings.withdrawalFee)} />
              <Row label="Daily limit" value={formatMoney(settings.dailyWithdrawalLimit)} />
            </CardContent>
          </Card>

          {manualOnly ? (
            <Alert variant="info">
              <AlertTitle>Payouts are processed by hand</AlertTitle>
              <AlertDescription>
                No payment provider is connected on this deployment, so an operator sends each transfer manually.
                Nothing is simulated — a request marked completed means the money was actually sent.
              </AlertDescription>
            </Alert>
          ) : null}

          <Alert variant="warning">
            <AlertTitle>Use your own account</AlertTitle>
            <AlertDescription>
              Payout details must belong to you and match your account name. Details shared across accounts get flagged
              and held for review.
            </AlertDescription>
          </Alert>
        </div>
      </div>
    </>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? "money font-semibold" : "money"}>{value}</span>
    </div>
  );
}
