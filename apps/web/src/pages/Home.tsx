import { useState, useEffect } from "react";
import { Link } from "react-router-dom";

const HERO_IMAGES = [
  "/images/coach-hero.png",
  "/images/coach-hero-female.png",
  "/images/coach-hero-baseball.png",
];
const HERO_ROTATE_MS = 6000;
const HERO_CROSSFADE_MS = 1500;

const valueProps = [
  {
    title: "Verified & trusted",
    description:
      "Every coach is background-checked and verified. Book with confidence for yourself or your athlete.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
    ),
  },
  {
    title: "Find & book in minutes",
    description:
      "Browse by sport and location, see real availability, and request a session without the back-and-forth.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
      </svg>
    ),
  },
  {
    title: "Real reviews, real results",
    description:
      "See ratings from other athletes and parents. After each session, leave a review to help the community.",
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
      </svg>
    ),
  },
];

const forCoaches = [
  "Reach athletes who are ready to book",
  "One calendar, one place to manage availability",
  "Get rated and build your reputation",
];

export default function Home() {
  const [heroIndex, setHeroIndex] = useState(0);

  useEffect(() => {
    const t = setInterval(() => {
      setHeroIndex((i) => (i + 1) % HERO_IMAGES.length);
    }, HERO_ROTATE_MS);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="min-h-screen">
      {/* Hero with rotating background images + zoom */}
      <section className="relative min-h-[85vh] flex flex-col justify-end overflow-hidden bg-slate-900 text-white">
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
        <div className="absolute inset-0 bg-slate-900/70" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_100%,rgba(236,116,26,0.2),transparent_70%)]" />
        <div className="relative max-w-5xl mx-auto w-full px-4 sm:px-6 pt-24 pb-20 sm:pt-32 sm:pb-28 text-center">
          <h1 className="font-display text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight text-white drop-shadow-lg">
            Unlock Your Athletic Potential
          </h1>
          <p className="mt-6 text-base sm:text-lg text-slate-200 max-w-2xl mx-auto drop-shadow-md">
            Train with elite, verified coaches who help athletes improve faster. Every coach is vetted, background-checked, and reviewed.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/coaches"
              className="inline-flex items-center justify-center rounded-xl bg-brand-500 px-8 py-4 text-base font-semibold text-white shadow-lg shadow-brand-500/40 hover:bg-brand-600 transition-all hover:scale-[1.02]"
            >
              Browse coaches
            </Link>
            <Link
              to="/dashboard/profile"
              className="inline-flex items-center justify-center rounded-xl border-2 border-white/80 bg-white/10 px-8 py-4 text-base font-semibold text-white backdrop-blur-sm hover:bg-white/20 transition-colors"
            >
              I'm a coach — get started
            </Link>
          </div>
        </div>
      </section>

      {/* Value propositions */}
      <section className="py-16 sm:py-24 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 text-center">
            Why athletes & parents choose ApexSports
          </h2>
          <p className="mt-3 text-sm text-slate-600 text-center max-w-2xl mx-auto">
            From first search to post-session review, we're built around trust and simplicity.
          </p>
          <div className="mt-14 grid sm:grid-cols-3 gap-8 sm:gap-10">
            {valueProps.map((item) => (
              <div
                key={item.title}
                className="relative rounded-2xl border border-slate-200 bg-slate-50/50 p-8 hover:border-brand-200 hover:bg-brand-50/30 transition-colors"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-500/10 text-brand-600">
                  {item.icon}
                </div>
                <h3 className="mt-4 font-display text-lg font-semibold text-slate-900">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                  {item.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* For coaches */}
      <section className="py-16 sm:py-24 bg-slate-50 border-t border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col md:flex-row md:items-center md:justify-between gap-12">
          <div>
            <h2 className="font-display text-3xl sm:text-4xl font-bold text-slate-900">
              Built for coaches too
            </h2>
            <p className="mt-3 text-slate-600 max-w-xl">
              Stop chasing leads. Set your availability, get discovered by athletes in your area, and manage everything in one place.
            </p>
            <ul className="mt-6 space-y-3">
              {forCoaches.map((line) => (
                <li key={line} className="flex items-center gap-3 text-slate-700">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-500 text-white text-sm font-bold">
                    ✓
                  </span>
                  {line}
                </li>
              ))}
            </ul>
            <Link
              to="/dashboard/profile"
              className="mt-8 inline-flex items-center rounded-xl bg-slate-900 px-6 py-3 text-base font-semibold text-white hover:bg-slate-800 transition-colors"
            >
              Set up coach profile
            </Link>
          </div>
          <div className="flex-shrink-0 rounded-2xl bg-slate-900 text-white p-8 sm:p-10 shadow-xl max-w-md">
            <p className="font-display text-lg font-semibold text-brand-400">
              One platform
            </p>
            <p className="mt-2 text-2xl sm:text-3xl font-display font-bold">
              More bookings. Less admin. Real reviews.
            </p>
          </div>
        </div>
      </section>

      {/* CTA strip */}
      <section className="py-14 sm:py-18 bg-brand-500">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-white">
            Ready to find your next coach?
          </h2>
          <p className="mt-2 text-brand-100">
            Browse by sport and location — no signup required to explore.
          </p>
          <Link
            to="/coaches"
            className="mt-6 inline-flex items-center rounded-xl bg-white px-8 py-4 text-base font-semibold text-brand-600 shadow-lg hover:bg-brand-50 transition-colors"
          >
            Browse coaches
          </Link>
        </div>
      </section>
    </div>
  );
}
