import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export default function Welcome() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const setRoleMutation = useMutation({
    mutationFn: (signupRole: "coach" | "athlete") =>
      api("/auth/me", {
        method: "PATCH",
        body: JSON.stringify({ signupRole }),
      }),
    onSuccess: (_, signupRole) => {
      // Navigate first so Layout doesn't redirect back to /welcome when invalidation refetches
      if (signupRole === "coach") navigate("/dashboard/profile", { replace: true });
      else navigate("/coaches", { replace: true });
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
    },
  });

  return (
    <div className="max-w-lg mx-auto px-4 py-16 text-center">
      <h1 className="text-2xl font-bold text-slate-900 mb-2">Welcome to Apex Sports</h1>
      <p className="text-slate-600 mb-10">How do you want to use Apex Sports?</p>
      <div className="flex flex-col sm:flex-row gap-4 justify-center">
        <button
          type="button"
          onClick={() => setRoleMutation.mutate("coach")}
          disabled={setRoleMutation.isPending}
          className="px-8 py-4 rounded-xl bg-brand-500 text-white font-semibold text-lg hover:bg-brand-600 disabled:opacity-50 transition shadow-sm border-2 border-transparent hover:border-brand-600"
        >
          I'm a Coach
        </button>
        <button
          type="button"
          onClick={() => setRoleMutation.mutate("athlete")}
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
