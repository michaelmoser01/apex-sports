import { Link } from "react-router-dom";
import {
  MapPin,
  CalendarCheck,
  CreditCard,
  Star,
  ArrowRight,
  Check,
  Users,
  Globe,
  Clock,
  Sun,
  Briefcase,
  Leaf,
} from "lucide-react";
import { Button } from "@/components/ui";
import { SectionHeader } from "@/components/ui";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { trackEvent } from "@/lib/analytics";

const BENEFITS = [
  {
    title: "Find athletes near you",
    description:
      "Athletes in your area search by sport and location. They find your profile, see your availability, and book — no marketing needed.",
    icon: MapPin,
  },
  {
    title: "Coach on your schedule",
    description:
      "Set the hours that work for you. Morning, evening, weekends — you decide when and where you coach.",
    icon: Clock,
  },
  {
    title: "Earn more with group sessions",
    description:
      "Train 2–20 athletes at once with automatic per-person pricing. Fill more spots, earn more per hour.",
    icon: Users,
  },
  {
    title: "Get paid after every session",
    description:
      "Athletes receive a payment link after each session. No invoicing, no chasing — money goes straight to your bank.",
    icon: CreditCard,
  },
  {
    title: "Build your reputation",
    description:
      "Athletes leave reviews after every session. A strong rating means more bookings and higher rates over time.",
    icon: Star,
  },
  {
    title: "No website or marketing needed",
    description:
      "Your ApexSports profile is your online presence. We handle discovery, scheduling, and payments — you just coach.",
    icon: Globe,
  },
];

const HOW_IT_WORKS = [
  {
    step: 1,
    title: "Create your free profile",
    description:
      "Add your sport, experience, rates, and photos. Takes about 5 minutes.",
    icon: CalendarCheck,
  },
  {
    step: 2,
    title: "Get discovered by local athletes",
    description:
      "Athletes search by sport and location. When they find you, they can book directly.",
    icon: MapPin,
  },
  {
    step: 3,
    title: "Coach, get paid, repeat",
    description:
      "After each session, athletes pay through the platform. Money hits your bank automatically.",
    icon: CreditCard,
  },
];

const INCLUDED_FEATURES = [
  "Profile and discovery",
  "Online scheduling",
  "Group sessions",
  "Payments and invoicing",
  "Reviews and ratings",
  "Dashboard and athlete management",
];

const COACHING_STYLES = [
  {
    title: "Part-time",
    description:
      "Coach a few sessions a week around your day job. Set your own hours, earn extra income.",
    icon: Sun,
  },
  {
    title: "Full-time",
    description:
      "Build a full client roster and run group sessions. Replace your 9-to-5 doing what you love.",
    icon: Briefcase,
  },
  {
    title: "Seasonal",
    description:
      "Coach during your sport's season. Take time off when you want. No commitments.",
    icon: Leaf,
  },
];

