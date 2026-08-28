# TaskEarn

A task-and-rewards platform. Members earn by watching sponsored video campaigns and by completing surveys they qualify for with third-party research panels. Advertisers and panels pay in; members are paid out; the platform keeps the difference.

Built with Next.js 15 (App Router), TypeScript, Tailwind, Prisma and PostgreSQL.

---

## What this is, and what it deliberately is not

This is an advertising and market-research payout platform. That shapes every decision in the codebase:

- **Members never fund a balance.** There is no wallet top-up. The one payment a member can make is a *membership fee* — a fixed charge for a fixed term that raises their daily task and survey allowance. That money buys capacity; it never becomes spendable balance, and there is no path in the schema from a `Deposit` to a `Withdrawal`.
- **No staking, yield, ROI, or investment mechanics.** Crypto exists here as a payment rail (USDT in, USDT out), and nothing more. A membership tier is a subscription, not a node, a package or a stake: it pays no return, accrues nothing by being held, and unlocks no downline commission. `assertPlanIsNotYield()` in `src/lib/tier-plans.ts` refuses at runtime to activate a plan whose earnings cap could repay its own price — the point at which a subscription becomes a deposit-funded yield product, which is illegal in most jurisdictions and grounds for immediate termination by Stripe and by every survey panel.
- **No fake numbers.** There are no invented earnings counters, no fabricated testimonials, no income guarantees. Every figure on a page is read from the database, and an empty database shows zeros.
- **No engagement manipulation.** Campaigns pay for a person's attention, not for a metric on someone else's platform. There is no automation, no bot viewing, and no anti-fraud circumvention. Campaign review exists to reject anything designed to inflate view counts or watch time.
- **Referrals are one level deep.** A member earns from people they invited and from nobody further down. The schema has no parent chain to walk, which is what makes a downline structurally impossible rather than merely discouraged.
- **Nothing is simulated.** An unconfigured survey panel offers no surveys and credits nothing. An unconfigured payment provider means payouts are sent by hand and recorded afterwards — marking a withdrawal complete does not move money by itself.

---

## Architecture

```
src/
  app/
    (marketing)/         public pages — home, how-it-works, earn, surveys,
                         advertisers, faq, about, contact, legal
    (auth)/              register, login, forgot-password, reset-password
    dashboard/           member area — overview, tasks, surveys, wallet,
                         withdraw, referrals, notifications, support
    admin/               operator area — 16 sections, see below
    api/                 route handlers, including signed survey webhooks
  components/
    ui/                  hand-written shadcn-style primitives
    site/                marketing header, footer, prose
    dashboard/           app shell, nav config, stat card, page header
  lib/
    wallet.ts            the ledger — every balance movement lives here
    tasks.ts             session lifecycle and server-side timing
    surveys/             provider abstraction + CPX, Pollfish, BitLabs adapters
    payouts/             JazzCash, Easypaisa, bank transfer abstraction
    referrals.ts         single-level referral logic
    fraud.ts             risk signals and scoring
    settings.ts          platform settings with typed definitions
    reports.ts           aggregate reporting and CSV rows
    auth.ts, jwt.ts      session handling
    money.ts             minor-unit helpers
prisma/
  schema.prisma          23 models
  seed.ts                demo data
tests/                   Vitest — ledger, task timing, referrals
e2e/                     Playwright — member and admin journeys
```

### Money

Every amount in the system is an **integer in minor units** — 100 means PKR 1.00. No float ever touches a balance. `src/lib/money.ts` holds the conversion and formatting helpers, and CSV exports convert to major units at the boundary so spreadsheets read naturally.

### The ledger

`src/lib/wallet.ts` is the single place balances change. It is worth reading before changing anything financial.

