import { useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

const INVITE_SLUG_KEY = "apex_invite_slug";
const INVITE_COACH_ID_KEY = "apex_invite_coach_id";
const INVITE_COACH_NAME_KEY = "apex_invite_coach_name";

function getFromStorage(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(key) ?? localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function getStoredInviteSlug(): string | null {
  return getFromStorage(INVITE_SLUG_KEY);
}

export function getStoredInviteCoachId(): string | null {
  return getFromStorage(INVITE_COACH_ID_KEY);
}

export function getStoredInviteCoachName(): string | null {
  return getFromStorage(INVITE_COACH_NAME_KEY);
}

export function clearStoredInviteSlug(): void {
  try {
    for (const key of [INVITE_SLUG_KEY, INVITE_COACH_ID_KEY, INVITE_COACH_NAME_KEY]) {
      sessionStorage.removeItem(key);
      localStorage.removeItem(key);
    }
  } catch {
    // ignore
  }
}

interface InviteResponse {
  slug: string;
  coach: {
    id: string;
    displayName: string;
    sports: string[];
    serviceCities: string[];
    avatarUrl: string | null;
  } | null;
}

const joinValueProps = [
  "Book sessions with this coach easily—see real availability and pay in one place.",
  "Verified platform: every coach is background-checked so you can book with confidence.",
  "One place to manage bookings, messages, and your athlete profile.",
];

export default function Join() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["invite", slug],
    queryFn: () => api<InviteResponse>(`/invites/${slug}`),
    enabled: !!slug,
  });

  useEffect(() => {
    if (data?.slug) {
      for (const storage of [sessionStorage, localStorage]) {
        storage.setItem(INVITE_SLUG_KEY, data.slug);
        if (data.coach?.id) storage.setItem(INVITE_COACH_ID_KEY, data.coach.id);
        if (data.coach?.displayName) storage.setItem(INVITE_COACH_NAME_KEY, data.coach.displayName);
      }
    }
  }, [data?.slug, data?.coach?.id, data?.coach?.displayName]);

  if (!slug) {
    navigate("/", { replace: true });
    return null;
  }

  if (isLoading) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <p className="text-slate-500">Loading invite…</p>
      </div>
    );
  }

  if (isError || !data?.coach) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <p className="text-slate-700 font-medium">This invite link is invalid or has expired.</p>
        {error && (
          <p className="text-slate-500 text-sm mt-1">{error.message}</p>
        )}
        <button
          type="button"
          onClick={() => navigate("/")}
          className="mt-6 text-brand-600 font-medium hover:underline"
        >
          Go to home
        </button>
      </div>
    );
  }

  const coach = data.coach;
  const coachSubtitle = [coach.sports.join(", "), coach.serviceCities?.join(", ")].
    filter(Boolean)
    .join(" · ") || "Coach on ApexSports";

  return (
    <div className="max-w-xl mx-auto px-4 py-12 sm:py-16">
      <div className="text-center mb-10">
        <h1 className="text-2xl font-bold text-slate-900 mb-1">
          You’re invited to train with {coach.displayName}
        </h1>
        <p className="text-slate-600">
          Create an ApexSports account to book sessions and stay connected.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-10">
        <div className="p-6 flex flex-col sm:flex-row items-center gap-4">
          <div className="shrink-0 w-20 h-20 rounded-full bg-slate-200 overflow-hidden">
            {coach.avatarUrl ? (
              <img
                src={coach.avatarUrl}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-400 text-2xl font-semibold">
                {coach.displayName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div className="text-center sm:text-left">
            <p className="font-semibold text-slate-900">{coach.displayName}</p>
            <p className="text-slate-600 text-sm">{coachSubtitle}</p>
          </div>
        </div>
      </div>

      <div className="mb-10">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">Why sign up with ApexSports?</h2>
        <ul className="space-y-2">
          {joinValueProps.map((text, i) => (
            <li key={i} className="flex gap-2 text-slate-600 text-sm">
              <span className="text-brand-500 shrink-0 mt-0.5" aria-hidden>
                ✓
              </span>
              <span>{text}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Link
          to="/sign-up"
          className="inline-flex justify-center items-center px-8 py-3.5 rounded-xl bg-brand-500 text-white font-semibold hover:bg-brand-600 transition shadow-sm"
        >
          Create account
        </Link>
        <Link
          to="/sign-in"
          className="inline-flex justify-center items-center px-8 py-3.5 rounded-xl bg-slate-100 text-slate-800 font-semibold hover:bg-slate-200 transition border border-slate-200"
        >
          Already have an account? Sign in
        </Link>
      </div>
    </div>
  );
}
