import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useEffect, useRef } from "react";
import { format } from "date-fns";
import { loadStripe } from "@stripe/stripe-js";
import { Elements } from "@stripe/react-stripe-js";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { api } from "@/lib/api";
import { BookingPaymentForm } from "@/components/BookingPaymentForm";

const stripePk = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
const stripePromise = stripePk ? loadStripe(stripePk) : null;

interface CoachReservedSlot {
  id: string;
  displayName: string;
  hourlyRate: string | null;
  availabilitySlots: { id: string; startTime: string; endTime: string }[];
}

export default function CompleteReservedBooking() {
  const { coachId, slotId } = useParams<{ coachId: string; slotId: string }>();
  const queryClient = useQueryClient();
  const { isDevMode, isAuthenticated: isAuthFromContext } = useAuth();
  const { authStatus } = useAuthenticator((c) => [c.authStatus]);
  const isAuthenticated = isDevMode ? isAuthFromContext : authStatus === "authenticated";

  const [bookingMessage, setBookingMessage] = useState("");
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [bookingSuccess, setBookingSuccess] = useState<string | null>(null);
  const completedBookingThisSession = useRef(false);

  const { data: coach, isLoading, isError } = useQuery({
    queryKey: ["coach", coachId],
    queryFn: () => api<CoachReservedSlot>(`/coaches/${coachId}`),
    enabled: !!coachId,
  });

  const { data: myBookings } = useQuery({
    queryKey: ["bookings"],
    queryFn: () => api<{ asAthlete: { coach: { id: string }; slot: { id: string }; status: string }[] }>("/bookings"),
    enabled: !!coachId && isAuthenticated,
  });

  const slot = useMemo(() => {
    if (!coach?.availabilitySlots || !slotId) return null;
    return coach.availabilitySlots.find((s) => s.id === slotId) ?? null;
  }, [coach?.availabilitySlots, slotId]);

  const myPendingSlotIds = useMemo(() => {
    if (!coachId || !myBookings?.asAthlete) return new Set<string>();
    return new Set(
      myBookings.asAthlete
        .filter((b) => b.coach.id === coachId && b.status === "pending")
        .map((b) => b.slot.id)
    );
  }, [coachId, myBookings]);

  const sessionAmountCents = useMemo(() => {
    if (!coach?.hourlyRate || !slot) return null;
    const rate = Number(coach.hourlyRate);
    if (!Number.isFinite(rate) || rate <= 0) return null;
    const start = new Date(slot.startTime).getTime();
    const end = new Date(slot.endTime).getTime();
    const hours = (end - start) / (60 * 60 * 1000);
    return Math.max(50, Math.ceil(hours * rate * 100));
  }, [coach?.hourlyRate, slot]);

  const needsPaymentForm =
    !!coach?.hourlyRate &&
    !!stripePk &&
    !!slotId &&
    !!sessionAmountCents &&
    isAuthenticated &&
    !myPendingSlotIds.has(slotId);

  const bookMutation = useMutation({
    mutationFn: async ({
      slotId: sId,
      message,
      paymentMethodId,
    }: {
      slotId: string;
      message?: string;
      paymentMethodId?: string;
    }) =>
      api<{ id: string; clientSecret?: string; requiresAction?: boolean }>("/bookings", {
        method: "POST",
        body: JSON.stringify({
          coachId,
          slotId: sId,
          ...(message?.trim() ? { message: message.trim() } : {}),
          ...(paymentMethodId ? { payment_method: paymentMethodId } : {}),
        }),
      }),
    onSuccess: (data) => {
      if (data?.clientSecret && !needsPaymentForm) {
        setBookingError(
          "This session requires payment. Please refresh the page to see the payment form and enter your card."
        );
        return;
      }
      completedBookingThisSession.current = true;
      setBookingMessage("");
      setBookingError(null);
      setBookingSuccess("Request sent! We'll email you when the coach responds. Your card won't be charged until the coach marks the session complete.");
      queryClient.invalidateQueries({ queryKey: ["coach", coachId] });
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
    },
    onError: (err: Error) => {
      const msg = err.message ?? "Something went wrong.";
      if (msg.includes("already booked") || msg.includes("Slot is already booked"))
        setBookingError("This slot was just booked. Please pick another time.");
      else if (msg.includes("pending request")) setBookingError("You already have a pending request for this time.");
      else if (msg.includes("Payment method required")) setBookingError("Please enter your card details above.");
      else setBookingError(msg);
    },
  });

  useEffect(() => {
    if (!bookingSuccess || completedBookingThisSession.current) return;
    const t = setTimeout(() => setBookingSuccess(null), 8000);
    return () => clearTimeout(t);
  }, [bookingSuccess]);

  if (!coachId || !slotId) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12">
        <p className="text-slate-600">Invalid link. Use the link from your email.</p>
        <Link to="/bookings" className="mt-4 inline-block text-brand-600 font-medium hover:underline">
          View my bookings
        </Link>
      </div>
    );
  }

  if (isLoading || (!coach && !isError)) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12">
        <p className="text-slate-500">Loading…</p>
      </div>
    );
  }

  if (isError || !coach) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12">
        <p className="text-slate-600">This link may have expired or the coach is no longer available.</p>
        <Link to="/find" className="mt-4 inline-block text-brand-600 font-medium hover:underline">
          Find a coach
        </Link>
      </div>
    );
  }

  if (!slot) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12">
        <p className="text-slate-600">This time is no longer available. The coach may have removed it.</p>
        <Link to={`/coaches/${coachId}`} className="mt-4 inline-block text-brand-600 font-medium hover:underline">
          View {coach.displayName}'s availability
        </Link>
      </div>
    );
  }

  const slotStart = new Date(slot.startTime);
  const slotEnd = new Date(slot.endTime);
  const slotTimeStr =
    !Number.isNaN(slotStart.getTime()) && !Number.isNaN(slotEnd.getTime())
      ? `${format(slotStart, "EEEE, MMMM d, yyyy")} at ${format(slotStart, "h:mm a")} – ${format(slotEnd, "h:mm a")}`
      : slot.startTime;

  const alreadyPending = myPendingSlotIds.has(slotId);
  const showJustSubmitted = !!bookingSuccess;
  const showAlreadyPending = alreadyPending && !showJustSubmitted && !completedBookingThisSession.current;
  const showSuccessState = showJustSubmitted || (alreadyPending && completedBookingThisSession.current);

  return (
    <div className="max-w-xl mx-auto px-4 py-10">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-gradient-to-br from-brand-600 to-brand-700 px-6 py-8 text-white">
          <h1 className="text-2xl font-bold tracking-tight">
            {coach.displayName} reserved this time
          </h1>
          <p className="mt-2 text-brand-100 text-lg">
            Anyone with this link can claim it. Complete the booking below to confirm.
          </p>
        </div>
        <div className="px-6 py-6 border-t border-slate-100">
          <p className="text-slate-700 font-medium">
            Reserved time
          </p>
          <p className="text-slate-900 text-lg mt-0.5">
            {slotTimeStr}
          </p>

          {showAlreadyPending ? (
            <div className="mt-6 p-4 bg-amber-50 rounded-xl border border-amber-200">
              <p className="text-amber-800 font-medium">You already have a pending request for this time.</p>
              <p className="text-amber-700 text-sm mt-1">We'll email you when the coach responds.</p>
              <Link to="/bookings" className="mt-3 inline-block text-brand-600 font-medium hover:underline">
                View my bookings
              </Link>
            </div>
          ) : showSuccessState ? (
            <div className="mt-6 p-4 bg-emerald-50 rounded-xl border border-emerald-200" role="status">
              <p className="text-emerald-800 font-medium">
                {bookingSuccess || "You're all set. We'll email you when the coach responds."}
              </p>
              <Link to="/bookings" className="mt-2 inline-block text-brand-600 font-medium hover:underline">
                View my bookings
              </Link>
            </div>
          ) : (
            <>
              <div className="mt-6">
                <label htmlFor="reserved-booking-message" className="block text-sm font-medium text-slate-700 mb-1">
                  Message to coach <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <textarea
                  id="reserved-booking-message"
                  value={bookingMessage}
                  onChange={(e) => setBookingMessage(e.target.value)}
                  placeholder="e.g. what you'd like to work on, experience level…"
                  maxLength={2000}
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                />
              </div>

              {needsPaymentForm && stripePromise != null && sessionAmountCents ? (
                <div className="mt-6">
                  <Elements stripe={stripePromise}>
                    <BookingPaymentForm
                      slotId={slotId}
                      message={bookingMessage}
                      amountCents={sessionAmountCents}
                      createBooking={(body) =>
                        bookMutation.mutateAsync({
                          slotId: body.slotId,
                          message: body.message,
                          paymentMethodId: body.paymentMethodId,
                        })
                      }
                      cancelBooking={(bookingId) =>
                        api(`/bookings/${bookingId}`, {
                          method: "PATCH",
                          body: JSON.stringify({ status: "cancelled" }),
                        })
                      }
                      onSuccess={() => {
                        completedBookingThisSession.current = true;
                        setBookingMessage("");
                        setBookingError(null);
                        setBookingSuccess("Request sent! We'll email you when the coach responds. Your card won't be charged until the coach marks the session complete.");
                        queryClient.invalidateQueries({ queryKey: ["coach", coachId] });
                        queryClient.invalidateQueries({ queryKey: ["bookings"] });
                      }}
                      onError={setBookingError}
                      disabled={bookMutation.isPending}
                    />
                  </Elements>
                </div>
              ) : !needsPaymentForm ? (
                <div className="mt-6">
                  <button
                    type="button"
                    onClick={() => bookMutation.mutate({ slotId, message: bookingMessage })}
                    disabled={bookMutation.isPending}
                    className="w-full bg-brand-500 text-white px-4 py-3 rounded-xl font-semibold hover:bg-brand-600 disabled:opacity-50"
                  >
                    {bookMutation.isPending ? "Requesting…" : "Complete booking request"}
                  </button>
                </div>
              ) : null}
            </>
          )}

          {bookingError && (
            <p className="mt-4 text-red-700 text-sm bg-red-50 px-3 py-2 rounded-lg border border-red-200" role="alert">
              {bookingError}
            </p>
          )}
        </div>
      </div>

      <p className="mt-6 text-center">
        <Link to={`/coaches/${coachId}`} className="text-slate-500 text-sm hover:text-slate-700">
          View {coach.displayName}'s profile
        </Link>
      </p>
    </div>
  );
}
