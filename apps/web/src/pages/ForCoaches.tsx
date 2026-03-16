import { Link } from "react-router-dom";
import {
  MessageSquare,
  CalendarCheck,
  Clock,
  CreditCard,
  Brain,
  Award,
  ArrowRight,
  Check,
  Zap,
} from "lucide-react";
import { PRICING_PLANS, PRICING_FOOTNOTES, type PricingPlan } from "@/data/pricing";
import { Button } from "@/components/ui";
import { SectionHeader } from "@/components/ui";

function formatAdditionalMessages(plan: PricingPlan): string {
  return `$${plan.overagePerSms.toFixed(3)} each`;
}

const HERO_FEATURES = [
  {
    title: "Your AI assistant, text-first",
    description:
      "One number for parents and athletes. They text like normal; your assistant schedules, confirms, and follows up.",
    icon: MessageSquare,
  },
  {
    title: "Automatic scheduling",
    description:
      "No back-and-forth. Athletes see your availability and book; the assistant manages the details.",
    icon: CalendarCheck,
  },
  {
    title: "Always responsive",
    description:
      "Parents get fast, professional replies — even when you're on the field or off the phone.",
    icon: Clock,
  },
  {
    title: "Bookings and payments handled",
    description: "Simple checkout, secure payments, no chasing invoices.",
    icon: CreditCard,
  },
  {
    title: "Learns your style",
    description:
      "Handles common requests and remembers preferences so you stay in control without the busywork.",
    icon: Brain,
  },
  {
    title: "Professional every time",
    description:
      "Organized sessions, reminders, and clear communication by default.",
    icon: Award,
  },
];

const WHY_DIFFERENT = [
  {
    title: "Text-first by design",
    desc: "Parents text like normal — everything stays organized for you.",
  },
  {
    title: "Operations, not just listings",
    desc: "Scheduling, reminders, and payments included — not bolted on.",
  },
  {
    title: "Personalized assistant",
    desc: "Adapts to how you coach and communicate. Gets smarter over time.",
  },
];

