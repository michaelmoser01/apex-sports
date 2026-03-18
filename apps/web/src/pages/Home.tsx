import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import {
  ShieldCheck,
  CalendarCheck,
  Star,
  ChevronDown,
  Users,
  Trophy,
  Zap,
  ArrowRight,
  Search,
} from "lucide-react";
import { ALLOWED_SPORTS } from "@apex-sports/shared";
import { Button } from "@/components/ui";
import { SectionHeader } from "@/components/ui";

const HERO_IMAGES = [
  "/images/coach-hero.png",
  "/images/coach-hero-baseball.png",
  "/images/coach-hero-female.png",
];
const HERO_ROTATE_MS = 6000;
const HERO_CROSSFADE_MS = 1500;

const stats = [
  { label: "Verified Coaches", value: "500+" },
  { label: "Sessions Booked", value: "10,000+" },
  { label: "Average Rating", value: "4.9" },
  { label: "Sports Covered", value: "25+" },
];

const valueProps = [
  {
    title: "Verified & trusted",
    description:
      "Every coach is background-checked and verified. Book with confidence for yourself or your athlete.",
    icon: ShieldCheck,
    accent: "from-success-500/20 to-success-500/0",
  },
  {
    title: "Find & book in minutes",
    description:
      "Browse by sport and location, see real availability, and request a session without the back-and-forth.",
    icon: CalendarCheck,
    accent: "from-brand-500/20 to-brand-500/0",
  },
  {
    title: "Real reviews, real results",
    description:
      "See ratings from other athletes and parents. After each session, leave a review to help the community.",
    icon: Star,
    accent: "from-amber-500/20 to-amber-500/0",
  },
];

const forCoaches = [
  { text: "Reach athletes who are ready to book", icon: Users },
  { text: "One calendar, one place to manage availability", icon: CalendarCheck },
  { text: "Get rated and build your reputation", icon: Trophy },
];

const testimonials = [
  {
    quote:
      "ApexSports completely changed how I run my coaching business. The scheduling alone saved me hours every week.",
    name: "Marcus J.",
    role: "Baseball Coach",
    rating: 5,
  },
  {
    quote:
      "Finding a verified hitting coach for my son was so easy. We booked a session the same day we signed up.",
    name: "Sarah T.",
    role: "Parent",
    rating: 5,
  },
  {
    quote:
      "The AI assistant handles all the texting and scheduling — I just show up and coach. It's incredible.",
    name: "Devon R.",
    role: "Basketball Coach",
    rating: 5,
  },
];

function useInView(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); io.disconnect(); } },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return { ref, visible };
}

