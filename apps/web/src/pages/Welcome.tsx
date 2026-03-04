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

  if (currentUser?.signupRole === "coach" || currentUser?.coachProfile) {
    return <Navigate to="/dashboard" replace />;
  }

  if (fromInvite) {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Welcome to Apex Sports</h1>
        <p className="text-slate-600 mb-10">
          {coachName
            ? `You're signing up to train with ${coachName}. Continue as an athlete to get connected and book sessions.`
            : "You're signing up via your coach's link. Continue as an athlete to get connected and book sessions."}
        </p>
        <div className="flex flex-col gap-4">
          <button
            type="button"
            onClick={() =>
              setRoleMutation.mutate({
                signupRole: "athlete",
                coachId: getStoredInviteCoachId(),
              })
            }
            disabled={setRoleMutation.isPending}
            className="px-8 py-4 rounded-xl bg-brand-500 text-white font-semibold text-lg hover:bg-brand-600 disabled:opacity-50 transition shadow-sm border-2 border-transparent hover:border-brand-600"
          >
            {setRoleMutation.isPending ? "Setting up…" : "Continue as athlete"}
          </button>
        </div>
        {setRoleMutation.isError && (
          <p className="text-red-600 text-sm mt-4">{setRoleMutation.error?.message}</p>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-16 text-center">
      <h1 className="text-2xl font-bold text-slate-900 mb-2">Welcome to Apex Sports</h1>
      <p className="text-slate-600 mb-10">How do you want to use Apex Sports?</p>
      <div className="flex flex-col sm:flex-row gap-4 justify-center">
        <button
          type="button"
          onClick={() => setRoleMutation.mutate({ signupRole: "coach" })}
          disabled={setRoleMutation.isPending}
          className="px-8 py-4 rounded-xl bg-brand-500 text-white font-semibold text-lg hover:bg-brand-600 disabled:opacity-50 transition shadow-sm border-2 border-transparent hover:border-brand-600"
        >
          I'm a Coach
        </button>
        <button
          type="button"
          onClick={() => setRoleMutation.mutate({ signupRole: "athlete" })}
          disabled={setRoleMutation.isPending}
          className="px-8 py-4 rounded-xl bg-slate-100 text-slate-800 font-semibold text-lg hover:bg-slate-200 disabled:opacity-50 transition border-2 border-slate-300"
        >
          I'm an Athlete
        </button>
      </div>
      <p className="text-slate-500 text-sm mt-6">
        You can always add a coach profile later or book sessions as an athlete.
      </p>
      {setRoleMutation.isError && (
        <p className="text-red-600 text-sm mt-4">{setRoleMutation.error?.message}</p>
      )}
    </div>
  );
}
