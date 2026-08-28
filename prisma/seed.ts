/**
 * Demo seed.
 *
 * Everything created here is marked `isDemo` and named so it cannot be mistaken
 * for production data. Wallet balances are built by running real ledger
 * movements rather than by writing balance columns directly — that way the seed
 * exercises the same code paths the app uses, and the demo data is internally
 * consistent.
 *
 * Run with: npm run db:seed
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { seedSettings } from "../src/lib/settings";
import { syncProviderRows } from "../src/lib/surveys";
import { seedTierPlans } from "../src/lib/tiers";
import { creditPendingReward, releasePendingReward, creditReferralReward, createWithdrawal } from "../src/lib/wallet";
import { generateReferralCode, randomReference } from "../src/lib/crypto";

const prisma = new PrismaClient();

const DEMO_PASSWORD = "DemoPass123";
const ADMIN_PASSWORD = "AdminPass123";

const DEMO_USERS = [
  { fullName: "Ayesha Khan", email: "ayesha@demo.taskearn.app", phone: "+923001234501", country: "Pakistan" },
  { fullName: "Bilal Ahmed", email: "bilal@demo.taskearn.app", phone: "+923001234502", country: "Pakistan" },
  { fullName: "Sana Malik", email: "sana@demo.taskearn.app", phone: "+923001234503", country: "Pakistan" },
  { fullName: "Usman Raza", email: "usman@demo.taskearn.app", phone: "+923001234504", country: "Pakistan" },
  { fullName: "Hira Siddiqui", email: "hira@demo.taskearn.app", phone: "+923001234505", country: "Pakistan" },
];

const DEMO_CAMPAIGNS = [
  {
    name: "[DEMO] Solar panel explainer",
    advertiser: "Demo Advertiser — Solaris Energy",
    description:
      "Watch the explainer on rooftop solar sizing and note which panel tier the presenter recommends for a three-bedroom home.",
    videoUrl: "https://www.example.com/demo/solar-explainer",
    rewardAmount: 2000,
    requiredWatchSeconds: 60,
    totalBudget: 400_000,
    dailyQuota: 40,
    totalQuota: 200,
  },
  {
    name: "[DEMO] Mobile banking walkthrough",
    advertiser: "Demo Advertiser — Meezan Digital",
    description: "A walkthrough of the new transfer flow. Pay attention to where the confirmation screen appears.",
    videoUrl: "https://www.example.com/demo/banking-walkthrough",
    rewardAmount: 1500,
    requiredWatchSeconds: 45,
    totalBudget: 300_000,
    dailyQuota: 50,
    totalQuota: 200,
  },
  {
    name: "[DEMO] Small business accounting tips",
    advertiser: "Demo Advertiser — LedgerLite",
    description: "Five bookkeeping habits for a small shop. The reward is for watching, not for signing up to anything.",
    videoUrl: "https://www.example.com/demo/accounting-tips",
    rewardAmount: 1200,
    requiredWatchSeconds: 90,
    totalBudget: 240_000,
    dailyQuota: 30,
    totalQuota: 200,
  },
  {
    name: "[DEMO] Ramzan grocery campaign",
    advertiser: "Demo Advertiser — FreshCart",
    description: "A seasonal advert. Watch the full spot and note the delivery window offered at the end.",
    videoUrl: "https://www.example.com/demo/grocery-campaign",
    rewardAmount: 1000,
    requiredWatchSeconds: 30,
    totalBudget: 150_000,
    dailyQuota: 60,
    totalQuota: 150,
  },
  {
    name: "[DEMO] Road safety public service film",
    advertiser: "Demo Advertiser — SafeRoads Trust",
    description: "A short public service film on motorway lane discipline.",
    videoUrl: "https://www.example.com/demo/road-safety",
    rewardAmount: 2500,
    requiredWatchSeconds: 120,
    totalBudget: 500_000,
    dailyQuota: 20,
    totalQuota: 200,
  },
];

const DEMO_SURVEYS = [
  { name: "[DEMO] Household shopping habits", rewardAmount: 4500, estimatedMinutes: 12, loi: 12 },
  { name: "[DEMO] Mobile network satisfaction", rewardAmount: 3000, estimatedMinutes: 8, loi: 8 },
  { name: "[DEMO] Streaming subscriptions study", rewardAmount: 6000, estimatedMinutes: 18, loi: 18 },
  { name: "[DEMO] Commuting and transport", rewardAmount: 2500, estimatedMinutes: 6, loi: 6 },
  { name: "[DEMO] Online banking attitudes", rewardAmount: 5500, estimatedMinutes: 15, loi: 15 },
];

async function main() {
  console.log("Seeding TaskEarn demo data…\n");

  await seedSettings();
  console.log("  settings   · defaults written");

  await syncProviderRows();
  console.log("  providers  · survey provider rows synced to available credentials");

  // Tier plans are real configuration rather than demo data: the FREE row is
  // what every account falls back to, so it has to exist even on a clean
  // production database. Paid tiers stay dormant until `enableMemberships` is
  // switched on in settings.
  await seedTierPlans();
  console.log("  tiers      · membership plans written (paid tiers dormant until enabled)");

  // ---------------------------------------------------------------- admin
  const adminHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
  const admin = await prisma.user.upsert({
    where: { email: "admin@demo.taskearn.app" },
    update: {},
    create: {
      fullName: "Demo Administrator",
      email: "admin@demo.taskearn.app",
      phone: "+923001234500",
      country: "Pakistan",
      passwordHash: adminHash,
      role: "ADMIN",
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
      referralCode: generateReferralCode(),
      wallet: { create: {} },
      riskScore: { create: {} },
    },
  });
  console.log("  admin      · admin@demo.taskearn.app");

  // ---------------------------------------------------------------- members
  const memberHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const users = [];

  for (const demo of DEMO_USERS) {
    const user = await prisma.user.upsert({
      where: { email: demo.email },
      update: {},
      create: {
        ...demo,
        passwordHash: memberHash,
        status: "ACTIVE",
        emailVerifiedAt: new Date(),
        lastLoginAt: new Date(Date.now() - Math.random() * 5 * 24 * 3600_000),
        referralCode: generateReferralCode(),
        wallet: { create: {} },
        riskScore: { create: {} },
        profile: { create: { city: "Karachi", timezone: "Asia/Karachi" } },
      },
    });
    users.push(user);
  }
  console.log(`  members    · ${users.length} demo accounts`);

  // -------------------------------------------------------------- campaigns
  const campaigns = [];
  for (const demo of DEMO_CAMPAIGNS) {
    const existing = await prisma.campaign.findFirst({ where: { name: demo.name } });
    const campaign =
      existing ??
      (await prisma.campaign.create({
        data: {
          ...demo,
          status: "ACTIVE",
          isDemo: true,
          targetCountries: [],
          startDate: new Date(Date.now() - 7 * 24 * 3600_000),
          endDate: new Date(Date.now() + 30 * 24 * 3600_000),
        },
      }));
    campaigns.push(campaign);
  }
  console.log(`  campaigns  · ${campaigns.length} active demo campaigns`);

  // ---------------------------------------------------------------- surveys
  const provider = await prisma.surveyProvider.findFirst({ where: { slug: "cpx" } });
  if (provider) {
    for (const [index, demo] of DEMO_SURVEYS.entries()) {
      await prisma.survey.upsert({
        where: { providerId_externalId: { providerId: provider.id, externalId: `demo-${index + 1}` } },
        update: {},
        create: {
          providerId: provider.id,
          externalId: `demo-${index + 1}`,
          name: demo.name,
          rewardAmount: demo.rewardAmount,
          estimatedMinutes: demo.estimatedMinutes,
          loi: demo.loi,
          targetCountries: [],
          isDemo: true,
          // Demo surveys carry no click URL: without real credentials there is
          // nowhere legitimate to send anyone, and a fake destination would be
          // worse than an empty list.
          clickUrl: null,
          active: provider.configured,
        },
      });
    }
    console.log(
      `  surveys    · ${DEMO_SURVEYS.length} demo surveys (${provider.configured ? "live" : "inactive until CPX credentials are set"})`,
    );
  }

  // ------------------------------------------------------- earnings history
  // Rewards are credited as pending, then some are released, exactly as the
  // scheduled release would do in production.
  let movements = 0;

  for (const [userIndex, user] of users.entries()) {
    const completions = 3 + userIndex; // gives the demo accounts different histories

    for (let i = 0; i < completions; i += 1) {
      const campaign = campaigns[i % campaigns.length];
      const daysAgo = completions - i;

      const already = await prisma.taskCompletion.findUnique({
        where: { userId_campaignId: { userId: user.id, campaignId: campaign.id } },
      });
      if (already) continue;

      const createdAt = new Date(Date.now() - daysAgo * 24 * 3600_000);
      const watchedSeconds = campaign.requiredWatchSeconds + 5;

      // Every completion hangs off a session in production, so the seed builds
      // one too. Without it the row is unreachable from the admin task views
      // and `sessionId` is required anyway.
      const session = await prisma.taskSession.create({
        data: {
          userId: user.id,
          campaignId: campaign.id,
          status: "COMPLETED",
          nonce: randomReference("seed"),
          requiredSeconds: campaign.requiredWatchSeconds,
          watchedSeconds,
          activeSeconds: watchedSeconds,
          heartbeatCount: Math.ceil(watchedSeconds / 10),
          startedAt: createdAt,
          submittedAt: createdAt,
          completedAt: createdAt,
          expiresAt: new Date(createdAt.getTime() + 3600_000),
        },
      });

      await prisma.taskCompletion.create({
        data: {
          userId: user.id,
          campaignId: campaign.id,
          sessionId: session.id,
          rewardAmount: campaign.rewardAmount,
          watchedSeconds,
          createdAt,
        },
      });

      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { completedCount: { increment: 1 }, spentBudget: { increment: campaign.rewardAmount } },
      });

      const sourceKey = `seed:task:${user.id}:${campaign.id}`;

      await creditPendingReward({
        userId: user.id,
        amount: campaign.rewardAmount,
        type: "VIDEO_REWARD",
        description: `Reward for ${campaign.name}`,
        idempotencyKey: sourceKey,
        referenceType: "Campaign",
        referenceId: campaign.id,
      });
      movements += 1;

      // Anything older than two days has cleared its verification hold.
      if (daysAgo > 2) {
        await releasePendingReward({
          userId: user.id,
          amount: campaign.rewardAmount,
          type: "VIDEO_REWARD",
          sourceKey,
          description: `Reward cleared for ${campaign.name}`,
          referenceType: "Campaign",
          referenceId: campaign.id,
        });
        movements += 1;
      }
    }
  }
  console.log(`  ledger     · ${movements} wallet movements recorded`);

  // -------------------------------------------------------------- referrals
  const [referrer, ...referees] = users;
  for (const referee of referees.slice(0, 2)) {
    const existing = await prisma.referral.findUnique({ where: { refereeId: referee.id } });
    if (existing) continue;

    await prisma.referral.create({
      data: {
        referrerId: referrer.id,
        refereeId: referee.id,
        code: referrer.referralCode,
        status: "REWARDED",
        rewardAmount: 10_000,
        qualifiedAt: new Date(Date.now() - 3 * 24 * 3600_000),
        rewardedAt: new Date(Date.now() - 3 * 24 * 3600_000),
      },
    });

    const referralKey = `seed:referral:${referrer.id}:${referee.id}`;

    await creditReferralReward({
      userId: referrer.id,
      amount: 10_000,
      description: `Referral reward for ${referee.fullName}`,
      idempotencyKey: referralKey,
      referenceType: "Referral",
      referenceId: referee.id,
    });

    await releasePendingReward({
      userId: referrer.id,
      amount: 10_000,
      type: "REFERRAL_REWARD",
      sourceKey: referralKey,
      description: `Referral reward cleared for ${referee.fullName}`,
      referenceType: "Referral",
      referenceId: referee.id,
    });
  }
  console.log("  referrals  · 2 qualified referrals with rewards paid");

  // ------------------------------------------------------------ withdrawals
  const withdrawalUser = users[users.length - 1];
  const existingWithdrawal = await prisma.withdrawal.findFirst({ where: { userId: withdrawalUser.id } });

  if (!existingWithdrawal) {
    try {
      const withdrawal = await createWithdrawal({
        userId: withdrawalUser.id,
        netAmountRequested: 50_000,
        method: "JAZZCASH",
        accountName: withdrawalUser.fullName,
        accountNumber: "03001234505",
      });
      console.log(`  withdrawal · ${withdrawal.reference} pending review`);
    } catch (error) {
      // The last demo user may not have cleared enough balance yet; that is a
      // realistic outcome, not a seeding failure.
      console.log(`  withdrawal · skipped (${error instanceof Error ? error.message : "insufficient balance"})`);
    }
  }

  // A second withdrawal that is already completed, so the admin queue has history.
  const completedRef = randomReference("WD");
  const completedExists = await prisma.withdrawal.findFirst({
    where: { userId: users[0].id, status: "COMPLETED" },
  });
  if (!completedExists) {
    await prisma.withdrawal.create({
      data: {
        userId: users[0].id,
        reference: completedRef,
        grossAmount: 32_500,
        fee: 2_500,
        netAmount: 30_000,
        method: "EASYPAISA",
        accountName: users[0].fullName,
        accountNumber: "03001234501",
        status: "COMPLETED",
        reviewedById: admin.id,
        reviewedAt: new Date(Date.now() - 6 * 24 * 3600_000),
        processedAt: new Date(Date.now() - 6 * 24 * 3600_000),
        completedAt: new Date(Date.now() - 5 * 24 * 3600_000),
        providerReference: "DEMO-MANUAL-0001",
        createdAt: new Date(Date.now() - 7 * 24 * 3600_000),
      },
    });
  }

  // ----------------------------------------------------------- notifications
  for (const user of users) {
    const existing = await prisma.notification.findFirst({ where: { userId: user.id } });
    if (existing) continue;

    await prisma.notification.createMany({
      data: [
        {
          userId: user.id,
          type: "SYSTEM_ANNOUNCEMENT",
          title: "Welcome to the TaskEarn demo",
          body: "This account holds demo data only. Nothing here represents a real payment or a real advertiser.",
          href: "/dashboard",
        },
        {
          userId: user.id,
          type: "REWARD_CREDITED",
          title: "A reward cleared to your available balance",
          body: "Rewards sit in your pending balance during the verification hold, then move across automatically.",
          href: "/dashboard/wallet",
          createdAt: new Date(Date.now() - 2 * 24 * 3600_000),
        },
      ],
    });
  }
  console.log("  notices    · welcome and reward notifications sent");

  // --------------------------------------------------------------- support
  const ticketExists = await prisma.supportTicket.findFirst({ where: { userId: users[1].id } });
  if (!ticketExists) {
    await prisma.supportTicket.create({
      data: {
        userId: users[1].id,
        reference: randomReference("TK"),
        subject: "When does a pending reward clear?",
        category: "REWARDS",
        status: "WAITING_FOR_USER",
        messages: {
          create: [
            {
              authorId: users[1].id,
              body: "I finished a task yesterday and the reward is showing as pending rather than available. Is that expected?",
            },
            {
              authorId: admin.id,
              isStaff: true,
              body: "Yes — rewards stay pending for the verification hold set in platform settings, then move to your available balance on their own. Nothing is required from you.",
            },
          ],
        },
      },
    });
    console.log("  support    · 1 demo ticket with a staff reply");
  }

  console.log("\nDemo data ready.\n");
  console.log("  Admin  admin@demo.taskearn.app / " + ADMIN_PASSWORD);
  console.log("  Member ayesha@demo.taskearn.app / " + DEMO_PASSWORD);
  console.log("  (bilal, sana, usman and hira use the same member password)\n");
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
