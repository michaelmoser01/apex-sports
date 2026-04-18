import { Link } from "react-router-dom";
import {
  CalendarCheck,
  CreditCard,
  Star,
  ArrowRight,
  Check,
  Search,
  Users,
  LayoutDashboard,
  UserPlus,
  ClipboardList,
} from "lucide-react";
import { Button } from "@/components/ui";
import { SectionHeader } from "@/components/ui";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrentUser } from "@/hooks/useCurrentUser";

const FEATURES = [
  {
    title: "Athletes find you",
    description:
      "Your profile shows up when local athletes search by sport and location. New clients come to you.",
    icon: Search,
  },
  {
    title: "Instant booking",
    description:
      "Set your availability once. Athletes see open slots and book themselves — no back-and-forth texts.",
    icon: CalendarCheck,
  },
  {
    title: "Fill sessions with group invites",
    description:
      "Athletes share your session link with friends. Spots fill organically with built-in per-person pricing.",
    icon: Users,
  },
  {
    title: "Get paid after every session",
    description:
      "Payment links are sent automatically. No invoicing, no chasing — money goes straight to your account.",
    icon: CreditCard,
  },
  {
    title: "Reviews that bring more athletes",
    description:
      "Athletes rate you after every session. Great reviews build trust and attract new bookings.",
    icon: Star,
  },
  {
    title: "One dashboard for everything",
    description:
      "Sessions, requests, athlete roster, and payments — all in one place so nothing falls through the cracks.",
    icon: LayoutDashboard,
  },
];

const HOW_IT_WORKS = [
  {
    step: 1,
    title: "Create your profile",
    description: "Add your sport, rates, credentials, and photos. Your profile goes live in minutes.",
    icon: UserPlus,
  },
  {
    step: 2,
    title: "Set your availability",
    description: "Weekly recurring or one-off slots. Group or private. You control your schedule.",
    icon: CalendarCheck,
  },
  {
    step: 3,
    title: "Athletes book and pay",
    description: "They find you, request sessions, and pay after — you just coach.",
    icon: ClipboardList,
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

export default function ForCoaches() {
  const { isDevMode, devUser } = useAuth();
  const { authStatus } = useAuthenticator((ctx) => [ctx.authStatus]);
  const isAuthenticated = isDevMode ? !!devUser : authStatus === "authenticated";
  const { data: currentUser } = useCurrentUser(isAuthenticated);
  const isCoach = !!currentUser?.coachProfile || currentUser?.signupRole === "coach";
  const coachCtaTo = isCoach ? "/dashboard" : "/sign-up?role=coach";

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
            For coaches
          </p>
          <h1 className="font-display text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-extrabold tracking-display leading-[0.95]">
            Coach more.
            <br />
            <span className="text-gradient-brand">Manage less.</span>
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-slate-300 max-w-2xl mx-auto leading-relaxed">
            Fill more sessions, manage your schedule with ease, get discovered by local athletes, and get paid automatically.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
            <Link to={coachCtaTo}>
              <Button size="xl" className="w-full sm:w-auto shadow-lg shadow-brand-500/30">
                {isCoach ? "Go to Dashboard" : "Get started free"}
                <ArrowRight className="w-5 h-5" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* ── Features Grid ── */}
      <section className="py-20 sm:py-28 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <SectionHeader
            eyebrow="More athletes. More sessions."
            title="Everything you need to fill your schedule"
            description="Athletes find you, book instantly, invite friends, and pay automatically. You just coach."
          />

          <div className="mt-16 grid sm:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            {FEATURES.map(({ title, description, icon: Icon }) => (
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
      <section className="py-20 sm:py-28 bg-slate-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col lg:flex-row lg:items-center gap-16">
            <div className="max-w-xl">
              <SectionHeader
                eyebrow="How it works"
                title="Up and running in minutes"
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
              <Link to={coachCtaTo} className="inline-block mt-10">
                <Button variant="dark" size="lg">
                  {isCoach ? "Go to Dashboard" : "Create your free profile"}
                  <ArrowRight className="w-5 h-5" />
                </Button>
              </Link>
            </div>

            <div className="flex-shrink-0 rounded-3xl bg-gradient-to-br from-slate-900 to-slate-800 text-white p-10 sm:p-12 shadow-card-dark max-w-sm ring-1 ring-white/5">
              <LayoutDashboard className="w-10 h-10 text-brand-400 mb-4" />
              <p className="text-2xl sm:text-3xl font-display font-extrabold tracking-display leading-tight">
                More athletes.
                <br />
                More sessions.
                <br />
                <span className="text-brand-400">Less busywork.</span>
              </p>
              <ul className="mt-6 space-y-2.5 text-sm text-slate-300">
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-brand-400 flex-shrink-0" />
                  Athletes discover and book you
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-brand-400 flex-shrink-0" />
                  Group invites fill spots for you
                </li>
                <li className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-brand-400 flex-shrink-0" />
                  Payments happen automatically
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── Pricing ── */}
      <section id="pricing" className="py-20 sm:py-28 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <SectionHeader
            eyebrow="Pricing"
            title="Free to use. You keep what you earn."
          />

          <div className="mt-14 rounded-2xl border border-brand-200 bg-gradient-brand-subtle p-8 sm:p-12 text-center shadow-lg shadow-brand-500/5">
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

            <Link to={coachCtaTo} className="inline-block mt-10">
              <Button size="xl" className="shadow-lg shadow-brand-500/30">
                {isCoach ? "Go to Dashboard" : "Get started free"}
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
            Ready to get more athletes?
          </h2>
          <p className="mt-4 text-lg text-slate-400">
            Set up your profile in minutes. Start getting bookings today.
          </p>
          <Link to={coachCtaTo} className="inline-block mt-8">
            <Button size="xl" className="shadow-lg shadow-brand-500/30">
              {isCoach ? "Go to Dashboard" : "Get started free"}
              <ArrowRight className="w-5 h-5" />
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
