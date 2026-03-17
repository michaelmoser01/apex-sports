import { useNavigate, Navigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  getStoredInviteSlug,
  getStoredInviteCoachId,
  getStoredInviteCoachName,
  clearStoredInviteSlug,
} from "./Join";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { hasCompletedAthleteOnboarding } from "@/lib/athleteProfile";
import { Dumbbell, Users, ArrowRight } from "lucide-react";

export default function Welcome() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: currentUser, isLoading: currentUserLoading } = useCurrentUser(true);
  const setRoleMutation = useMutation({
    mutationFn: (payload: { signupRole: "coach" | "athlete"; coachId?: string | null }) => {
      const { signupRole, coachId: _ } = payload;
      const inviteSlug = signupRole === "athlete" ? getStoredInviteSlug() : undefined;
      return api("/auth/me", {
        method: "PATCH",
        body: JSON.stringify({ signupRole, ...(inviteSlug ? { inviteSlug } : {}) }),
      }).then(() => payload);
    },
    onSuccess: async (payload) => {
      const { signupRole } = payload;
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      await queryClient.refetchQueries({ queryKey: ["auth", "me"] });
      if (signupRole === "athlete") {
        navigate("/athlete/onboarding", { replace: true });
      } else if (signupRole === "coach") {
        clearStoredInviteSlug();
        navigate("/coach/onboarding/basic", { replace: true });
      } else {
        clearStoredInviteSlug();
        navigate("/athlete/profile", { replace: true });
      }
    },
  });

  const fromInvite = !!getStoredInviteSlug();
  const coachName = getStoredInviteCoachName();
  const inviteCoachId = getStoredInviteCoachId();

  if (currentUserLoading) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <p className="text-slate-500">Loading…</p>
      </div>
    );
  }

  // Coach check first — prevents coaches with dual profiles from hitting athlete flow
  if (currentUser?.signupRole === "coach" || currentUser?.coachProfile) {
    return <Navigate to="/dashboard" replace />;
  }

  const isAlreadyAthlete =
    currentUser?.signupRole === "athlete" || !!currentUser?.athleteProfile;
  const athleteProfileComplete = hasCompletedAthleteOnboarding(currentUser?.athleteProfile ?? null);

  if (isAlreadyAthlete) {
    if (fromInvite && inviteCoachId && athleteProfileComplete) {
      return <Navigate to={`/coaches/${inviteCoachId}`} replace />;
    }
    if (fromInvite && inviteCoachId && !athleteProfileComplete) {
      return <Navigate to="/athlete/onboarding" replace />;
    }
    if (athleteProfileComplete) {
      return <Navigate to="/find" replace />;
    }
    return <Navigate to="/athlete/onboarding" replace />;
  }

  if (fromInvite) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-600 mb-6">
            <Users className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 mb-3">
            Welcome to Apex Sports
          </h1>
          <p className="text-slate-600 text-lg mb-10 leading-relaxed">
            {coachName
              ? `You're signing up to train with ${coachName}. Continue as an athlete to get connected and book sessions.`
              : "You're signing up via your coach's link. Continue as an athlete to get connected and book sessions."}
          </p>
          <button
            type="button"
            onClick={() =>
              setRoleMutation.mutate({
                signupRole: "athlete",
                coachId: getStoredInviteCoachId(),
              })
            }
            disabled={setRoleMutation.isPending}
            className="w-full px-8 py-4 rounded-2xl bg-brand-500 text-white font-bold text-lg hover:bg-brand-600 hover:shadow-glow-brand disabled:opacity-50 transition-all inline-flex items-center justify-center gap-2"
          >
            {setRoleMutation.isPending ? "Setting up…" : (
              <>Continue as athlete <ArrowRight className="w-5 h-5" /></>
            )}
          </button>
          {setRoleMutation.isError && (
            <p className="text-danger-600 text-sm mt-4">{setRoleMutation.error?.message}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="max-w-2xl w-full text-center">
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 mb-3">
          Welcome to <span className="text-gradient-brand">Apex Sports</span>
        </h1>
        <p className="text-slate-600 text-lg mb-12">How do you want to use Apex Sports?</p>
        <div className="grid sm:grid-cols-2 gap-6 max-w-xl mx-auto">
          <button
            type="button"
            onClick={() => setRoleMutation.mutate({ signupRole: "coach" })}
            disabled={setRoleMutation.isPending}
            className="group relative p-8 rounded-2xl border-2 border-slate-200 bg-white hover:border-brand-500 hover:shadow-lg transition-all disabled:opacity-50 text-left"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-600 mb-4 group-hover:bg-brand-500 group-hover:text-white transition-colors">
              <Dumbbell className="w-7 h-7" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-1">I'm a Coach</h2>
            <p className="text-sm text-slate-500">Set up your profile, manage availability, and grow your coaching business.</p>
          </button>
          <button
            type="button"
            onClick={() => setRoleMutation.mutate({ signupRole: "athlete" })}
            disabled={setRoleMutation.isPending}
            className="group relative p-8 rounded-2xl border-2 border-slate-200 bg-white hover:border-brand-500 hover:shadow-lg transition-all disabled:opacity-50 text-left"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500/10 text-brand-600 mb-4 group-hover:bg-brand-500 group-hover:text-white transition-colors">
              <Users className="w-7 h-7" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-1">I'm an Athlete</h2>
            <p className="text-sm text-slate-500">Find verified coaches, book sessions, and take your training to the next level.</p>
          </button>
        </div>
        <p className="text-slate-400 text-sm mt-8">
          This choice determines your account type and cannot be changed later.
        </p>
        {setRoleMutation.isError && (
          <p className="text-danger-600 text-sm mt-4">{setRoleMutation.error?.message}</p>
        )}
      </div>
    </div>
  );
}