export default function ForCoaches() {
  return (
    <div className="min-h-screen bg-white">
      {/* ── Hero ── */}
      <section className="relative bg-slate-950 text-white overflow-hidden">
        <img
          src="/images/coach-valueprop-hero.png"
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-center opacity-30"
          aria-hidden
        />
        <div className="absolute inset-0 bg-gradient-hero-overlay" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_0%,rgba(236,116,26,0.15),transparent_60%)]" />

        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 py-20 sm:py-28 text-center">
          <p className="text-sm font-bold uppercase tracking-widest text-brand-400 mb-4">
            For coaches
          </p>
          <h1 className="font-display text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-display leading-[0.95]">
            Spend your time coaching
            <br />
            <span className="text-gradient-brand">— not texting.</span>
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-slate-300 max-w-2xl mx-auto leading-relaxed">
            You get your own AI assistant that coordinates with you and your athletes.
            Text "Book Maceo for 4p on Tuesday" — your assistant handles the rest.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/sign-up">
              <Button size="xl" className="w-full sm:w-auto shadow-lg shadow-brand-500/30">
                Get started as a Coach
                <ArrowRight className="w-5 h-5" />
              </Button>
            </Link>
            <a href="#pricing">
              <Button variant="glass" size="xl" className="w-full sm:w-auto">
                See pricing
              </Button>
            </a>
          </div>
        </div>
      </section>

      {/* ── Features Grid ── */}
      <section className="py-20 sm:py-28 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <SectionHeader
            eyebrow="Everything you need"
            title="Your AI-powered coaching operations"
            description="From scheduling to payments to follow-ups — all handled by your personal assistant."
          />

          <div className="mt-16 grid sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            {HERO_FEATURES.map(({ title, description, icon: Icon }) => (
              <div
                key={title}
                className="group rounded-2xl border border-slate-200 p-7 transition-all duration-300 hover:border-brand-200 hover:shadow-lg hover:-translate-y-1 bg-gradient-brand-subtle"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600 transition-colors group-hover:bg-brand-500 group-hover:text-white">
                  <Icon className="w-6 h-6" />
                </div>
                <h3 className="mt-5 font-display text-lg font-bold text-slate-900">
                  {title}
                </h3>
                <p className="mt-2 text-slate-600 leading-relaxed text-sm">
                  {description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Why We're Different ── */}
      <section className="py-20 sm:py-28 bg-slate-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col lg:flex-row lg:items-center gap-16">
            <div className="max-w-xl">
              <SectionHeader
                eyebrow="Why we're different"
                title="Not another coaching directory"
                align="left"
              />
              <ul className="mt-10 space-y-6">
                {WHY_DIFFERENT.map(({ title, desc }) => (
                  <li key={title} className="flex items-start gap-4">
                    <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-brand-500 text-white shadow-md shadow-brand-500/20 mt-0.5">
                      <Check className="w-4 h-4" strokeWidth={3} />
                    </span>
                    <div>
                      <p className="font-semibold text-slate-900">{title}</p>
                      <p className="mt-1 text-slate-600 text-sm">{desc}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <Link to="/sign-up" className="inline-block mt-10">
                <Button variant="dark" size="lg">
                  Sign up and create account
                  <ArrowRight className="w-5 h-5" />
                </Button>
              </Link>
            </div>

            <div className="flex-shrink-0 rounded-3xl bg-gradient-to-br from-slate-900 to-slate-800 text-white p-10 sm:p-12 shadow-card-dark max-w-sm ring-1 ring-white/5">
              <Zap className="w-10 h-10 text-brand-400 mb-4" />
              <p className="text-3xl font-display font-extrabold tracking-display leading-tight">
                Coaches spend
                <br />
                <span className="text-brand-400">5+ fewer hours</span>
                <br />
                per week on admin.
              </p>
              <p className="mt-4 text-sm text-slate-400">
                Focus on what you love — coaching — while your assistant handles the rest.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="py-20 sm:py-28 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <SectionHeader
            eyebrow="Pricing"
            title="Simple pricing that scales with your business"
            description="Plans include your AI assistant, scheduling, and payments. Platform fee applies per booking — you keep the rest."
          />

          <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
            {PRICING_PLANS.map((plan) => (
              <div
                key={plan.id}
                className={`relative rounded-2xl border bg-white p-8 flex flex-col transition-all duration-300 hover:-translate-y-1 ${
                  plan.recommended
                    ? "border-brand-500 shadow-xl shadow-brand-500/10 ring-2 ring-brand-500/20"
                    : "border-slate-200 hover:border-slate-300 hover:shadow-lg"
                }`}
              >
                {plan.recommended && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-brand-500 px-4 py-1.5 text-xs font-bold text-white shadow-lg shadow-brand-500/30">
                      <Zap className="w-3.5 h-3.5" />
                      Most popular
                    </span>
                  </div>
                )}
                <h3 className="font-display text-xl font-bold text-slate-900">
                  {plan.name}
                </h3>
                <p className="mt-1 text-sm text-slate-500">{plan.tagline}</p>
                <p className="mt-5 flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold text-slate-900">
                    ${plan.priceMonthly}
                  </span>
                  <span className="text-slate-500 font-medium">/ month</span>
                </p>
                <ul className="mt-7 space-y-3 flex-1">
                  {plan.included.map((item) => (
                    <li
                      key={item}
                      className="flex items-start gap-2.5 text-sm text-slate-700"
                    >
                      <Check className="w-4 h-4 text-brand-500 flex-shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-6 pt-5 border-t border-slate-100 space-y-1.5 text-sm text-slate-500">
                  <p>
                    <span className="font-semibold text-slate-700">Platform fee:</span>{" "}
                    {plan.platformFeePercent}%
                  </p>
                  <p>
                    <span className="font-semibold text-slate-700">Additional messages:</span>{" "}
                    {formatAdditionalMessages(plan)}
                  </p>
                </div>
                <Link to="/sign-up" className="mt-7 block">
                  <Button
                    variant={plan.recommended ? "primary" : "dark"}
                    size="lg"
                    className="w-full"
                  >
                    {plan.ctaLabel}
                  </Button>
                </Link>
              </div>
            ))}
          </div>

          <div className="mt-14 max-w-2xl mx-auto space-y-2 text-sm text-slate-400 text-center">
            {PRICING_FOOTNOTES.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="relative py-20 sm:py-24 bg-slate-950 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_50%,rgba(236,116,26,0.12),transparent_70%)]" />
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="font-display text-3xl sm:text-4xl font-extrabold tracking-display text-white">
            Ready to grow your coaching business?
          </h2>
          <p className="mt-4 text-lg text-slate-400">
            Join hundreds of coaches already using ApexSports.
          </p>
          <Link to="/sign-up" className="inline-block mt-8">
            <Button size="xl" className="shadow-lg shadow-brand-500/30">
              Get started free
              <ArrowRight className="w-5 h-5" />
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
