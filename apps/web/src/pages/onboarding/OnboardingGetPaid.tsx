import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

interface ConnectStatus {
  stripeOnboardingComplete: boolean;
}

export default function OnboardingGetPaid() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const connectReturn = searchParams.get("connect") === "return" || searchParams.get("connect") === "refresh";

  const { data: profile } = useQuery({
    queryKey: ["coachProfile"],
    queryFn: () => api<{ id: string; stripeOnboardingComplete?: boolean }>("/coaches/me"),
    retry: false,
  });

  const { data: connectStatus, refetch: refetchConnect } = useQuery({
    queryKey: ["connectStatus"],
    queryFn: () => api<ConnectStatus>("/coaches/me/connect-status"),
    enabled: !!profile?.id && connectReturn,
  });

  const connectLinkMutation = useMutation({
    mutationFn: () =>
      api<{ url: string }>("/coaches/me/connect-account-link", {
        method: "POST",
        body: JSON.stringify({ returnPath: "/coach/setup/get-paid" }),
      }),
    onSuccess: (data) => {
      if (data?.url) window.location.href = data.url;
    },
  });

  useEffect(() => {
    if (connectReturn && profile?.id) {
      refetchConnect();
    }
  }, [connectReturn, profile?.id, refetchConnect]);

  useEffect(() => {
    if (connectReturn && connectStatus?.stripeOnboardingComplete) {
      queryClient.invalidateQueries({ queryKey: ["coachProfile"] });
      queryClient.invalidateQueries({ queryKey: ["auth"] });
    }
  }, [connectReturn, connectStatus?.stripeOnboardingComplete, queryClient]);

  const isComplete = connectStatus?.stripeOnboardingComplete ?? profile?.stripeOnboardingComplete ?? false;

  if (connectReturn && isComplete) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 mb-4" aria-hidden>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-10 h-10">
            <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-slate-900 mb-1">Get paid</h1>
        <p className="text-slate-500 text-sm mb-6">Stripe is set up. You’ll receive session payments after the platform fee.</p>
        <button
          type="button"
          onClick={() => navigate("/dashboard", { replace: true })}
          className="w-full py-3 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition"
        >
          Continue
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
      <h1 className="text-xl font-semibold text-slate-900 mb-1">Get paid</h1>
      <p className="text-slate-500 text-sm mb-6">
        Set up Stripe to receive payments when athletes book sessions. You’re only charged when you get paid.
      </p>
      {connectLinkMutation.error && (
        <p className="text-red-600 text-sm mb-4" role="alert">
          {connectLinkMutation.error instanceof Error ? connectLinkMutation.error.message : "Something went wrong."}
        </p>
      )}
      <button
        type="button"
        onClick={() => connectLinkMutation.mutate()}
        disabled={connectLinkMutation.isPending}
        className="w-full py-3 rounded-xl bg-brand-500 text-white font-semibold hover:bg-brand-600 disabled:opacity-50 transition"
      >
        {connectLinkMutation.isPending ? "Redirecting…" : "Set up payments"}
      </button>
    </div>
  );
}
