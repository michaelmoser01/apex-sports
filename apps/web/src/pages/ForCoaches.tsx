import { Link } from "react-router-dom";
import { PRICING_PLANS, PRICING_FOOTNOTES, type PricingPlan } from "@/data/pricing";

function formatAdditionalMessages(plan: PricingPlan): string {
  return `$${plan.overagePerSms.toFixed(3)} each`;
}

const HERO_BULLETS = [
  {
    title: "Your AI assistant, text-first",
    description: "One number for parents and athletes. They text like normal; your assistant schedules, confirms, and follows up.",
  },
  {
    title: "Automatic scheduling",
    description: "No back-and-forth. Athletes see your availability and book; the assistant manages the details.",
  },
  {
    title: "Always responsive",
    description: "Parents get fast, professional replies — even when you're on the field or off the phone.",
  },
  {
    title: "Bookings and payments handled",
    description: "Simple checkout, secure payments, no chasing invoices.",
  },
  {
    title: "Learns your style and your athletes",
    description: "Handles common requests and remembers preferences so you stay in control without the busywork.",
  },
  {
    title: "Professional every time",
    description: "Organized sessions, reminders, and clear communication by default.",
  },
];

const WHY_DIFFERENT = [
  "Text-first by design: parents text like normal—everything stays organized",
  "Operations, not just listings: scheduling, reminders, and payments included",
  "Personalized assistant: adapts to how you coach and communicate",
];

export default function ForCoaches() {
  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <section className="relative bg-slate-900 text-white overflow-hidden">
        <img
          src="/images/coach-valueprop-hero.png"
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-center"
          aria-hidden
        />
        <div className="absolute inset-0 bg-slate-900/80" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_0%,rgba(236,116,26,0.12),transparent_60%)]" />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-14 text-center">
          <h1 className="font-display text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-white">
            Spend your time coaching — not texting.
          </h1>
          <p className="mt-4 text-base sm:text-lg text-slate-300 max-w-2xl mx-auto leading-snug">
            You get your own assistant that coordinates with you and your athletes. Text &quot;Book Maceo for 4p on Tuesday&quot; — your assistant handles the rest.
          </p>
          <ul className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-left max-w-3xl mx-auto">
            {HERO_BULLETS.map(({ title, description }) => (
              <li key={title} className="flex items-start gap-2.5 text-slate-200 text-sm sm:text-base">
                <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-brand-500 text-white text-[10px] font-bold mt-0.5">
                  ✓
                </span>
                <span>
                  <strong className="text-white font-semibold">{title}</strong>
                  <span className="text-slate-300"> — {description}</span>
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/sign-up"
              className="inline-flex items-center justify-center rounded-xl bg-brand-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-brand-500/30 hover:bg-brand-600 transition-colors"
            >
              Get started as a Coach
            </Link>
            <a
              href="#pricing"
              className="inline-flex items-center justify-center rounded-xl border-2 border-white/60 bg-white/5 px-6 py-3 text-sm font-semibold text-white hover:bg-white/10 transition-colors"
            >
              See pricing
            </a>
          </div>
        </div>
      </section>

      {/* Why we're different */}
      <section className="py-16 sm:py-24 bg-slate-50 border-t border-slate-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 text-center">
            Why we're different
          </h2>
          <ul className="mt-10 space-y-4 max-w-2xl mx-auto">
            {WHY_DIFFERENT.map((line) => (
              <li key={line} className="flex items-start gap-3 text-slate-700">
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-brand-600 text-sm font-bold mt-0.5">
                  ✓
                </span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
          <div className="mt-12 text-center">
            <Link
              to="/sign-up"
              className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-8 py-4 text-base font-semibold text-white hover:bg-slate-800 transition-colors"
            >
              Sign up and create account
            </Link>
          </div>
        </div>
      </section>

      {/* Full pricing */}
      <section id="pricing" className="py-16 sm:py-24 bg-white border-t border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 text-center">
            Simple pricing that scales with your coaching business
          </h2>
          <p className="mt-3 text-slate-600 text-center max-w-xl mx-auto">
            Plans include your AI assistant, scheduling, and payments. Platform fee applies per booking—you keep the rest.
          </p>
          <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
            {PRICING_PLANS.map((plan) => (
              <div
                key={plan.id}
                className={`relative rounded-xl border bg-white p-6 flex flex-col min-w-0 md:min-w-[20rem] ${
                  plan.recommended
                    ? "border-brand-500 shadow-lg shadow-brand-500/10 ring-2 ring-brand-500/20"
                    : "border-slate-200"
                }`}
              >
                {plan.recommended && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="inline-flex items-center rounded-full bg-brand-500 px-3 py-1 text-xs font-semibold text-white">
                      Recommended
                    </span>
                  </div>
                )}
                <h3 className="font-display text-xl font-bold text-slate-900">{plan.name}</h3>
                <p className="mt-1 text-sm text-slate-500">{plan.tagline}</p>
                <p className="mt-4 flex items-baseline gap-1">
                  <span className="text-3xl font-bold text-slate-900">${plan.priceMonthly}</span>
                  <span className="text-slate-500">/ month</span>
                </p>
                <ul className="mt-6 space-y-2 flex-1">
                  {plan.included.map((item, i) => (
                    <li key={item} className="flex items-start gap-2 text-sm text-slate-700">
                      <span className="flex-shrink-0 text-brand-600 mt-0.5">✓</span>
                      <span className={i === 0 ? "whitespace-nowrap" : undefined}>{item}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-6 pt-4 border-t border-slate-200 space-y-1 text-sm text-slate-600">
                  <p>
                    <strong>Platform fee:</strong> {plan.platformFeePercent}%
                  </p>
                  <p>
                    <strong>Additional messages:</strong> {formatAdditionalMessages(plan)}
                  </p>
                </div>
                <Link
                  to="/sign-up"
                  className={`mt-6 w-full inline-flex items-center justify-center rounded-xl py-3 text-base font-semibold transition-colors ${
                    plan.recommended
                      ? "bg-brand-500 text-white hover:bg-brand-600"
                      : "bg-slate-900 text-white hover:bg-slate-800"
                  }`}
                >
                  {plan.ctaLabel}
                </Link>
              </div>
            ))}
          </div>
          <div className="mt-12 max-w-2xl mx-auto space-y-2 text-sm text-slate-500">
            {PRICING_FOOTNOTES.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
