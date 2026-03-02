import { useState } from "react";
import { CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { api } from "@/lib/api";

interface PlanPaymentFormProps {
  planId: string;
  planName: string;
  priceMonthly: number;
  subscribe: (paymentMethodId: string) => Promise<{
    planId?: string;
    subscriptionId?: string;
    clientSecret?: string;
  }>;
  onSuccess: () => void;
  onError: (message: string) => void;
  disabled?: boolean;
}

export function PlanPaymentForm({
  planId: _planId,
  planName,
  priceMonthly,
  subscribe,
  onSuccess,
  onError,
  disabled,
}: PlanPaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [cardComplete, setCardComplete] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const canSubmit = stripe && cardComplete && !disabled && !isLoading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setIsLoading(true);
    onError("");

    try {
      const card = elements.getElement(CardElement);
      if (!card) {
        onError("Payment form not ready. Please try again.");
        return;
      }
      const { error: pmError, paymentMethod } = await stripe.createPaymentMethod({
        type: "card",
        card,
      });
      if (pmError) {
        onError(pmError.message ?? "Card verification failed.");
        return;
      }
      if (!paymentMethod?.id) {
        onError("Could not verify card. Please try again.");
        return;
      }

      const data = await subscribe(paymentMethod.id);

      if (data?.clientSecret) {
        const { error: actionError } = await stripe.handleCardAction(data.clientSecret);
        if (actionError) {
          onError(actionError.message ?? "Verification failed. Please try again.");
          return;
        }
      }
      // Always confirm and persist planId when we have a subscription (with or without 3DS)
      if (data?.subscriptionId) {
        await api<{ planId: string }>(
          `/coaches/me/plan/checkout-success?subscription_id=${encodeURIComponent(data.subscriptionId)}`
        );
      }
      onSuccess();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mt-6 pt-6 border-t border-slate-200">
      <p className="text-slate-700 font-medium">
        {planName} — <span className="text-slate-900">${priceMonthly}/mo</span>
      </p>
      <p className="text-slate-600 text-sm">
        Enter your card. You’ll be charged monthly. You can change or cancel from your profile.
      </p>
      <div className="p-3 border border-slate-300 rounded-lg bg-white">
        <CardElement
          options={{
            style: {
              base: { fontSize: "16px", color: "#1e293b", "::placeholder": { color: "#94a3b8" } },
              invalid: { color: "#dc2626" },
            },
          }}
          onChange={(e) => setCardComplete(e.complete)}
        />
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!canSubmit}
          className="py-3 px-6 rounded-xl bg-brand-500 text-white font-semibold hover:bg-brand-600 disabled:opacity-50 transition"
        >
          {isLoading ? "Processing…" : "Subscribe"}
        </button>
      </div>
    </form>
  );
}
