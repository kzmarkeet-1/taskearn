import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatMoney } from "@/lib/money";
import { formatDate, formatDateTime, titleCase } from "@/lib/utils";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UserActions } from "./user-actions";

export const metadata: Metadata = { title: "User" };
export const dynamic = "force-dynamic";

export default async function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;

  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      wallet: true,
      riskScore: true,
      transactions: { orderBy: { createdAt: "desc" }, take: 30 },
      withdrawals: { orderBy: { createdAt: "desc" }, take: 20 },
      taskCompletions: { orderBy: { createdAt: "desc" }, take: 20, include: { campaign: { select: { name: true } } } },
      surveyCompletions: { orderBy: { createdAt: "desc" }, take: 20, include: { provider: { select: { name: true } } } },
      fraudEvents: { orderBy: { createdAt: "desc" }, take: 20 },
      referralsMade: { include: { referee: { select: { fullName: true } } }, take: 20 },
    },
  });

  if (!user) notFound();

  return (
    <>
      <PageHeader
        title={user.fullName}
        description={`${user.email} · ${user.phone} · ${user.country} · joined ${formatDate(user.createdAt)}`}
        action={
          <Button variant="outline" asChild>
            <Link href="/admin/users">Back to users</Link>
          </Button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Wallet</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Figure label="Available" value={formatMoney(user.wallet?.availableBalance ?? 0)} />
              <Figure label="Pending" value={formatMoney(user.wallet?.pendingBalance ?? 0)} />
              <Figure label="Bonus" value={formatMoney(user.wallet?.bonusBalance ?? 0)} />
              <Figure label="Referral" value={formatMoney(user.wallet?.referralBalance ?? 0)} />
              <Figure label="Lifetime earned" value={formatMoney(user.wallet?.lifetimeEarned ?? 0)} />
              <Figure label="Lifetime withdrawn" value={formatMoney(user.wallet?.lifetimeWithdrawn ?? 0)} />
            </CardContent>
          </Card>

          <Tabs defaultValue="transactions">
            <TabsList className="flex-wrap">
              <TabsTrigger value="transactions">Transactions</TabsTrigger>
              <TabsTrigger value="withdrawals">Withdrawals</TabsTrigger>
              <TabsTrigger value="tasks">Tasks</TabsTrigger>
              <TabsTrigger value="surveys">Surveys</TabsTrigger>
              <TabsTrigger value="referrals">Referrals</TabsTrigger>
              <TabsTrigger value="fraud">Risk</TabsTrigger>
            </TabsList>

            <TabsContent value="transactions">
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>When</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Bucket</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Balance after</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {user.transactions.map((transaction) => (
                        <TableRow key={transaction.id}>
                          <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                            {formatDateTime(transaction.createdAt)}
                          </TableCell>
                          <TableCell className="max-w-xs truncate">{transaction.description}</TableCell>
                          <TableCell className="text-xs">{titleCase(transaction.bucket)}</TableCell>
                          <TableCell className="money text-right">
                            {transaction.amount > 0 ? "+" : "−"}
                            {formatMoney(Math.abs(transaction.amount), { withCurrency: false })}
                          </TableCell>
                          <TableCell className="money text-right text-muted-foreground">
                            {formatMoney(transaction.balanceAfter, { withCurrency: false })}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="withdrawals">
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Reference</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead className="text-right">Net</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {user.withdrawals.map((withdrawal) => (
                        <TableRow key={withdrawal.id}>
                          <TableCell className="money text-xs">{withdrawal.reference}</TableCell>
                          <TableCell className="text-xs">{withdrawal.method.replace("_", " ")}</TableCell>
                          <TableCell className="money text-right">{formatMoney(withdrawal.netAmount)}</TableCell>
                          <TableCell>
                            <StatusBadge status={withdrawal.status} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="tasks">
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Campaign</TableHead>
                        <TableHead>Watched</TableHead>
                        <TableHead className="text-right">Reward</TableHead>
                        <TableHead>When</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {user.taskCompletions.map((completion) => (
                        <TableRow key={completion.id}>
                          <TableCell>{completion.campaign.name}</TableCell>
                          <TableCell className="money">{completion.watchedSeconds}s</TableCell>
                          <TableCell className="money text-right">{formatMoney(completion.rewardAmount)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatDateTime(completion.createdAt)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="surveys">
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Provider</TableHead>
                        <TableHead>Transaction</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Reward</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {user.surveyCompletions.map((completion) => (
                        <TableRow key={completion.id}>
                          <TableCell>{completion.provider.name}</TableCell>
                          <TableCell className="money text-xs">{completion.transactionId}</TableCell>
                          <TableCell>
                            <StatusBadge status={completion.status} />
                          </TableCell>
                          <TableCell className="money text-right">{formatMoney(completion.rewardAmount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="referrals">
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invited member</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Paid out</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {user.referralsMade.map((referral) => (
                        <TableRow key={referral.id}>
                          <TableCell>{referral.referee.fullName}</TableCell>
                          <TableCell>
                            <StatusBadge status={referral.status} />
                          </TableCell>
                          <TableCell className="money text-right">{formatMoney(referral.rewardAmount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="fraud">
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>When</TableHead>
                        <TableHead>Signal</TableHead>
                        <TableHead>Level</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {user.fraudEvents.map((event) => (
                        <TableRow key={event.id}>
                          <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                            {formatDateTime(event.createdAt)}
                          </TableCell>
                          <TableCell>{event.summary}</TableCell>
                          <TableCell>
                            <StatusBadge status={event.level} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Account</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Status</span>
                <StatusBadge status={user.status} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Risk</span>
                <StatusBadge status={user.riskScore?.level ?? "LOW"} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Email confirmed</span>
                <span>{user.emailVerifiedAt ? formatDate(user.emailVerifiedAt) : "Not yet"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Last sign-in</span>
                <span>{user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "Never"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Referral code</span>
                <span className="money">{user.referralCode}</span>
              </div>
            </CardContent>
          </Card>

          <UserActions userId={user.id} status={user.status} emailVerified={Boolean(user.emailVerifiedAt)} />
        </div>
      </div>
    </>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 money font-semibold">{value}</p>
    </div>
  );
}