- Every movement writes a `WalletTransaction` row carrying the balance it left behind. Rows are **append-only** — a correction is a new row, never an edit.
- Every movement carries a unique `idempotencyKey`. A replayed webhook, a double-clicked button or a retried request produces one row, not two. The unique constraint is the real guard; the pre-check is only an optimisation.
- Debits use conditional `updateMany` guards (`{ [field]: { gte: required } }`) inside a transaction, so two concurrent requests cannot both succeed and drive a balance negative.
- Balances live in four buckets: **pending** (earned, still inside the verification hold), **available**, **bonus** and **referral**. Withdrawable means available + bonus + referral, debited in that order, one row per bucket touched.
- Rejecting or cancelling a withdrawal refunds the **gross** amount, fee included.
- Withdrawal status changes are conditional updates, not read-then-write. The status test is part of the `UPDATE`, so two operators clicking at the same instant cannot both apply a transition — which for `COMPLETED` would otherwise double-count what a member has been paid.
- The completion row and its reward are written in two steps, because the ledger opens its own transaction and Prisma will not nest them. `reconcileMissingTaskRewards()` closes the resulting crash window and runs as part of scheduled maintenance.

### Task verification

The countdown a member sees is a convenience. The reward decision is made server-side from the session's own `startedAt` and heartbeat record. Changing the system clock, closing the tab, or posting a fabricated `watchedSeconds` does not shorten the required viewing time — the server compares against its own clock and rejects anything short. Each campaign pays a given member once, enforced by a unique constraint on `(userId, campaignId)`.

### Survey webhooks

Panel callbacks arrive at `/api/webhooks/surveys/[provider]`. Each delivery is signature-verified by the relevant adapter and recorded in `WebhookEvent` before anything is credited. Duplicates are caught twice over: a unique constraint on `(providerSlug, eventId)` for the delivery, and a unique constraint on `(providerId, transactionId)` for the completion. An unsigned or mis-signed delivery is logged and rejected.

---

## Getting it running

### Requirements

- Node 20.11 or newer
- PostgreSQL 14 or newer

### Install

```bash
npm install
```

### Configure

```bash
cp .env.example .env
```

Then fill in `.env`:

| Variable | Required | What it does |
| --- | --- | --- |
| `DATABASE_URL` | **yes** | PostgreSQL connection string |
| `AUTH_SECRET` | **yes** | JWT signing secret. Generate with `openssl rand -base64 32` |
| `NEXT_PUBLIC_APP_URL` | **yes** | Public origin, e.g. `http://localhost:3000`. Used for referral links and webhook URLs |
| `AUTH_COOKIE_NAME` | no | Session cookie name. Defaults to `taskearn_session` |
| `AUTH_SESSION_TTL_HOURS` | no | Session lifetime. Defaults to 168 (7 days) |
| `CPX_API_KEY`, `CPX_APP_ID` | no | CPX Research. Both must be set before CPX offers any surveys |
| `CPX_WEBHOOK_SECRET` | no | Shared secret for the CPX postback signature. Without it, CPX callbacks are rejected |
| `POLLFISH_API_KEY` | no | Pollfish |
| `POLLFISH_WEBHOOK_SECRET` | no | Shared secret for the Pollfish callback signature |
| `BITLABS_API_KEY` | no | BitLabs |
| `BITLABS_WEBHOOK_SECRET` | no | Shared secret for the BitLabs callback signature |
| `JAZZCASH_API_KEY`, `JAZZCASH_MERCHANT_ID` | no | JazzCash payouts. Without both, JazzCash payouts stay manual |
| `EASYPAISA_API_KEY`, `EASYPAISA_MERCHANT_ID` | no | Easypaisa payouts. Without both, Easypaisa payouts stay manual |
| `CRON_SECRET` | no | Bearer token for `/api/maintenance`. Unset disables that endpoint entirely |
| `EMAIL_FROM` | no | Sender address on outbound mail |
| `EMAIL_PROVIDER_API_KEY` | no | Outbound email. Without it, notifications are queued in the database and marked unsent |

An API key and its webhook secret are separate concerns: the key is what the platform uses to *ask* a panel for surveys, the webhook secret is what the panel uses to *prove* a callback came from them. Setting one without the other leaves half the integration inert, which the providers page reports honestly rather than hiding.

The app boots and works with only the three required variables set. Optional integrations announce themselves as unconfigured rather than pretending to work.

### Set up the database

```bash
npm run db:migrate       # creates the schema
npm run db:seed          # optional: demo data
```

