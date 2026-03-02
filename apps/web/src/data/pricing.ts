export interface PricingPlan {
  id: "starter" | "pro" | "elite";
  name: string;
  priceMonthly: number;
  tagline: string;
  smsQuota: number;
  platformFeePercent: number;
  overagePerSms: number;
  ctaLabel: string;
  included: string[];
  recommended?: boolean;
}

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: "starter",
    name: "Starter",
    priceMonthly: 19,
    tagline: "Best for part-time coaches",
    smsQuota: 500,
    platformFeePercent: 10,
    overagePerSms: 0.015,
    ctaLabel: "Start Starter",
    included: [
      "Text-first AI Assistant (500/month)",
      "Assisted Scheduling",
      "Automated Bookings & Payments",
      "Basic assistant features",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    priceMonthly: 29,
    tagline: "Best for serious coaches",
    smsQuota: 2000,
    platformFeePercent: 8,
    overagePerSms: 0.012,
    ctaLabel: "Start Pro",
    included: [
      "Text-first AI Assistant (2,000/month)",
      "Professional Session Summaries",
      "Priority support",
      "Includes all Starter features",
    ],
    recommended: true,
  },
  {
    id: "elite",
    name: "Elite",
    priceMonthly: 59,
    tagline: "Best for high-volume trainers / academies",
    smsQuota: 5000,
    platformFeePercent: 5,
    overagePerSms: 0.01,
    ctaLabel: "Start Elite",
    included: [
      "Text-first AI Assistant (5,000/month)",
      "Session Planning",
      "Personalized Athlete Follow-ups",
      "Includes all Pro features",
    ],
  },
];

export const PRICING_FOOTNOTES = [
  "Assistant messages include both inbound and outbound client conversations.",
  "Standard card processing fees apply (Stripe). Coaches are responsible for Stripe processing fees.",
  "Platform fee applies only to paid bookings processed through ApexSports.",
  "Plans can be upgraded anytime.",
];
