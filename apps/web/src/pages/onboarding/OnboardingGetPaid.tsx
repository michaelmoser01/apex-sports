import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { CheckCircle, Banknote, Info } from "lucide-react";

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

  return (
    <div className="min-h-[60vh] flex items-start justify-center pt-12 sm:pt-20 pb-16 px-4">
      <div className="max-w-lg w-full">
        {connectReturn && isComplete ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="bg-success-50 border-b border-success-100 px-6 py-8 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-success-100 text-success-600 mb-4" aria-hidden>
                <CheckCircle className="w-10 h-10" />
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 mb-1">You&apos;re all set!</h1>
              <p className="text-slate-600 text-sm">Stripe is connected. You&apos;ll receive payouts directly to your bank account.</p>
            </div>
            <div className="px-6 py-5">
              <button
                type="button"
                onClick={() => navigate("/dashboard", { replace: true })}
                className="w-full py-3 rounded-xl bg-brand-500 text-white font-bold hover:bg-brand-600 hover:shadow-glow-brand transition-all"
              >
                Go to dashboard
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 pt-8 pb-6">
              <div className="flex items-center gap-3 mb-1">
                <div className="p-2 rounded-xl bg-brand-50 text-brand-600" aria-hidden>
                  <Banknote className="w-6 h-6" />
                </div>
                <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Get paid</h1>
              </div>
              <p className="text-slate-500 text-sm mt-2">
                Connect your Stripe account to receive payments when athletes book sessions with you.
              </p>
            </div>

            <div className="px-6 pb-6">
              <div className="bg-slate-50 rounded-xl p-4 mb-6">
                <h2 className="text-sm font-semibold text-slate-900 mb-3">How it works</h2>
                <ul className="space-y-3">
                  <li className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-bold mt-0.5">1</span>
                    <span className="text-sm text-slate-600">Connect your bank account through Stripe (takes ~2 minutes)</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-bold mt-0.5">2</span>
                    <span className="text-sm text-slate-600">Athletes pay when they book or after sessions</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-bold mt-0.5">3</span>
                    <span className="text-sm text-slate-600">Payouts are sent directly to your bank account</span>
                  </li>
                </ul>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
                <div className="flex items-start gap-3">
                  <Info className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-amber-900">10% platform fee per session</p>
                    <p className="text-sm text-amber-700 mt-0.5">
                      This covers Stripe processing fees and the Apex Sports service fee. You keep 90% of every payment. There are no monthly or upfront charges.
                    </p>
                  </div>
                </div>
              </div>

              {connectLinkMutation.error && (
                <p className="text-danger-600 text-sm mb-4" role="alert">
                  {connectLinkMutation.error instanceof Error ? connectLinkMutation.error.message : "Something went wrong."}
                </p>
              )}

              <button
                type="button"
                onClick={() => connectLinkMutation.mutate()}
                disabled={connectLinkMutation.isPending}
                className="w-full py-3.5 rounded-xl bg-brand-500 text-white font-bold text-base hover:bg-brand-600 hover:shadow-glow-brand disabled:opacity-50 transition-all shadow-sm"
              >
                {connectLinkMutation.isPending ? "Redirecting to Stripe…" : "Set up payments"}
              </button>

              <p className="text-center text-xs text-slate-400 mt-4">
                Powered by Stripe. Your financial information is never stored on our servers.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
