import "server-only";
import { prisma } from "./prisma";
import type { SettingType } from "@prisma/client";

/**
 * Platform settings. Money values are minor units (paisa), durations are minutes.
 *
 * Money only ever moves one way by default: the platform pays members. The one
 * exception is a membership fee — a fixed charge for a larger daily allowance,
 * switched off unless `enableMemberships` says otherwise. There is deliberately
 * no staking, yield, ROI or "investment package" setting, and no way to hold a
 * member's money on account: see src/lib/tiers.ts for why that boundary is
 * enforced in code rather than left to configuration.
 */
export type PlatformSettings = {
  minimumWithdrawal: number;
  maximumWithdrawal: number;
  withdrawalFee: number;
  dailyWithdrawalLimit: number;
  referralReward: number;
  referralPercentage: number; // basis points of referee task/survey rewards
  maximumReferralReward: number;
  referralQualifyingEarnings: number;
  taskRewardDefault: number;
  pendingRewardCooldown: number; // minutes
  enableSurveys: boolean;
  enableVideoTasks: boolean;
  enableReferrals: boolean;
  enableMemberships: boolean;
};

export const SETTING_DEFINITIONS: {
  key: keyof PlatformSettings;
  type: SettingType;
  label: string;
  description: string;
  group: string;
  value: string;
}[] = [
  { key: "minimumWithdrawal", type: "INT", value: "50000", group: "withdrawals", label: "Smallest withdrawal", description: "Minor units. 50000 = PKR 500." },
  { key: "maximumWithdrawal", type: "INT", value: "5000000", group: "withdrawals", label: "Largest withdrawal", description: "Minor units per request." },
  { key: "withdrawalFee", type: "INT", value: "2500", group: "withdrawals", label: "Withdrawal fee", description: "Flat fee in minor units, charged on top of the requested amount." },
  { key: "dailyWithdrawalLimit", type: "INT", value: "10000000", group: "withdrawals", label: "Daily withdrawal limit", description: "Total minor units a user may request in 24 hours." },
  { key: "referralReward", type: "INT", value: "10000", group: "referrals", label: "Referral reward", description: "One-off reward once a referred user qualifies." },
  { key: "referralPercentage", type: "INT", value: "500", group: "referrals", label: "Referral share", description: "Basis points of a referred user's rewards. 500 = 5%." },
  { key: "maximumReferralReward", type: "INT", value: "500000", group: "referrals", label: "Referral cap", description: "Most a single referral can ever pay out." },
  { key: "referralQualifyingEarnings", type: "INT", value: "20000", group: "referrals", label: "Qualifying earnings", description: "A referred user must earn this much before the referrer is paid." },
  { key: "taskRewardDefault", type: "INT", value: "1500", group: "tasks", label: "Default task reward", description: "Prefilled when creating a campaign." },
  { key: "pendingRewardCooldown", type: "INT", value: "1440", group: "tasks", label: "Verification hold", description: "Minutes a reward stays pending before it clears." },
  { key: "enableSurveys", type: "BOOLEAN", value: "true", group: "modules", label: "Surveys", description: "Show the surveys module to users." },
  { key: "enableVideoTasks", type: "BOOLEAN", value: "true", group: "modules", label: "Video tasks", description: "Show the video tasks module to users." },
  { key: "enableReferrals", type: "BOOLEAN", value: "true", group: "modules", label: "Referrals", description: "Show the referral programme to users." },
  { key: "enableMemberships", type: "BOOLEAN", value: "false", group: "modules", label: "Paid memberships", description: "Let members buy a higher daily task allowance. Off until a payment gateway is live." },
];

const DEFAULTS = Object.fromEntries(
  SETTING_DEFINITIONS.map((d) => [d.key, d.type === "BOOLEAN" ? d.value === "true" : Number(d.value)]),
) as unknown as PlatformSettings;

export async function getSettings(): Promise<PlatformSettings> {
  const rows = await prisma.systemSetting.findMany();
  const settings = { ...DEFAULTS };
  for (const row of rows) {
    const definition = SETTING_DEFINITIONS.find((d) => d.key === row.key);
    if (!definition) continue;
    (settings as Record<string, unknown>)[row.key] =
      definition.type === "BOOLEAN" ? row.value === "true" : Number(row.value);
  }
  return settings;
}

export async function updateSetting(key: string, value: string) {
  const definition = SETTING_DEFINITIONS.find((d) => d.key === key);
  if (!definition) throw new Error(`Unknown setting: ${key}`);
  if (definition.type === "INT" && !/^\d+$/.test(value)) {
    throw new Error(`${definition.label} must be a whole number.`);
  }
  return prisma.systemSetting.upsert({
    where: { key },
    update: { value },
    create: {
      key,
      value,
      type: definition.type,
      label: definition.label,
      description: definition.description,
      group: definition.group,
    },
  });
}

export async function seedSettings() {
  for (const d of SETTING_DEFINITIONS) {
    await prisma.systemSetting.upsert({
      where: { key: d.key },
      update: { label: d.label, description: d.description, group: d.group, type: d.type },
      create: { key: d.key, value: d.value, type: d.type, label: d.label, description: d.description, group: d.group },
    });
  }
}
