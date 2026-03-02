import { useState } from "react";
import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Elements } from "@stripe/react-stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { api } from "@/lib/api";
import { PRICING_PLANS } from "@/data/pricing";
import { ONBOARDING_BASE } from "@/config/onboarding";
import { PlanPaymentForm } from "@/components/PlanPaymentForm";
import type { PricingPlan } from "@/data/pricing";

const stripePk = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
const stripePromise = stripePk ? loadStripe(stripePk) : null;

export default function OnboardingPlan() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [selectedPlan, setSelectedPlan] = useState<PricingPlan | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [navigating, setNavigating] = useState(false);

  const handleSubscribe = async (paymentMethodId: string) => {
    if (!selectedPlan) throw new Error("No plan selected");
    const res = await api<{ planId?: string; subscriptionId?: string; clientSecret?: string }>(
      "/coaches/me/plan/subscribe",
      {
        method: "POST",
        body: JSON.stringify({ planId: selectedPlan.id, paymentMethodId }),
      }
    );
    return res;
  };

  const handlePaymentSuccess = () => {
    queryClient.invalidateQueries({ queryKey: ["coachProfile"] });
    queryClient.invalidateQueries({ queryKey: ["auth"] });
    setPaymentSuccess(true);
  };

  const handleContinueToAvailability = () => {
    setNavigating(true);
    Promise.all([
      queryClient.refetchQueries({ queryKey: ["coachProfile"] }),
      queryClient.refetchQueries({ queryKey: ["auth"] }),
    ]).finally(() => {
      setNavigating(false);
      navigate("/dashboard/availability", { replace: true });
    });
  };

  if (paymentSuccess) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-emerald-100 text-emerald-600 mb-5" aria-hidden>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-12 h-12">
            <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-slate-900 mb-1">You&apos;re all set up</h1>
        <p className="text-slate-500 text-sm mb-6">Your plan is active. Next, set your availability so athletes can book sessions.</p>
        <button
          type="button"
          onClick={handleContinueToAvailability}
          disabled={navigating}
          className="w-full py-3 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition disabled:opacity-70"
        >
          {navigating ? "Loading…" : "Set up your availability"}
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
      <h1 className="text-xl font-semibold text-slate-900 mb-1">Select plan</h1>
      <p className="text-slate-500 text-sm mb-6">
        Choose your plan and enter your card below. You’ll be charged the monthly fee. You can change it later from your profile.
      </p>
      <div className="space-y-3">
        {PRICING_PLANS.map((plan) => (
          <button
            key={plan.id}
            type="button"
            onClick={() => {
              setSelectedPlan(plan);
              setPaymentError(null);
            }}
            disabled={!!selectedPlan && selectedPlan.id !== plan.id}
            className={`w-full text-left p-4 rounded-xl border-2 transition ${
              selectedPlan?.id === plan.id
                ? "border-brand-500 bg-brand-50/50"
                : plan.recommended
                  ? "border-slate-200 hover:border-brand-500/50 bg-slate-50/50 hover:bg-brand-50/30"
                  : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
            } disabled:opacity-70`}
          >
            <div className="flex items-center justify-between">
              <div>
                <span className="font-semibold text-slate-900">{plan.name}</span>
                <span className="text-slate-500 text-sm ml-2">— ${plan.priceMonthly}/mo</span>
                {plan.recommended && (
                  <span className="ml-2 text-xs font-medium text-brand-600 bg-brand-100 px-1.5 py-0.5 rounded">
                    Recommended
                  </span>
                )}
              </div>
              <span className="text-brand-600 font-medium text-sm">
                {selectedPlan?.id === plan.id ? "Selected" : "Select"}
              </span>
            </div>
          </button>
        ))}
      </div>

      {selectedPlan && stripePromise && (
        <Elements stripe={stripePromise}>
          <PlanPaymentForm
            planId={selectedPlan.id}
            planName={selectedPlan.name}
            priceMonthly={selectedPlan.priceMonthly}
            subscribe={handleSubscribe}
            onSuccess={handlePaymentSuccess}
            onError={(msg) => setPaymentError(msg || null)}
          />
        </Elements>
      )}

      {selectedPlan && !stripePk && (
        <p className="text-amber-700 text-sm mt-4">
          Payment form is not configured. Set VITE_STRIPE_PUBLISHABLE_KEY to enable card entry.
        </p>
      )}

      {paymentError && (
        <p className="text-red-600 text-sm mt-4" role="alert">
          {paymentError}
        </p>
      )}
    </div>
  );
}

export function OnboardingPlanSuccess() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const sessionId = searchParams.get("session_id");

  useEffect(() => {
    if (!sessionId) {
      navigate(`${ONBOARDING_BASE}/plan`, { replace: true });
      return;
    }
    api<{ planId: string }>(`/coaches/me/plan/checkout-success?session_id=${encodeURIComponent(sessionId)}`)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ["coachProfile"] });
        queryClient.invalidateQueries({ queryKey: ["auth"] });
        navigate("/dashboard/availability", { replace: true });
      })
      .catch(() => {
        // Error is shown below via state; or we could set state and show retry
      });
  }, [sessionId, navigate, queryClient]);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 text-center">
      <p className="text-slate-600">Confirming your payment…</p>
    </div>
  );
}