export default function StartCoaching() {
  const { isDevMode, devUser } = useAuth();
  const { authStatus } = useAuthenticator((ctx) => [ctx.authStatus]);
  const isAuthenticated = isDevMode ? !!devUser : authStatus === "authenticated";
  const { data: currentUser } = useCurrentUser(isAuthenticated);
  const isCoach = !!currentUser?.coachProfile || currentUser?.signupRole === "coach";
  const coachCtaTo = isCoach ? "/dashboard" : "/sign-up?role=coach";
  const ctaLabel = isCoach ? "Go to Dashboard" : "Start coaching today";

  const handleCtaClick = () => {
    if (!isCoach) {
      trackEvent("ad_landing_signup_click", { page: "start-coaching" });
    }
  };

  return (
    <div className="min-h-screen bg-white">
      {/* ── Hero ── */}
      <section className="relative min-h-[100vh] flex flex-col justify-center bg-slate-950 text-white overflow-hidden">
        <img
          src="/images/coach-valueprop-hero.png"
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-center opacity-30"
          aria-hidden
        />
        <div className="absolute inset-0 bg-gradient-hero-overlay" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_0%,rgba(236,116,26,0.15),transparent_60%)]" />

        <div className="relative max-w-5xl mx-auto w-full px-4 sm:px-6 text-center">
          <p className="text-sm font-bold uppercase tracking-widest text-brand-400 mb-4">
            Start coaching in the Bay Area
          </p>
          <h1 className="font-display text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-extrabold tracking-display leading-[0.95]">
            Get paid to coach
            <br />
            <span className="text-gradient-brand">youth sports.</span>
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-slate-300 max-w-2xl mx-auto leading-relaxed">
            Turn your skills into income. Create a free profile, get discovered
            by local athletes, and start earning — on your own schedule.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
            <Link to={coachCtaTo} onClick={handleCtaClick}>
              <Button size="xl" className="w-full sm:w-auto shadow-lg shadow-brand-500/30">
                {ctaLabel}
                <ArrowRight className="w-5 h-5" />
              </Button>
            </Link>
            <a href="#how-it-works">
              <Button variant="glass" size="xl" className="w-full sm:w-auto">
                See how it works
              </Button>
            </a>
          </div>
        </div>
      </section>

      {/* ── Benefits Grid ── */}
      <section className="py-20 sm:py-28 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <SectionHeader
            eyebrow="Why coaches join"
            title="Everything you need to start earning"
          />

          <div className="mt-16 grid sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            {BENEFITS.map(({ title, description, icon: Icon }) => (
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

      {/* ── How It Works + Benefit Card ── */}
      <section id="how-it-works" className="py-20 sm:py-28 bg-slate-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col lg:flex-row lg:items-center gap-16">
            <div className="max-w-xl">
              <SectionHeader
                eyebrow="How it works"
                title="Up and running in 5 minutes"
                align="left"
              />
              <ol className="mt-10 space-y-8">
                {HOW_IT_WORKS.map(({ step, title, description, icon: Icon }) => (
                  <li key={step} className="flex items-start gap-4">
                    <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-brand-500 text-white font-bold text-lg shadow-md shadow-brand-500/20">
                      {step}
                    </span>
                    <div>
                      <p className="font-semibold text-slate-900 flex items-center gap-2">
                        <Icon className="w-4 h-4 text-brand-500" />
                        {title}
                      </p>
                      <p className="mt-1 text-slate-600 text-sm">{description}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <Link to={coachCtaTo} onClick={handleCtaClick} className="inline-block mt-10">
                <Button variant="dark" size="lg">
                  {isCoach ? "Go to Dashboard" : "Create my free profile"}
                  <ArrowRight className="w-5 h-5" />
                </Button>
              </Link>
            </div>

            <div className="flex-shrink-0 rounded-3xl bg-gradient-to-br from-slate-900 to-slate-800 text-white p-10 sm:p-12 shadow-card-dark max-w-sm ring-1 ring-white/5">
              <CreditCard className="w-10 h-10 text-brand-400 mb-4" />
              <p className="text-2xl sm:text-3xl font-display font-extrabold tracking-display leading-tight">
                Your coaching side
                <br />
                hustle —{" "}
                <span className="text-brand-400">without the hassle.</span>
              </p>
              <ul className="mt-6 space-y-2.5 text-sm text-slate-300">
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-brand-400 flex-shrink-0" />
                  No website or social media needed
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-brand-400 flex-shrink-0" />
                  No chasing parents for payment
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-brand-400 flex-shrink-0" />
                  No back-and-forth scheduling texts
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── Coaching Styles ── */}
      <section className="py-20 sm:py-28 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <SectionHeader
            eyebrow="Built for independent coaches"
            title="Whether it's a side hustle or your full-time gig"
          />

          <div className="mt-14 grid sm:grid-cols-3 gap-6 lg:gap-8">
            {COACHING_STYLES.map(({ title, description, icon: Icon }) => (
              <div
                key={title}
                className="rounded-2xl border border-slate-200 p-8 text-center transition-all duration-300 hover:border-brand-200 hover:shadow-lg hover:-translate-y-1 bg-gradient-brand-subtle"
              >
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-600">
                  <Icon className="w-7 h-7" />
                </div>
                <h3 className="mt-5 font-display text-xl font-bold text-slate-900">
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

      {/* ── Pricing ── */}
      <section id="pricing" className="py-20 sm:py-28 bg-slate-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <SectionHeader
            eyebrow="Pricing"
            title="Free to use. You keep what you earn."
          />

          <div className="mt-14 rounded-2xl border border-brand-200 bg-white p-8 sm:p-12 text-center shadow-lg shadow-brand-500/5">
            <p className="flex items-baseline justify-center gap-2">
              <span className="text-6xl sm:text-7xl font-extrabold text-slate-900 tracking-tight">
                $0
              </span>
              <span className="text-xl text-slate-500 font-medium">platform fee</span>
            </p>
            <p className="mt-4 text-slate-600 max-w-lg mx-auto leading-relaxed">
              No platform fees. Athletes cover standard card processing (~3%) at checkout.
            </p>

            <div className="mt-10 grid grid-cols-2 sm:grid-cols-3 gap-3 max-w-xl mx-auto text-left">
              {INCLUDED_FEATURES.map((feature) => (
                <div key={feature} className="flex items-start gap-2 text-sm text-slate-700">
                  <Check className="w-4 h-4 text-brand-500 flex-shrink-0 mt-0.5" />
                  <span>{feature}</span>
                </div>
              ))}
            </div>

            <p className="mt-8 text-sm text-slate-500 font-medium">
              A coach charging $60/hr running 10 sessions a week earns
              $2,400+/month. You keep it all.
            </p>

            <Link to={coachCtaTo} onClick={handleCtaClick} className="inline-block mt-8">
              <Button size="xl" className="shadow-lg shadow-brand-500/30">
                {ctaLabel}
                <ArrowRight className="w-5 h-5" />
              </Button>
            </Link>

            <p className="mt-4 text-xs text-slate-400">
              No credit card required to sign up.
            </p>
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="relative py-20 sm:py-24 bg-slate-950 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_50%,rgba(236,116,26,0.12),transparent_70%)]" />
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="font-display text-3xl sm:text-4xl font-extrabold tracking-display text-white">
            Start coaching today
          </h2>
          <p className="mt-4 text-lg text-slate-400">
            Create your free profile in 5 minutes. Athletes in your area are
            already searching.
          </p>
          <Link to={coachCtaTo} onClick={handleCtaClick} className="inline-block mt-8">
            <Button size="xl" className="shadow-lg shadow-brand-500/30">
              {isCoach ? "Go to Dashboard" : "Create my free profile"}
              <ArrowRight className="w-5 h-5" />
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
