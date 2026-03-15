import { useState } from "react";
import { CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { api } from "@/lib/api";

interface DeferredPaymentFormProps {
  bookingId: string;
  amountCents: number;
  onSuccess: () => void;
  onError: (message: string) => void;
  disabled?: boolean;
}

export function DeferredPaymentForm({
  bookingId,
  amountCents,
  onSuccess,
  onError,
  disabled,
}: DeferredPaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [cardComplete, setCardComplete] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const amountDollars = (amountCents / 100).toFixed(2);
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
      if (pmError || !paymentMethod) {
        onError(pmError?.message ?? "Could not process card. Please try again.");
        return;
      }

      const result = await api<{
        paymentStatus?: string;
        requiresAction?: boolean;
        clientSecret?: string;
      }>(`/bookings/${bookingId}/pay-now`, {
        method: "POST",
        body: JSON.stringify({ paymentMethodId: paymentMethod.id }),
      });

      if (result.requiresAction && result.clientSecret) {
        const { error: actionError } = await stripe.handleCardAction(result.clientSecret);
        if (actionError) {
          onError(actionError.message ?? "Authentication failed. Please try again.");
          return;
        }
        const finalResult = await api<{ paymentStatus?: string }>(
          `/bookings/${bookingId}/pay-now/finalize`,
          { method: "POST" }
        );
        if (finalResult.paymentStatus !== "succeeded") {
          onError("Payment could not be verified. Please refresh the page.");
          return;
        }
      } else if (result.paymentStatus !== "succeeded") {
        onError("Payment failed. Please try again.");
        return;
      }

      onSuccess();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-slate-700 font-medium">
        Session total: <span className="text-slate-900">${amountDollars}</span>
      </p>
      <p className="text-slate-600 text-sm">
        You&apos;ll be charged ${amountDollars} now.
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
      <button
        type="submit"
        disabled={!canSubmit}
        className="bg-brand-500 text-white px-4 py-2 rounded-lg font-medium hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? "Processing…" : "Pay now"}
      </button>
    </form>
  );
}
