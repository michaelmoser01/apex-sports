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

  return (
    <div className="min-h-[60vh] flex items-start justify-center pt-12 sm:pt-20 pb-16 px-4">
      <div className="max-w-lg w-full">
        {connectReturn && isComplete ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="bg-emerald-50 border-b border-emerald-100 px-6 py-8 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 mb-4" aria-hidden>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-10 h-10">
                  <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-slate-900 mb-1">You&apos;re all set!</h1>
              <p className="text-slate-600 text-sm">Stripe is connected. You&apos;ll receive payouts directly to your bank account.</p>
            </div>
            <div className="px-6 py-5">
              <button
                type="button"
                onClick={() => navigate("/dashboard", { replace: true })}
                className="w-full py-3 rounded-xl bg-brand-500 text-white font-semibold hover:bg-brand-600 transition"
              >
                Go to dashboard
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 pt-8 pb-6">
              <div className="flex items-center gap-3 mb-1">
                <div className="p-2 rounded-lg bg-brand-50 text-brand-600" aria-hidden>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6">
                    <path d="M12 7.5a2.25 2.25 0 100 4.5 2.25 2.25 0 000-4.5z" />
                    <path fillRule="evenodd" d="M1.5 4.875C1.5 3.839 2.34 3 3.375 3h17.25c1.035 0 1.875.84 1.875 1.875v9.75c0 1.036-.84 1.875-1.875 1.875H3.375A1.875 1.875 0 011.5 14.625v-9.75zM8.25 9.75a3.75 3.75 0 117.5 0 3.75 3.75 0 01-7.5 0zM18.75 9a.75.75 0 00-.75.75v.008c0 .414.336.75.75.75h.008a.75.75 0 00.75-.75V9.75a.75.75 0 00-.75-.75h-.008zM4.5 9.75A.75.75 0 015.25 9h.008a.75.75 0 01.75.75v.008a.75.75 0 01-.75.75H5.25a.75.75 0 01-.75-.75V9.75z" clipRule="evenodd" />
                    <path d="M2.25 18a.75.75 0 000 1.5c5.4 0 10.63.722 15.6 2.075 1.19.324 2.4-.558 2.4-1.82V18.75a.75.75 0 00-.75-.75H2.25z" />
                  </svg>
                </div>
                <h1 className="text-2xl font-bold text-slate-900">Get paid</h1>
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
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <p className="text-sm font-semibold text-amber-900">10% platform fee per session</p>
                    <p className="text-sm text-amber-700 mt-0.5">
                      This covers Stripe processing fees and the Apex Sports service fee. You keep 90% of every payment. There are no monthly or upfront charges.
                    </p>
                  </div>
                </div>
              </div>

              {connectLinkMutation.error && (
                <p className="text-red-600 text-sm mb-4" role="alert">
                  {connectLinkMutation.error instanceof Error ? connectLinkMutation.error.message : "Something went wrong."}
                </p>
              )}

              <button
                type="button"
                onClick={() => connectLinkMutation.mutate()}
                disabled={connectLinkMutation.isPending}
                className="w-full py-3.5 rounded-xl bg-brand-500 text-white font-semibold text-base hover:bg-brand-600 disabled:opacity-50 transition shadow-sm"
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
