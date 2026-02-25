import { useState } from "react";
import { CardElement, useStripe, useElements } from "@stripe/react-stripe-js";

interface BookingPaymentFormProps {
  slotId: string;
  message: string;
  amountCents: number;
  createBooking: (body: {
    slotId: string;
    message?: string;
    paymentMethodId: string;
  }) => Promise<{
    id: string;
    clientSecret?: string;
    requiresAction?: boolean;
  }>;
  cancelBooking: (bookingId: string) => Promise<void>;
  onSuccess: () => void;
  onError: (message: string) => void;
  disabled?: boolean;
}

export function BookingPaymentForm({
  slotId,
  message,
  amountCents,
  createBooking,
  cancelBooking,
  onSuccess,
  onError,
  disabled,
}: BookingPaymentFormProps) {
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
      if (pmError) {
        onError(pmError.message ?? "Card verification failed.");
        return;
      }
      if (!paymentMethod?.id) {
        onError("Could not verify card. Please try again.");
        return;
      }

      const data = await createBooking({
        slotId,
        message: message.trim() || undefined,
        paymentMethodId: paymentMethod.id,
      });

      if (data?.requiresAction && data?.clientSecret) {
        const { error: actionError } = await stripe.handleCardAction(data.clientSecret);
        if (actionError) {
          try {
            await cancelBooking(data.id);
          } catch {
            // best-effort
          }
          onError(actionError.message ?? "Verification failed. Please try again.");
          return;
        }
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
        Your card will only be authorized now. You won’t be charged until the coach has accepted the booking and marked the session complete.
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
        {isLoading ? "Requesting…" : "Request Booking"}
      </button>
    </form>
  );
}
