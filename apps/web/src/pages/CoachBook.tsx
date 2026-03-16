import { useParams, Link, useNavigate, useSearchParams, Navigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useEffect } from "react";
import { format } from "date-fns";
import { loadStripe } from "@stripe/stripe-js";
import { Elements } from "@stripe/react-stripe-js";
import { useAuth } from "@/contexts/AuthContext";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { api } from "@/lib/api";
import { BookingPaymentForm } from "@/components/BookingPaymentForm";
import { CoachDetailMap } from "@/components/CoachDetailMap";

const stripePk = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
const stripePromise = stripePk ? loadStripe(stripePk) : null;

interface SlotLocation {
  id: string;
  name: string;
  address: string;
  notes: string | null;
  latitude: number | null;
  longitude: number | null;
}

interface CoachBookData {
  id: string;
  displayName: string;
  hourlyRate: string | null;
  paymentMode?: "upfront" | "after_session";
  availabilitySlots: {
    id: string;
    startTime: string;
    endTime: string;
    location: SlotLocation | null;
  }[];
}

export default function CoachBook() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const slotId = searchParams.get("slotId");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isDevMode, isAuthenticated: isAuthFromContext } = useAuth();
  const { authStatus } = useAuthenticator((c) => [c.authStatus]);
  const isAuthenticated = isDevMode ? isAuthFromContext : authStatus === "authenticated";

  const [bookingMessage, setBookingMessage] = useState("");
  const [bookingError, setBookingError] = useState<string | null>(null);

  useEffect(() => {
    const scrollToTop = () => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };
    scrollToTop();
    const raf = requestAnimationFrame(() => {
      scrollToTop();
      requestAnimationFrame(scrollToTop);
    });
    return () => cancelAnimationFrame(raf);
  }, [id, slotId]);

  const { data: coach, isLoading, isError } = useQuery({
    queryKey: ["coach", id],
    queryFn: () => api<CoachBookData>(`/coaches/${id}`),
    enabled: !!id,
  });

  const { data: myBookings } = useQuery({
    queryKey: ["bookings"],
    queryFn: () =>
      api<{
        asAthlete: {
          id: string;
          coach: { id: string };
          slot: { id: string; startTime: string; endTime: string };
          status: string;
        }[];
      }>("/bookings"),
    enabled: !!id && isAuthenticated,
  });

  useEffect(() => {
    if (isLoading || !coach) return;
    const t = setTimeout(() => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }, 50);
    return () => clearTimeout(t);
  }, [id, slotId, isLoading, coach]);

  const existingBooking = useMemo(() => {
    if (!slotId || !myBookings?.asAthlete || !coach?.id) return null;
    return (
      myBookings.asAthlete.find(
        (b) => b.coach.id === coach.id && b.slot.id === slotId && ["pending", "confirmed", "completed"].includes(b.status)
      ) ?? null
    );
  }, [slotId, coach?.id, myBookings]);

  const slot = useMemo(() => {
    if (!coach || !slotId) return null;
    const fromAvailability = coach.availabilitySlots?.find((s) => s.id === slotId);
    if (fromAvailability) return fromAvailability;
    if (existingBooking?.slot)
      return {
        id: existingBooking.slot.id,
        startTime: existingBooking.slot.startTime,
        endTime: existingBooking.slot.endTime,
        location: null as SlotLocation | null,
      };
    return null;
  }, [coach?.availabilitySlots, coach?.id, slotId, existingBooking]);

  const myPendingSlotIds = useMemo(() => {
    if (!id || !myBookings?.asAthlete) return new Set<string>();
    return new Set(
      myBookings.asAthlete
        .filter((b) => b.coach.id === coach?.id && b.status === "pending")
        .map((b) => b.slot.id)
    );
  }, [id, coach?.id, myBookings]);

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
    coach?.paymentMode === "upfront" &&
    !!stripePk &&
    !!slotId &&
    !!sessionAmountCents &&
    isAuthenticated &&
    !myPendingSlotIds.has(slotId);

  const bookMutation = useMutation({
    mutationFn: async ({
      coachId,
      slotId: sId,
      message,
      paymentMethodId,
    }: {
      coachId: string;
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
      queryClient.invalidateQueries({ queryKey: ["coach", id] });
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      navigate(`/coaches/${id}/booking/success`, { replace: true });
    },
    onError: (err: Error) => {
      const msg = typeof err?.message === "string" ? err.message : "Something went wrong.";
      const safeMsg = msg === "[object Object]" ? "Something went wrong." : msg;
      if (safeMsg.includes("already booked") || safeMsg.includes("Slot is already booked"))
        setBookingError("This slot was just booked. Please pick another time.");
      else if (safeMsg.includes("pending request")) setBookingError("You already have a pending request for this time.");
      else if (safeMsg.includes("Payment method required")) setBookingError("Please enter your card details above.");
      else setBookingError(safeMsg);
    },
  });

  const handleBook = () => {
    if (!slotId || !coach) return;
    if (!isAuthenticated) {
      navigate("/bookings", { state: { returnTo: `/coaches/${id}/book?slotId=${slotId}` } });
      return;
    }
    bookMutation.mutate({ coachId: coach.id, slotId, message: bookingMessage });
  };

  if (id && !slotId) {
    return <Navigate to={`/coaches/${id}`} replace />;
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
        <p className="text-slate-600">Something went wrong loading this coach.</p>
        <Link to="/find" className="mt-4 inline-block text-brand-600 font-medium hover:underline">
          ← Find coaches
        </Link>
      </div>
    );
  }

  if (!slot) {
    return (
      <div className="max-w-xl mx-auto px-4 py-12">
        <p className="text-slate-600">This time is no longer available.</p>
        <Link to={`/coaches/${id}`} className="mt-4 inline-block text-brand-600 font-medium hover:underline">
          ← Back to {coach.displayName}&apos;s profile
        </Link>
      </div>
    );
  }

  const slotStart = new Date(slot.startTime);
  const slotEnd = new Date(slot.endTime);
  const slotTimeStr =
    !Number.isNaN(slotStart.getTime()) && !Number.isNaN(slotEnd.getTime())
      ? `${format(slotStart, "EEEE, MMMM d, yyyy")} · ${format(slotStart, "h:mm a")} – ${format(slotEnd, "h:mm a")}`
      : slot.startTime;

  const alreadyBooked = existingBooking != null;

  const statusLabel =
    existingBooking?.status === "pending"
      ? "Requested"
      : existingBooking?.status === "confirmed"
        ? "Confirmed"
        : existingBooking?.status === "completed"
          ? "Completed"
          : null;

  const isConfirmedOrCompleted = existingBooking?.status === "confirmed" || existingBooking?.status === "completed";

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <Link
          to={`/coaches/${id}`}
          className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-700 text-sm font-medium transition-colors"
        >
          ← Back to {coach.displayName}&apos;s profile
        </Link>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50">
            <h1 className="text-xl font-semibold text-slate-900">
              {alreadyBooked
                ? isConfirmedOrCompleted
                  ? "This session is booked"
                  : "You've requested this session"
                : "Request this session"}
            </h1>
            <p className="text-slate-600 text-sm mt-1">{slotTimeStr}</p>
            {alreadyBooked && statusLabel && (
              <p className="text-slate-700 text-sm mt-1 font-medium">
                Status:{" "}
                <span
                  className={
                    existingBooking?.status === "confirmed" || existingBooking?.status === "completed"
                      ? "text-success-600"
                      : "text-amber-600"
                  }
                >
                  {statusLabel}
                </span>
              </p>
            )}
            {!alreadyBooked && coach.hourlyRate && coach.paymentMode === "upfront" && (
              <p className="text-slate-500 text-sm mt-0.5">
                ${String(coach.hourlyRate)}/hr · Your card is only authorized now; you’re charged when the coach marks the session complete.
              </p>
            )}
            {!alreadyBooked && coach.hourlyRate && coach.paymentMode !== "upfront" && (
              <p className="text-slate-500 text-sm mt-0.5">
                ${String(coach.hourlyRate)}/hr &middot; You&apos;ll receive a payment link after your session.
              </p>
            )}
          </div>
          {slot?.location && (
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/30">
              <h2 className="text-sm font-semibold text-slate-900 mb-1">Session location</h2>
              <p className="text-slate-700 font-medium">{slot.location.name}</p>
              <p className="text-slate-600 text-sm mt-0.5">{slot.location.address}</p>
              {slot.location.notes?.trim() && (
                <p className="text-slate-500 text-sm mt-1">{slot.location.notes}</p>
              )}
              <div className="mt-3">
                <CoachDetailMap locations={[slot.location]} />
              </div>
            </div>
          )}
          <div className="p-5 sm:p-6 space-y-5">
            {!isAuthenticated && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <p className="text-amber-800 text-sm">
                  <Link
                    to="/bookings"
                    state={{ returnTo: `/coaches/${id}/book?slotId=${slotId}` }}
                    className="font-medium text-brand-600 hover:underline"
                  >
                    Sign in or create an account
                  </Link>{" "}
                  to request this booking.
                </p>
                <Link
                  to={`/coaches/${id}`}
                  className="inline-block mt-3 text-sm font-medium text-slate-600 hover:text-slate-800"
                >
                  ← Back to calendar
                </Link>
              </div>
            )}

            {isAuthenticated && alreadyBooked && (
              <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4">
                <p className="text-slate-700 text-sm">
                  {existingBooking?.status === "pending" &&
                    "You've requested this session. We'll email you when the coach accepts or declines."}
                  {existingBooking?.status === "confirmed" &&
                    "This session is confirmed. See your bookings for details and to manage it."}
                  {existingBooking?.status === "completed" &&
                    "This session is complete. You can leave a review from your bookings."}
                </p>
                <Link
                  to="/bookings"
                  className="inline-block mt-3 text-sm font-medium text-brand-600 hover:underline"
                >
                  View my bookings →
                </Link>
                <Link
                  to={`/coaches/${id}`}
                  className="inline-block mt-3 ml-4 text-sm font-medium text-slate-600 hover:text-slate-800"
                >
                  ← Back to {coach.displayName}&apos;s profile
                </Link>
              </div>
            )}

            {isAuthenticated && !alreadyBooked && (
              <>
                <div>
                  <label htmlFor="booking-message" className="block text-sm font-medium text-slate-700 mb-1">
                    Message to coach <span className="text-slate-400 font-normal">(optional)</span>
                  </label>
                  <textarea
                    id="booking-message"
                    value={bookingMessage}
                    onChange={(e) => setBookingMessage(e.target.value)}
                    placeholder="e.g. what you'd like to work on, experience level…"
                    maxLength={2000}
                    rows={3}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                  />
                  {bookingMessage.length > 1800 && (
                    <p className="text-slate-500 text-xs mt-1">{bookingMessage.length} / 2000</p>
                  )}
                </div>

                {needsPaymentForm && stripePromise != null && sessionAmountCents ? (
                  <Elements stripe={stripePromise}>
                    <BookingPaymentForm
                      slotId={slotId}
                      message={bookingMessage}
                      amountCents={sessionAmountCents}
                      createBooking={(body) =>
                        bookMutation.mutateAsync({
                          coachId: coach.id,
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
                      onSuccess={() => navigate(`/coaches/${id}/booking/success`, { replace: true })}
                      onError={(message) => setBookingError(typeof message === "string" ? message : "Something went wrong.")}
                      disabled={bookMutation.isPending}
                    />
                  </Elements>
                ) : (
                  <button
                    onClick={handleBook}
                    disabled={bookMutation.isPending}
                    className="w-full bg-brand-500 text-white px-4 py-3 rounded-lg font-medium hover:bg-brand-600 disabled:opacity-50"
                  >
                    {bookMutation.isPending ? "Requesting…" : "Request booking"}
                  </button>
                )}

                {bookingError && (
                  <p className="text-danger-700 text-sm bg-danger-50 px-3 py-2 rounded-lg border border-danger-200" role="alert">
                    {bookingError}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
