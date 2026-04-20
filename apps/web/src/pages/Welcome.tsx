import { useNavigate, Navigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { hasCompletedAthleteOnboarding } from "@/lib/athleteProfile";
import { consumeDeepLink } from "@/utils/deepLink";
import { Trophy, Users } from "lucide-react";

export default function Welcome() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: currentUser, isLoading: currentUserLoading } = useCurrentUser(true);
  const setRoleMutation = useMutation({
    mutationFn: (payload: { signupRole: "coach" | "athlete" }) => {
      return api("/auth/me", {
        method: "PATCH",
        body: JSON.stringify({ signupRole: payload.signupRole }),
      }).then(() => payload);
    },
    onSuccess: async (payload) => {
      const { signupRole } = payload;
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      await queryClient.refetchQueries({ queryKey: ["auth", "me"] });
      if (signupRole === "athlete") {
        navigate("/athlete/onboarding", { replace: true });
      } else if (signupRole === "coach") {
        navigate("/coach/onboarding/basic", { replace: true });
      } else {
        navigate("/athlete/profile", { replace: true });
      }
    },
  });

  if (currentUserLoading) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <p className="text-slate-500">Loading…</p>
      </div>
    );
  }

  if (currentUser?.signupRole === "coach" || currentUser?.coachProfile) {
    const dest = consumeDeepLink();
    return <Navigate to={dest ?? "/dashboard"} replace />;
  }

  const isAlreadyAthlete =
    currentUser?.signupRole === "athlete" || !!currentUser?.athleteProfile;
  const athleteProfileComplete = hasCompletedAthleteOnboarding(currentUser?.athleteProfile ?? null);

  if (isAlreadyAthlete) {
    if (athleteProfileComplete) {
      const dest = consumeDeepLink();
      return <Navigate to={dest ?? "/athlete"} replace />;
    }
    return <Navigate to="/athlete/onboarding" replace />;
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
              <Trophy className="w-7 h-7" />
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