export default function Home() {
  const [heroIndex, setHeroIndex] = useState(0);
  const valuesIO = useInView();
  const coachesIO = useInView();
  const testimonialsIO = useInView();

  useEffect(() => {
    const t = setInterval(
      () => setHeroIndex((i) => (i + 1) % HERO_IMAGES.length),
      HERO_ROTATE_MS,
    );
    return () => clearInterval(t);
  }, []);

  return (
    <div className="min-h-screen">
      {/* ── Hero ── */}
      <section className="relative min-h-[100vh] flex flex-col justify-center overflow-hidden bg-slate-950 text-white">
        <div className="absolute inset-0">
          {HERO_IMAGES.map((src, i) => (
            <div
              key={src}
              className="absolute inset-0 transition-opacity ease-in-out"
              style={{
                opacity: i === heroIndex ? 1 : 0,
                transitionDuration: `${HERO_CROSSFADE_MS}ms`,
              }}
              aria-hidden={i !== heroIndex}
            >
              <img
                src={src}
                alt=""
                className="h-full w-full object-cover object-center animate-hero-zoom"
              />
            </div>
          ))}
        </div>

        <div className="absolute inset-0 bg-gradient-hero-overlay" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_100%,rgba(236,116,26,0.18),transparent_70%)]" />

        <div className="relative max-w-5xl mx-auto w-full px-4 sm:px-6 text-center">
          <p className="text-sm font-bold uppercase tracking-widest text-brand-400 mb-4 animate-fade-in-up">
            The platform for elite coaching
          </p>
          <h1 className="font-display text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-extrabold tracking-display leading-[0.95]">
            Unlock Your
            <br />
            <span className="text-gradient-brand">Athletic Potential</span>
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-slate-300 max-w-2xl mx-auto leading-relaxed">
            Train with elite, verified coaches who help athletes improve faster.
            Every coach is vetted, background-checked, and reviewed.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/find">
              <Button size="xl" className="w-full sm:w-auto shadow-lg shadow-brand-500/30">
                Browse coaches
                <ArrowRight className="w-5 h-5" />
              </Button>
            </Link>
            <Link to="/coaches">
              <Button variant="glass" size="xl" className="w-full sm:w-auto">
                I'm a coach — get started
              </Button>
            </Link>
          </div>
        </div>

        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
          <ChevronDown className="w-6 h-6 text-white/50" />
        </div>
      </section>

      {/* ── Stats Strip ── */}
      <section className="bg-slate-900 border-t border-white/5">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 sm:gap-12">
            {stats.map((s) => (
              <div key={s.label} className="text-center">
                <p className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
                  {s.value}
                </p>
                <p className="mt-1 text-sm text-slate-400 font-medium">
                  {s.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Browse by Sport ── */}
      <section className="py-16 sm:py-20 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <SectionHeader
            eyebrow="Get started"
            title="Browse by sport"
            description="Find verified coaches near you in just a few clicks."
          />
          <div className="mt-10 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            {ALLOWED_SPORTS.map((sport) => (
              <Link
                key={sport}
                to={`/find?sport=${encodeURIComponent(sport)}`}
                className="group flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/50 p-6 transition-all hover:border-brand-300 hover:shadow-md hover:-translate-y-0.5"
              >
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-100 text-brand-600 group-hover:bg-brand-500 group-hover:text-white transition-colors text-2xl">
                  {sport === "Soccer" && "⚽"}
                  {sport === "Baseball" && "⚾"}
                  {sport === "Softball" && "🥎"}
                  {sport === "Basketball" && "🏀"}
                  {sport === "Tennis" && "🎾"}
                </span>
                <span className="font-semibold text-slate-900 group-hover:text-brand-700 transition-colors">
                  {sport}
                </span>
              </Link>
            ))}
            <Link
              to="/find"
              className="group flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/50 p-6 transition-all hover:border-brand-300 hover:shadow-md hover:-translate-y-0.5"
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-200 text-slate-600 group-hover:bg-brand-500 group-hover:text-white transition-colors">
                <Search className="w-7 h-7" />
              </span>
              <span className="font-semibold text-slate-900 group-hover:text-brand-700 transition-colors">
                View All
              </span>
            </Link>
          </div>
        </div>
      </section>

      {/* ── Value Propositions ── */}
      <section className="py-20 sm:py-28 bg-slate-50" ref={valuesIO.ref}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <SectionHeader
            eyebrow="Why ApexSports"
            title="Built for athletes and the people who train them"
            description="From first search to post-session review, we're built around trust and simplicity."
          />

          <div className="mt-16 grid sm:grid-cols-3 gap-8">
            {valueProps.map((item, i) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className={`relative rounded-2xl border border-slate-200 p-8 transition-all duration-500 hover-lift bg-gradient-brand-subtle ${
                    valuesIO.visible
                      ? `animate-fade-in-up stagger-item animate-stagger-${i + 1}`
                      : "stagger-item"
                  }`}
                  style={valuesIO.visible ? { opacity: 1 } : undefined}
                >
                  <div
                    className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${item.accent}`}
                  >
                    <Icon className="w-7 h-7 text-brand-600" />
                  </div>
                  <h3 className="mt-5 font-display text-xl font-bold text-slate-900">
                    {item.title}
                  </h3>
                  <p className="mt-3 text-slate-600 leading-relaxed">
                    {item.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── For Coaches ── */}
      <section
        className="py-20 sm:py-28 bg-slate-50"
        ref={coachesIO.ref}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-16">
          <div
            className={`max-w-xl ${
              coachesIO.visible ? "animate-fade-in-up" : "opacity-0"
            }`}
          >
            <p className="text-sm font-bold uppercase tracking-widest text-brand-500 mb-3">
              For coaches
            </p>
            <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-display text-slate-900">
              Built for coaches too
            </h2>
            <p className="mt-4 text-lg text-slate-600 leading-relaxed">
              Stop chasing leads. Set your availability, get discovered by
              athletes in your area, and manage everything in one place.
            </p>
            <ul className="mt-8 space-y-4">
              {forCoaches.map(({ text, icon: Icon }) => (
                <li
                  key={text}
                  className="flex items-center gap-4 text-slate-700"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500 text-white shadow-md shadow-brand-500/20">
                    <Icon className="w-5 h-5" />
                  </span>
                  <span className="text-base font-medium">{text}</span>
                </li>
              ))}
            </ul>
            <Link to="/coaches" className="inline-block mt-10">
              <Button variant="dark" size="lg">
                Set up coach profile
                <ArrowRight className="w-5 h-5" />
              </Button>
            </Link>
          </div>

          <div
            className={`flex-shrink-0 rounded-3xl bg-gradient-to-br from-slate-900 to-slate-800 text-white p-10 sm:p-12 shadow-card-dark max-w-md ring-1 ring-white/5 ${
              coachesIO.visible ? "animate-slide-in-right" : "opacity-0"
            }`}
          >
            <Zap className="w-10 h-10 text-brand-400 mb-4" />
            <p className="font-display text-lg font-semibold text-brand-400">
              One platform
            </p>
            <p className="mt-2 text-3xl sm:text-4xl font-display font-extrabold tracking-display leading-tight">
              More bookings.
              <br />
              Less admin.
              <br />
              Real reviews.
            </p>
            <div className="mt-6 flex gap-6 text-sm text-slate-400">
              <div>
                <p className="text-2xl font-bold text-white">4.9</p>
                <p>Avg rating</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-white">93%</p>
                <p>Rebooking</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Testimonials ── */}
      <section
        className="py-20 sm:py-28 bg-white"
        ref={testimonialsIO.ref}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <SectionHeader
            eyebrow="Testimonials"
            title="Trusted by coaches and athletes"
          />

          <div className="mt-14 grid sm:grid-cols-3 gap-8">
            {testimonials.map((t, i) => (
              <div
                key={t.name}
                className={`rounded-2xl border border-slate-200 bg-slate-50/50 p-8 transition-all duration-500 hover-lift ${
                  testimonialsIO.visible
                    ? `animate-fade-in-up stagger-item animate-stagger-${i + 1}`
                    : "stagger-item"
                }`}
                style={testimonialsIO.visible ? { opacity: 1 } : undefined}
              >
                <div className="flex gap-0.5 text-brand-500 mb-4">
                  {Array.from({ length: t.rating }).map((_, j) => (
                    <Star key={j} className="w-5 h-5 fill-current" />
                  ))}
                </div>
                <p className="text-slate-700 leading-relaxed italic">
                  "{t.quote}"
                </p>
                <div className="mt-6 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-slate-200 flex items-center justify-center text-sm font-bold text-slate-600">
                    {t.name[0]}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900">{t.name}</p>
                    <p className="text-sm text-slate-500">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="relative py-20 sm:py-28 bg-slate-950 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_50%,rgba(236,116,26,0.12),transparent_70%)]" />
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-display text-white">
            Ready to level up?
          </h2>
          <p className="mt-4 text-lg text-slate-400 max-w-xl mx-auto">
            Browse by sport and location — no signup required to explore.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/find">
              <Button size="xl" className="w-full sm:w-auto shadow-lg shadow-brand-500/30">
                Browse coaches
                <ArrowRight className="w-5 h-5" />
              </Button>
            </Link>
            <Link to="/coaches">
              <Button variant="glass" size="xl" className="w-full sm:w-auto">
                Join as a coach
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