`db:migrate` runs `prisma migrate dev`, which will create an initial migration on first run. For an existing deployment use `npm run db:deploy`.

### Run

```bash
npm run dev              # http://localhost:3000
```

### Demo logins

Available after `npm run db:seed`. Every seeded record is marked `isDemo` and prefixed `[DEMO]` where it is user-visible.

| Role | Email | Password |
| --- | --- | --- |
| Administrator | `admin@demo.taskearn.app` | `AdminPass123` |
| Member | `ayesha@demo.taskearn.app` | `DemoPass123` |
| Member | `bilal@demo.taskearn.app` | `DemoPass123` |
| Member | `sana@demo.taskearn.app` | `DemoPass123` |
| Member | `usman@demo.taskearn.app` | `DemoPass123` |
| Member | `hira@demo.taskearn.app` | `DemoPass123` |

Change these before deploying anywhere reachable.

---

## Admin panel

`/admin`, gated on the `ADMIN` role in both middleware and the layout itself.

Dashboard · Users · Campaigns · Tasks · Surveys · Survey providers · Wallet · Transactions · Withdrawals · Referrals · Fraud detection · Support · Reports · Notifications · Settings · Audit logs

Every administrative action writes an `AuditLog` entry with before and after state. Audit entries cannot be edited or deleted from the panel.

### Settings

Configurable at runtime from `/admin/settings`: minimum and maximum withdrawal, withdrawal fee, daily withdrawal limit, referral reward, referral percentage, referral cap, qualifying earnings, default task reward, verification hold, and module switches for surveys, video tasks and referrals.

### Reports

`/admin/reports` shows revenue against member rewards over 7, 30 or 90 days, plus campaign, survey, withdrawal and risk breakdowns. Every report exports as CSV in major units via `/api/admin/reports?format=csv&report=…`.

---

## Testing

```bash
npm run test             # Vitest — ledger, task timing, referrals
npm run test:e2e         # Playwright — member and admin journeys
npm run typecheck        # tsc --noEmit
npm run lint
```

The Vitest suite runs against a **real PostgreSQL database**, because the behaviour it checks — row locking, conditional updates, unique constraints under concurrency — only exists there. A mocked Prisma client would pass while the real thing failed. Point `TEST_DATABASE_URL` at a scratch database:

```bash
TEST_DATABASE_URL="postgresql://…/taskearn_test" npm run test
```

The Playwright suite expects the app running and, for the admin specs, the seed applied.

---

## Production build

```bash
npm run build            # runs prisma generate, then next build
npm run start
```

On the target environment, run migrations with `npm run db:deploy` rather than `db:migrate`.

### Before going live

- Set a strong, unique `AUTH_SECRET`. Rotating it signs everyone out, which is the intended behaviour.
- Set `NEXT_PUBLIC_APP_URL` to the real origin — referral links and the webhook URLs shown to panels are built from it.
- Delete or disable the seeded demo accounts.
- Serve over HTTPS. The session cookie is `httpOnly`, `sameSite=lax`, and `secure` outside development.
- Put the app behind a proxy that terminates TLS and sets `X-Forwarded-For`, since rate limiting and risk signals hash the client address.
- Replace the in-process rate limiter in `src/lib/rate-limit.ts` with a shared store (Redis or similar) if you run more than one instance. The interface is deliberately swappable.
- **Schedule `/api/maintenance`.** Set `CRON_SECRET` and call it every few minutes:

  ```bash
  curl -H "Authorization: Bearer $CRON_SECRET" https://your-host/api/maintenance
  ```

  It clears matured rewards into withdrawable balances, closes finished campaigns, repairs any task reward lost to a crash, and flushes queued mail. Every job is idempotent, so overlapping or retried runs are safe. With `CRON_SECRET` unset the endpoint returns 503 rather than running unauthenticated. Rewards also release opportunistically when a member opens their dashboard, so a late run delays money rather than losing it.

---

## Verification status

This project has **never been compiled, migrated, or executed.** It was completed in a sandbox with no package-registry access and no PostgreSQL, so `npm install`, `prisma generate`, `tsc`, `eslint`, Vitest, `next build` and Playwright have all never run against it. Treat it as reviewed source, not as tested software.

