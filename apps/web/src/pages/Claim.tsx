import { useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { Trophy, ArrowRight, Check } from "lucide-react";

const INVITE_TOKEN_KEY = "apex_invite_token";
const INVITE_EMAIL_KEY = "apex_invite_email";
const INVITE_COACH_NAME_KEY = "apex_invite_coach_name_token";

function readStorage(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(key) ?? localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function getStoredInviteToken(): string | null {
  return readStorage(INVITE_TOKEN_KEY);
}

export function getStoredInviteTokenEmail(): string | null {
  return readStorage(INVITE_EMAIL_KEY);
}

export function getStoredInviteTokenCoachName(): string | null {
  return readStorage(INVITE_COACH_NAME_KEY);
}

export function clearStoredInviteToken(): void {
  try {
    for (const key of [INVITE_TOKEN_KEY, INVITE_EMAIL_KEY, INVITE_COACH_NAME_KEY]) {
      sessionStorage.removeItem(key);
      localStorage.removeItem(key);
    }
  } catch {
    // ignore
  }
}

interface ClaimResponse {
  status: "invited" | "promoted";
  athleteEmail: string;
  athleteName: string;
  parentName: string | null;
  coach: {
    displayName: string;
    avatarUrl: string | null;
  };
}

const claimValueProps = [
  "Book and reschedule sessions in seconds—no back-and-forth texts.",
  "Message your coach directly inside Apex.",
  "One place to keep track of upcoming sessions, payments, and recaps.",
];

export default function Claim() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();
  const { data: currentUser } = useCurrentUser(isAuthenticated);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["invite-token", token],
    queryFn: () => api<ClaimResponse>(`/auth/claim/${token}`),
    enabled: !!token,
    retry: false,
  });

  // Persist token + context for the signup / sign-in handoff.
  useEffect(() => {
    if (!token || !data) return;
    try {
      for (const storage of [sessionStorage, localStorage]) {
        storage.setItem(INVITE_TOKEN_KEY, token);
        storage.setItem(INVITE_EMAIL_KEY, data.athleteEmail);
        storage.setItem(INVITE_COACH_NAME_KEY, data.coach.displayName);
      }
    } catch {
      // ignore
    }
  }, [token, data]);

  const acceptMutation = useMutation({
    mutationFn: () =>
      api<{ linked: boolean; alreadyLinked?: boolean }>("/auth/me/connect-invite-token", {
        method: "POST",
        body: JSON.stringify({ inviteToken: token }),
      }),
    onSuccess: () => {
      clearStoredInviteToken();
      queryClient.invalidateQueries({ queryKey: ["coachAthletes"] });
      navigate("/athlete", { replace: true });
    },
  });

  if (!token) {
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

  if (isError || !data) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <p className="text-slate-700 font-medium">This invite link is invalid or has expired.</p>
        {error instanceof Error && (
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
  const audience = data.parentName ? `${data.parentName} (parent)` : data.athleteName;

  // Already promoted — show a friendly success state.
  if (data.status === "promoted") {
    return (
      <div className="max-w-xl mx-auto px-4 py-16 text-center">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-success-50 text-success-600 mb-5">
          <Check className="w-7 h-7" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">You're already connected</h1>
        <p className="text-slate-600 mb-8">
          You're connected with {coach.displayName} on Apex Sports.
        </p>
        <Link
          to={isAuthenticated ? "/athlete" : "/sign-in"}
          className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-brand-500 text-white font-bold hover:bg-brand-600 transition-all"
        >
          {isAuthenticated ? "Go to dashboard" : "Sign in"}
          <ArrowRight className="w-4 h-4 ml-2" />
        </Link>
      </div>
    );
  }

  // Signed-in athlete with a profile: offer one-click accept.
  const isSignedInAthlete =
    isAuthenticated &&
    (currentUser?.signupRole === "athlete" || !!currentUser?.athleteProfile);

  return (
    <div className="max-w-xl mx-auto px-4 py-12 sm:py-16">
      <div className="text-center mb-8">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-600 mb-4">
          <Trophy className="w-7 h-7" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-1">
          {coach.displayName} invited {audience} to Apex
        </h1>
        <p className="text-slate-600">
          Set up your account to schedule sessions and message your coach in one place.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-8">
        <div className="p-5 flex items-center gap-4">
          <div className="shrink-0 w-16 h-16 rounded-full bg-slate-200 overflow-hidden">
            {coach.avatarUrl ? (
              <img src={coach.avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-400 text-xl font-semibold">
                {coach.displayName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
          <div>
            <p className="font-semibold text-slate-900">{coach.displayName}</p>
            <p className="text-slate-600 text-sm">Coach on Apex Sports</p>
          </div>
        </div>
      </div>

      <ul className="space-y-2 mb-8">
        {claimValueProps.map((text, i) => (
          <li key={i} className="flex gap-2 text-slate-600 text-sm">
            <span className="text-brand-500 shrink-0 mt-0.5" aria-hidden>
              ✓
            </span>
            <span>{text}</span>
          </li>
        ))}
      </ul>

      {isSignedInAthlete ? (
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => acceptMutation.mutate()}
            disabled={acceptMutation.isPending}
            className="w-full inline-flex justify-center items-center px-8 py-3.5 rounded-xl bg-brand-500 text-white font-bold hover:bg-brand-600 hover:shadow-glow-brand transition-all shadow-sm disabled:opacity-50"
          >
            {acceptMutation.isPending ? "Connecting…" : `Connect with ${coach.displayName}`}
            {!acceptMutation.isPending && <ArrowRight className="w-4 h-4 ml-2" />}
          </button>
          {acceptMutation.isError && (
            <p className="text-danger-600 text-sm text-center">
              {acceptMutation.error instanceof Error
                ? acceptMutation.error.message
                : "Couldn't accept invite. Please try again."}
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            to={`/sign-up?inviteToken=${encodeURIComponent(token)}&email=${encodeURIComponent(data.athleteEmail)}`}
            className="inline-flex justify-center items-center px-8 py-3.5 rounded-xl bg-brand-500 text-white font-bold hover:bg-brand-600 hover:shadow-glow-brand transition-all shadow-sm"
          >
            Create account
          </Link>
          <Link
            to={`/sign-in?returnTo=${encodeURIComponent(`/claim/${token}`)}`}
            className="inline-flex justify-center items-center px-8 py-3.5 rounded-xl bg-slate-100 text-slate-800 font-semibold hover:bg-slate-200 transition border border-slate-200"
          >
            Already have an account? Sign in
          </Link>
        </div>
      )}
    </div>
  );
}
