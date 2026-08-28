import { z } from "zod";

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address.");

export const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters.")
  .regex(/[A-Z]/, "Add an uppercase letter.")
  .regex(/[a-z]/, "Add a lowercase letter.")
  .regex(/[0-9]/, "Add a number.");

export const phoneSchema = z
  .string()
  .trim()
  .min(7, "Enter your mobile number.")
  .max(20, "That number looks too long.")
  .regex(/^[+0-9][0-9\s-]{6,19}$/, "Use digits, spaces or dashes only.");

export const registerSchema = z
  .object({
    fullName: z.string().trim().min(2, "Enter your full name.").max(120),
    email: emailSchema,
    phone: phoneSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
    referralCode: z.string().trim().toUpperCase().max(16).optional().or(z.literal("")),
    country: z.string().trim().min(2, "Choose your country.").max(56),
    acceptTerms: z.literal(true, { errorMap: () => ({ message: "Accept the terms to continue." }) }),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "Both passwords must match.",
    path: ["confirmPassword"],
  });

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password."),
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z
  .object({
    token: z.string().min(10, "This reset link is not valid."),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "Both passwords must match.",
    path: ["confirmPassword"],
  });

export const startTaskSchema = z.object({ campaignId: z.string().uuid() });

export const completeTaskSchema = z.object({
  sessionId: z.string().uuid(),
  nonce: z.string().min(10),
  watchedSeconds: z.number().int().min(0).max(24 * 3600),
});

/**
 * What the open task page reports about its own window.
 *
 * Every field is bounded here and clamped again server-side against the real
 * time that passed, so a crafted payload buys nothing. The schema exists to
 * reject nonsense early, not as the security boundary.
 */
export const heartbeatSchema = z.object({
  sessionId: z.string().uuid(),
  nonce: z.string().min(10),
  report: z
    .object({
      activeMs: z.number().int().min(0).max(10 * 60_000),
      hiddenMs: z.number().int().min(0).max(10 * 60_000),
      focusLost: z.number().int().min(0).max(200),
      blurred: z.number().int().min(0).max(200),
      visible: z.boolean(),
    })
    .optional(),
});

export const startSurveySchema = z.object({ surveyId: z.string().uuid() });

export const cryptoNetworkSchema = z.enum(["TRC20", "ERC20", "BEP20", "POLYGON"]);

export const payoutMethodSchema = z.enum([
  "JAZZCASH",
  "EASYPAISA",
  "BANK_TRANSFER",
  "CRYPTO_USDT",
  "STRIPE",
]);

export const withdrawalSchema = z
  .object({
    amount: z.number().int().positive("Enter an amount to withdraw."),
    method: payoutMethodSchema,
    accountName: z.string().trim().min(2, "Enter the account holder's name.").max(120),
    accountNumber: z
      .string()
      .trim()
      .min(6, "Enter the account, mobile number or wallet address.")
      // Wallet addresses are longer than a bank account and are case-sensitive
      // on some chains, so the length ceiling had to rise and the alphabet stays
      // exact — no trimming or case folding of an address, ever.
      .max(120)
      .regex(/^[A-Za-z0-9-]+$/, "Use letters, numbers and dashes only."),
    bankName: z.string().trim().max(120).optional(),
    network: cryptoNetworkSchema.optional(),
    saveAccount: z.boolean().optional().default(false),
  })
  .refine((v) => v.method !== "CRYPTO_USDT" || Boolean(v.network), {
    message: "Choose the network your USDT address is on.",
    path: ["network"],
  });

export const userTierSchema = z.enum(["FREE", "SILVER", "GOLD", "DIAMOND"]);

export const tierPurchaseSchema = z.object({
  tier: userTierSchema.refine((t) => t !== "FREE", "Free is the default membership."),
  /** "wallet" pays from the earned balance; "deposit" opens a gateway payment. */
  payWith: z.enum(["wallet", "deposit"]),
  method: z.enum(["CRYPTO_USDT", "STRIPE"]).optional(),
  network: cryptoNetworkSchema.optional(),
  /** Identifies one submission attempt so a retry cannot charge twice. */
  requestId: z.string().uuid("A request id is required."),
});

export const supportTicketSchema = z.object({
  subject: z.string().trim().min(4, "Give the ticket a subject.").max(140),
  category: z.enum(["GENERAL", "REWARDS", "WITHDRAWALS", "ACCOUNT", "TECHNICAL"]).default("GENERAL"),
  message: z.string().trim().min(10, "Describe the problem in a little more detail.").max(4000),
});

export const supportReplySchema = z.object({
  message: z.string().trim().min(1, "Write a reply.").max(4000),
});

export const contactSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: emailSchema,
  subject: z.string().trim().min(4).max(140),
  message: z.string().trim().min(10).max(4000),
});

export const campaignSchema = z.object({
  name: z.string().trim().min(3, "Name the campaign.").max(140),
  advertiser: z.string().trim().min(2, "Name the advertiser.").max(140),
  description: z.string().trim().min(10, "Describe what the viewer should do.").max(2000),
  videoUrl: z.string().url("Enter the full video URL."),
  thumbnailUrl: z.string().url().optional().or(z.literal("")),
  rewardAmount: z.number().int().positive("Set a reward above zero."),
  requiredWatchSeconds: z.number().int().min(5).max(3600),
  totalBudget: z.number().int().positive("Set a budget."),
  dailyQuota: z.number().int().positive(),
  totalQuota: z.number().int().positive(),
  targetCountries: z.array(z.string().min(2).max(56)).default([]),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  status: z
    .enum(["DRAFT", "PENDING_REVIEW", "ACTIVE", "PAUSED", "COMPLETED", "EXPIRED", "REJECTED"])
    .default("DRAFT"),
});

export const campaignUpdateSchema = campaignSchema.partial();

export const adminUserUpdateSchema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED", "UNDER_REVIEW", "BANNED"]).optional(),
  verifyEmail: z.boolean().optional(),
  note: z.string().trim().max(500).optional(),
});

export const adminWithdrawalUpdateSchema = z.object({
  action: z.enum(["APPROVE", "PROCESS", "COMPLETE", "REJECT"]),
  reason: z.string().trim().max(500).optional(),
  providerReference: z.string().trim().max(140).optional(),
});

export const settingsUpdateSchema = z.object({
  updates: z.array(z.object({ key: z.string().min(1), value: z.string().min(1) })).min(1),
});

export const adminAdjustmentSchema = z.object({
  email: z.string().trim().email("Enter the member's email address."),
  amount: z
    .number()
    .int("Amounts are handled in minor units.")
    .refine((value) => value !== 0, "An adjustment of zero does nothing."),
  bucket: z.enum(["AVAILABLE", "PENDING", "BONUS", "REFERRAL"]).default("AVAILABLE"),
  reason: z.string().trim().min(5, "Write a reason someone can understand later.").max(500),
  // Identifies one submission attempt so a retry cannot move the money twice.
  requestId: z.string().uuid("A request id is required."),
});

export const broadcastSchema = z.object({
  audience: z.enum(["ALL", "ACTIVE", "UNDER_REVIEW", "WITH_BALANCE"]),
  title: z.string().trim().min(3, "Give the announcement a title.").max(140),
  body: z.string().trim().min(5, "Write the message.").max(2000),
  href: z.string().trim().max(300).optional().or(z.literal("")),
  email: z.boolean().default(false),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type WithdrawalInput = z.infer<typeof withdrawalSchema>;
export type CampaignInput = z.infer<typeof campaignSchema>;
export type SupportTicketInput = z.infer<typeof supportTicketSchema>;
