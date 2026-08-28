# Upgrading an existing TaskEarn database

Everything added in this change is additive: no column was dropped, renamed or
retyped, and no existing row needs rewriting. An existing deployment can take it
with a normal migration.

```bash
npx prisma migrate dev --name memberships-crypto-anticheat   # development
npx prisma migrate deploy                                    # production
npm run db:seed                                              # writes the tier plans
```

`db:seed` is safe to run against a live database: `seedTierPlans()` upserts and
touches nothing else. Skipping it leaves `tier_plans` empty, and every member
falls back to the Free defaults compiled into `src/lib/tier-plans.ts` — degraded,
but not broken.

## What the migration adds

| Area | Change |
| --- | --- |
| `users` | `tier` (defaults to `FREE`), `tierExpiresAt` |
| `task_sessions` | `activeSeconds`, `hiddenSeconds`, `focusLostCount`, `blurCount`, `maxGapSeconds`, `lastHeartbeatAt`, `integrityScore`, `integrityFlags` |
| `survey_completions` | `clickId` (unique, nullable) |
| `withdrawals` | `network`, `cryptoAsset`, `cryptoAmount`, `txHash`, `confirmations` |
| `wallet_transactions` | `externalTxHash`, `externalNetwork` |
| `payout_accounts` | `network` |
| New tables | `tier_plans`, `tier_subscriptions`, `deposits`, `payment_webhook_events` |
| New enum values | `PayoutMethod.CRYPTO_USDT`, `PayoutMethod.STRIPE`, `TransactionType.TIER_PURCHASE`, four `NotificationType` values, `FraudEventType.SESSION_INTEGRITY_FAILURE` |

## Behaviour that changes for existing members

**Daily task and survey limits now exist.** Every account starts on `FREE`,
which allows 5 tasks and 3 surveys a day. Before this change there was no
per-member cap at all, only per-campaign quotas.

*On a fresh deployment there is nothing to do here* — 5 and 3 are the intended
starting values and members join straight into them.

*On a database that already has active members*, check what they actually do
before deploying. If they routinely complete more than five tasks a day, raise
the Free plan first or a lot of people hit a wall on day one:

```sql
-- Only if existing members already exceed the defaults.
UPDATE tier_plans SET "dailyTaskLimit" = 25, "dailySurveyLimit" = 15 WHERE tier = 'FREE';
```

A quick way to find out whether you need it:

```sql
SELECT MAX(daily) AS busiest_member_day
FROM (
  SELECT "userId", DATE("createdAt") AS d, COUNT(*) AS daily
  FROM task_completions
  WHERE "createdAt" > NOW() - INTERVAL '30 days'
  GROUP BY 1, 2
) t;
```

If that returns 5 or less, the defaults are already wider than anyone's real
usage and no change is needed.

**Task sessions are now scored on visible time, not just elapsed time.** A
session must have been genuinely visible for 80% of the required duration. Older
browser sessions that predate the tracker report no visibility data and are
still accepted on the old rules — see `NO_VISIBILITY_DATA` in
`src/lib/integrity-rules.ts` — so nobody mid-task is cut off by the deploy.

**Withdrawal fees can now be discounted.** A member on a paid tier pays less.
On a database with no paid tiers, the fee is unchanged.

## What does not change

Balances, ledger rows, withdrawal history and referral records are untouched. A
membership ending returns a member to the Free allowance and does nothing to
their money.