What *has* been verified is structural, via `npm run check:static` (which needs no dependencies installed):

- every TS/TSX file parses
- every local import resolves and every named import exists
- every Prisma model and field referenced in code exists in `schema.prisma`, checked recursively through relations
- no identifier is used without being declared or imported
- no client component reaches server-only code, even transitively
- every internal `href` and API path resolves to a real route

These catch structural mistakes. They know nothing about types. **Run `npm run typecheck` first** once dependencies are installed — it supersedes most of the above and will surface things these checks cannot see.

## Things still needing your attention

**Credentials you have to obtain.** Survey panels (CPX Research, Pollfish, BitLabs) each require a publisher account, an approved app, and a callback URL registered on their side — the exact URLs, with the parameter templates each panel expects, are written out in `.env.example` next to the keys they belong to. JazzCash and Easypaisa disbursement APIs require a merchant agreement; until one is in place, payouts are sent by hand and recorded in the admin panel, which is a legitimate way to run an MVP.

**Three integration details that will cost you an afternoon if you skip them.**

- *CPX uses two different hashes.* Outbound API calls sign `md5(ext_user_id-secret)`; inbound postbacks sign `md5(trans_id-secret)`. Swapping them fails silently in the direction you are not testing.
- *BitLabs signs the whole callback URL.* `hash` must remain the **last** parameter on the URL you configure, because verification reproduces everything before `&hash=`. Reordering the dashboard URL breaks every callback.
- *Pollfish signs values, not a URL.* It concatenates the substituted values of the template parameters in the order they appear in your postback URL, then HMAC-SHA1s the result. `POLLFISH_SIGNED_PARAMS` must list the same parameters in the same order, or nothing verifies.

**Payment gateways.** `CRYPTO_GATEWAY_*` assumes a hosted custodial processor: it issues the address, watches the chain and calls back. The platform holds no keys and signs no transactions, which is deliberate — self-custody would add key management, hot-wallet risk and, in most jurisdictions, a licence. The request and callback field names in `src/lib/payments/crypto.ts` follow the common shape used by NOWPayments, Coinbase Commerce and similar; if yours differs, change the mapping in that one file and nothing else needs to move.

**Membership fees are off by default.** `enableMemberships` is seeded to `false`. Everyone sits on the Free allowance until you switch it on in `/admin/settings`, and even then nothing can be purchased unless a gateway is configured.

**Legal and compliance, which the code cannot settle for you.**

- The terms, privacy policy and responsible-earnings pages are drafted as starting points, not as legal advice. Have a lawyer in your jurisdiction review them before launch.
- Paying individuals creates tax and reporting obligations in most jurisdictions, including Pakistan. Withholding thresholds, record-keeping and any requirement to collect tax identifiers are yours to establish.
- Handling names, phone numbers and payout details brings data-protection duties. The schema stores IP addresses only as salted hashes and does not fingerprint devices, but retention periods, deletion requests and lawful basis still need deciding.
- Money transmission rules vary. Paying earned rewards is usually distinct from operating a payment service, but confirm that locally before scaling. This is also why a membership fee is consumed immediately by the subscription it buys and is never held as a member balance — holding customer funds on account is the line that turns a platform into a regulated payment institution.
- **Selling memberships changes your regulatory position.** Taking money from members, in any amount and for any reason, brings consumer-protection and advertising rules into play that do not apply to a payout-only platform. Two specific things to get in writing from a lawyer before enabling `enableMemberships`: that a fixed-term allowance subscription is not a collective investment scheme under SECP rules, and that your marketing nowhere states or implies that a tier will earn its price back. The code refuses the worst configurations, but it cannot police your landing page.
- **Crypto payment rails carry their own licensing questions in Pakistan.** Accepting or sending USDT is not settled ground locally. Confirm the current position before turning either direction on.
- Advertisers must have the right to the content they submit, and their campaigns must respect the terms of whatever platform hosts the video. Campaign review is where that gets enforced — the `PENDING_REVIEW` status exists for exactly this.
- Age limits: decide your minimum age and enforce it at registration. The current schema does not collect a date of birth.
