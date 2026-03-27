import { useParams, Link, useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useRef, useCallback, useEffect } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements } from "@stripe/react-stripe-js";
import { api } from "@/lib/api";
import { DeferredPaymentForm } from "@/components/DeferredPaymentForm";
import {
  ArrowLeft,
  Calendar,
  MapPin,
  DollarSign,
  Star,
  Mic,
  Sparkles,
  CheckCircle,
  Clock,
  Users,
  Share2,
  Lock,
} from "lucide-react";
import { trackEvent } from "@/lib/analytics";

const stripePk = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
const stripePromise = stripePk ? loadStripe(stripePk) : null;

interface SlotParticipant {
  id: string;
  athleteName: string | null;
  displayName: string;
  avatarUrl: string | null;
  status: string;
  attended: boolean;
  paymentStatus: string | null;
  amountCents: number | null;
  isCurrentUser?: boolean;
}

interface BookingDetailData {
  id: string;
  viewerRole: "athlete" | "coach";
  coach: { id: string; displayName: string; sports: string[]; userId: string; stripeOnboardingComplete: boolean };
  slot: {
    id: string;
    startTime: string;
    endTime: string;
    maxCapacity?: number;
    location: {
      name: string;
      address: string;
      notes: string | null;
      latitude: number | null;
      longitude: number | null;
    } | null;
  };
  athlete?: { id: string; name: string | null; email: string };
  message: string | null;
  status: string;
  amountCents: number | null;
  paymentStatus: string | null;
  createdAt: string;
  completedAt: string | null;
  coachRecap: string | null;
  review: { rating: number; comment: string; createdAt: string } | null;
  attended?: boolean;
  lockedPrivate?: boolean;
  inviteCode?: string | null;
  slotParticipants?: SlotParticipant[];
  spotsRemaining?: number;
  currentPerPersonAmountCents?: number | null;
}

export default function BookingDetail() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const justBooked = searchParams.get("booked") === "group";

  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentJustCompleted, setPaymentJustCompleted] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [confirmAction, setConfirmAction] = useState<{
    type: "cancel" | "complete" | "needs_stripe" | "athlete-cancel";
    athleteName?: string;
    paymentStatus?: string | null;
  } | null>(null);

  const { data: booking, isLoading, isError, error } = useQuery({
    queryKey: ["booking", id],
    queryFn: () => api<BookingDetailData>(`/bookings/${id}`),
    enabled: !!id,
  });

  const updateMutation = useMutation({
    mutationFn: ({ status }: {
      status: "confirmed" | "cancelled" | "completed";
    }) =>
      api<{ status: string }>(`/bookings/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: (data) => {
      setUpdateError(null);
      setConfirmAction(null);
      if (data?.status === "completed") setSuccessMessage("Session marked complete.");
      else if (data?.status === "cancelled") setSuccessMessage("Booking cancelled.");
      else if (data?.status === "confirmed") {
        setSuccessMessage("Booking confirmed.");
        trackEvent("booking_confirmed", { booking_id: id ?? "" });
      }
      setTimeout(() => setSuccessMessage(null), 5000);
      queryClient.invalidateQueries({ queryKey: ["booking", id] });
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
    },
    onError: (err: Error) => {
      setUpdateError(err.message ?? "Update failed");
      setConfirmAction(null);
    },
  });

  const reviewMutation = useMutation({
    mutationFn: ({ rating, comment }: { rating: number; comment: string }) =>
      api(`/bookings/${id}/review`, {
        method: "POST",
        body: JSON.stringify({ rating, comment }),
      }),
    onSuccess: () => {
      setReviewComment("");
      queryClient.invalidateQueries({ queryKey: ["booking", id] });
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
    },
  });

  const paymentRequestMutation = useMutation({
    mutationFn: () => api(`/bookings/${id}/payment-request`, { method: "POST" }),
    onSuccess: () => {
      setSuccessMessage("Payment link sent to athlete.");
      setTimeout(() => setSuccessMessage(null), 5000);
      queryClient.invalidateQueries({ queryKey: ["booking", id] });
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: () => api(`/bookings/${id}/mark-paid`, { method: "POST" }),
    onSuccess: () => {
      setSuccessMessage("Payment marked as received.");
      setTimeout(() => setSuccessMessage(null), 5000);
      queryClient.invalidateQueries({ queryKey: ["booking", id] });
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
    },
  });

  if (!id || isLoading || !booking) {
    const errorMsg = isError
      ? (error instanceof Error ? error.message : "Booking not found.")
      : null;
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <Link to="/bookings" className="text-brand-500 hover:underline text-sm mb-6 inline-block">&larr; Back to bookings</Link>
        <p className="text-slate-500">{isLoading ? "Loading…" : errorMsg ?? "Loading…"}</p>
      </div>
    );
  }

  const isAthlete = booking.viewerRole === "athlete";
  const isCoach = booking.viewerRole === "coach";
  const isPaid = booking.paymentStatus === "succeeded" || booking.paymentStatus === "paid_offline";
  const paymentLinkSent = booking.paymentStatus === "deferred" || booking.paymentStatus === "payment_link_sent";
  const needsPayment =
    isAthlete &&
    booking.status === "completed" &&
    paymentLinkSent &&
    !isPaid &&
    (booking.amountCents ?? 0) > 0;
  const showPaymentSection =
    isAthlete &&
    booking.status === "completed" &&
    (booking.amountCents ?? 0) > 0 &&
    (paymentLinkSent || isPaid || paymentJustCompleted);
  const canReview = isAthlete && booking.status === "completed" && !booking.review;

  const hasParticipants = (booking.slotParticipants?.length ?? 0) > 1;
  const isUpcoming = booking.status === "pending" || booking.status === "confirmed";
  const shareUrl = booking.inviteCode
    ? `${window.location.origin}/group/${booking.inviteCode}`
    : booking.coach?.id
      ? `${window.location.origin}/coaches/${booking.coach.id}/book?slotId=${booking.slot.id}`
      : null;

  const slotTime = `${new Date(booking.slot.startTime).toLocaleString([], {
    dateStyle: "short",
    timeStyle: "short",
  })}`;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 sm:py-12">
      <Link to="/bookings" className="inline-flex items-center gap-1.5 text-brand-600 hover:text-brand-700 text-sm font-medium mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to bookings
      </Link>

      {justBooked && (
        <div className="mb-5 p-5 rounded-2xl bg-success-50 border border-success-200 shadow-sm">
          <div className="flex items-start gap-3">
            <CheckCircle className="w-6 h-6 text-success-600 shrink-0 mt-0.5" />
            <div className="space-y-2">
              <h2 className="text-lg font-bold text-success-900">Request sent!</h2>
              <p className="text-success-800 text-sm">
                We'll email you when {booking.coach.displayName} responds. Your card won't be charged until the session is complete.
              </p>
              {(booking.spotsRemaining ?? 0) > 0 && shareUrl && (
                <div className="mt-3 pt-3 border-t border-success-200">
                  <p className="text-success-800 text-sm font-medium mb-2">
                    <Users className="w-4 h-4 inline-block mr-1 -mt-0.5" />
                    Share this session to save more! The price drops as more athletes join.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(shareUrl);
                      setSuccessMessage("Share link copied!");
                      setTimeout(() => setSuccessMessage(null), 3000);
                      setSearchParams({}, { replace: true });
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-success-600 text-white text-sm font-semibold rounded-lg hover:bg-success-700 transition-colors"
                  >
                    <Share2 className="w-4 h-4" />
                    Copy share link
                  </button>
                </div>
              )}
              {!(booking.spotsRemaining ?? 0) && (
                <button
                  type="button"
                  onClick={() => setSearchParams({}, { replace: true })}
                  className="text-success-700 text-sm font-medium hover:underline mt-1"
                >
                  Dismiss
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {successMessage && (
        <div className="mb-4 p-3 rounded-xl bg-success-50 border border-success-200 text-success-800 text-sm flex items-center gap-2" role="status">
          <CheckCircle className="w-4 h-4 text-success-600 shrink-0" />
          {successMessage}
        </div>
      )}
      {updateError && (
        <div className="mb-4 p-3 rounded-xl bg-danger-50 border border-danger-200 text-danger-800 text-sm" role="alert">
          {updateError}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="h-1 bg-slate-100">
          <div
            className={`h-full transition-all duration-500 ${
              booking.status === "completed"
                ? "w-full bg-success-500"
                : booking.status === "confirmed"
                ? "w-2/3 bg-brand-500"
                : booking.status === "cancelled"
                ? "w-full bg-danger-400"
                : "w-1/3 bg-amber-400"
            }`}
          />
        </div>

        <div className="p-6 pb-4">
          <div className="flex flex-wrap items-center gap-2.5 mb-4">
            <h1 className="text-xl font-extrabold tracking-tight text-slate-900">
              {isAthlete
                ? booking.coach.displayName
                : booking.athlete?.name ?? booking.athlete?.email ?? "Athlete"}
            </h1>
            <span
              className={`px-3 py-1 rounded-full text-xs font-semibold ring-1 ${
                booking.status === "confirmed"
                  ? "bg-success-100 text-success-700 ring-success-600/10"
                  : booking.status === "completed"
                  ? "bg-slate-100 text-slate-700 ring-slate-600/10"
                  : booking.status === "cancelled"
                  ? "bg-danger-100 text-danger-700 ring-danger-600/10"
                  : "bg-amber-100 text-amber-700 ring-amber-600/10"
              }`}
            >
              {booking.status}
            </span>
            {booking.paymentStatus === "succeeded" && (
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-success-100 text-success-700 ring-1 ring-success-600/10">
                Paid
              </span>
            )}
            {booking.paymentStatus === "paid_offline" && (
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-success-100 text-success-700 ring-1 ring-success-600/10">
                Paid (offline)
              </span>
            )}
            {booking.lockedPrivate && (
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-violet-100 text-violet-700 ring-1 ring-violet-600/10">
                Private
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 mb-5 text-xs font-medium">
            <span className="flex items-center gap-1 text-brand-600">
              <Clock className="w-3.5 h-3.5" /> Requested
            </span>
            <span className="flex-1 h-px bg-slate-200" />
            <span className={`flex items-center gap-1 ${booking.status !== "pending" ? "text-brand-600" : "text-slate-400"}`}>
              <CheckCircle className="w-3.5 h-3.5" /> Confirmed
            </span>
            <span className="flex-1 h-px bg-slate-200" />
            <span className={`flex items-center gap-1 ${booking.status === "completed" ? "text-success-600" : "text-slate-400"}`}>
              <CheckCircle className="w-3.5 h-3.5" /> Complete
            </span>
          </div>

          <div className="space-y-3">
            {booking.message && (
              <div className="pb-3 border-b border-slate-100">
                <p className="text-slate-600 text-sm whitespace-pre-wrap">{booking.message}</p>
              </div>
            )}
            <div className="flex items-start gap-3 text-slate-600">
              <Calendar className="w-5 h-5 shrink-0 mt-0.5 text-slate-400" />
              <span>{slotTime}</span>
            </div>
            {(booking.amountCents != null || booking.currentPerPersonAmountCents != null) && (() => {
              const displayAmount = hasParticipants && booking.currentPerPersonAmountCents != null
                ? booking.currentPerPersonAmountCents
                : booking.amountCents!;
              return (
                <div className="flex items-center gap-3 text-slate-700">
                  <DollarSign className="w-5 h-5 shrink-0 text-slate-400" />
                  <span className="font-semibold">
                    ${(displayAmount / 100).toFixed(2)}
                    {hasParticipants && <span className="text-sm font-normal text-slate-500 ml-1">per person</span>}
                  </span>
                </div>
              );
            })()}
            {booking.slot.location && (
              <div className="flex items-start gap-3 text-slate-600">
                <MapPin className="w-5 h-5 shrink-0 mt-0.5 text-slate-400" />
                <div>
                  <p className="font-medium text-slate-700">{booking.slot.location.name}</p>
                  <p className="text-sm">{booking.slot.location.address}</p>
                  {booking.slot.location.notes && (
                    <p className="text-sm text-slate-500 mt-0.5">{booking.slot.location.notes}</p>
                  )}
                </div>
              </div>
            )}
            {booking.slot.location && isUpcoming && (
              <div className="mt-3">
                <div className="w-full h-48 sm:h-56 rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
                  <iframe
                    title="Session location"
                    src={
                      booking.slot.location.latitude != null && booking.slot.location.longitude != null
                        ? `https://www.google.com/maps?q=${booking.slot.location.latitude},${booking.slot.location.longitude}&z=15&output=embed`
                        : `https://www.google.com/maps?q=${encodeURIComponent(booking.slot.location.address)}&output=embed`
                    }
                    className="w-full h-full border-0"
                    allowFullScreen
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Payment section */}
        {showPaymentSection && (
          <div className={`px-6 py-5 ${needsPayment ? "bg-amber-50 border-y border-amber-200" : ""}`}>
            {paymentJustCompleted || isPaid ? (
              <div className="p-4 rounded-xl bg-success-50 border border-success-200">
                <p className="text-success-800 font-medium">Payment confirmed</p>
                <p className="text-success-700 text-sm mt-0.5">Thank you for your payment.</p>
              </div>
            ) : needsPayment && stripePk ? (
              <div className="p-5 rounded-xl bg-white border-2 border-amber-300 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900 mb-1">Payment due</h2>
                <p className="text-slate-600 text-sm mb-4">
                  Complete your payment of <span className="font-semibold text-slate-900">${(booking.amountCents! / 100).toFixed(2)}</span> for this session.
                </p>
                {paymentError && (
                  <p className="text-danger-600 text-sm mb-3" role="alert">
                    {paymentError}
                  </p>
                )}
                <Elements stripe={stripePromise}>
                  <DeferredPaymentForm
                    bookingId={id}
                    amountCents={booking.amountCents!}
                    onSuccess={() => {
                      setPaymentError(null);
                      setPaymentJustCompleted(true);
                      setSuccessMessage("Payment confirmed.");
                      trackEvent("payment_completed", { booking_id: id ?? "" });
                      setTimeout(() => setSuccessMessage(null), 5000);
                      queryClient.invalidateQueries({ queryKey: ["booking", id] });
                      queryClient.invalidateQueries({ queryKey: ["bookings"] });
                    }}
                    onError={setPaymentError}
                  />
                </Elements>
              </div>
            ) : null}
          </div>
        )}

        {/* Review */}
        {canReview && (
          <div className="px-6 py-5 border-t border-slate-200 bg-slate-50/50">
            <h2 className="text-lg font-semibold text-slate-900 mb-3">How was your session?</h2>
            <div className="flex gap-1 mb-3">
              {[1, 2, 3, 4, 5].map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReviewRating(r)}
                  className={`w-10 h-10 rounded-lg text-xl transition-colors ${
                    r <= reviewRating ? "bg-amber-400 text-white" : "bg-slate-200 text-slate-400 hover:bg-slate-300"
                  }`}
                >
                  ★
                </button>
              ))}
            </div>
            <textarea
              value={reviewComment}
              onChange={(e) => setReviewComment(e.target.value)}
              placeholder="Add a comment (optional)"
              className="w-full p-3 border border-slate-200 rounded-lg text-sm mb-3 focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
              rows={3}
            />
            <button
              onClick={() => reviewMutation.mutate({ rating: reviewRating, comment: reviewComment })}
              disabled={reviewMutation.isPending}
              className="bg-brand-500 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-brand-600 disabled:opacity-50"
            >
              {reviewMutation.isPending ? "Submitting…" : "Submit review"}
            </button>
          </div>
        )}

        {/* Private session callout for coach */}
        {isCoach && booking.lockedPrivate && (
          <div className="px-6 py-4 border-t border-violet-200 bg-violet-50">
            <div className="flex items-start gap-3">
              <Lock className="w-5 h-5 text-violet-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-violet-800">
                  {booking.status === "pending"
                    ? "Private session request"
                    : "Private session"}
                </p>
                <p className="text-sm text-violet-700 mt-0.5">
                  {booking.status === "pending"
                    ? "This athlete requested a private 1-on-1 session. If you confirm, the slot will be locked and no other athletes can join."
                    : "This slot is locked as a private 1-on-1 session. No other athletes can join."}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Session Participants (athlete read-only view) */}
        {isAthlete && booking.slotParticipants && booking.slotParticipants.length > 0 && (
          <div className="px-6 py-5 border-t border-slate-200">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-slate-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-slate-400" />
                Session Participants ({booking.slotParticipants.filter((p) => p.status !== "cancelled").length})
              </h2>
              {shareUrl && (booking.spotsRemaining ?? 0) > 0 && booking.status !== "cancelled" && (
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(shareUrl);
                    setSuccessMessage("Session link copied! Share it to fill this session.");
                    setTimeout(() => setSuccessMessage(null), 5000);
                  }}
                  className="flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700 font-medium"
                >
                  <Share2 className="w-3.5 h-3.5" />
                  Share session
                </button>
              )}
            </div>
            {(booking.spotsRemaining ?? 0) > 0 && booking.status !== "cancelled" && (
              <p className="text-xs text-brand-600 mb-3">
                {booking.spotsRemaining} {booking.spotsRemaining === 1 ? "spot" : "spots"} remaining — share to drop the per-person price
              </p>
            )}
            <div className="space-y-2">
              {booking.slotParticipants.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 bg-slate-50/50"
                >
                  <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 text-sm font-medium">
                    {(p.athleteName || p.displayName)?.[0]?.toUpperCase() || "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">
                      {p.athleteName || p.displayName}
                      {p.isCurrentUser && (
                        <span className="ml-1.5 text-xs font-medium text-brand-600 bg-brand-50 px-1.5 py-0.5 rounded">
                          You
                        </span>
                      )}
                    </p>
                    <span className={`text-xs ${
                      p.status === "confirmed" || p.status === "completed"
                        ? "text-success-600" : p.status === "cancelled"
                          ? "text-slate-400" : "text-amber-600"
                    }`}>
                      {p.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Coach: Actions (individual booking only) */}
        {isCoach && booking.status !== "cancelled" && (
          <div className="px-6 py-5 border-t border-slate-200">
            <h2 className="text-lg font-semibold text-slate-900 mb-3">Actions</h2>
            <div className="flex flex-wrap gap-3">
              {booking.status === "pending" && (
                <>
                  <button
                    onClick={() => updateMutation.mutate({ status: "confirmed" })}
                    disabled={updateMutation.isPending}
                    className="bg-success-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-success-700 disabled:opacity-50"
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => setConfirmAction({ type: "cancel", athleteName: booking.athlete?.name ?? undefined })}
                    className="bg-danger-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-danger-700"
                  >
                    Decline
                  </button>
                </>
              )}
              {booking.status === "confirmed" && (
                <>
                  <button
                    onClick={() => {
                      if ((booking.amountCents ?? 0) > 0 && !booking.coach.stripeOnboardingComplete) {
                        setConfirmAction({ type: "needs_stripe" });
                      } else {
                        setConfirmAction({
                          type: "complete",
                          athleteName: booking.athlete?.name ?? undefined,
                          paymentStatus: booking.paymentStatus,
                        });
                      }
                    }}
                    disabled={updateMutation.isPending}
                    className="bg-brand-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-600 disabled:opacity-50"
                  >
                    Mark complete
                  </button>
                  <button
                    onClick={() => setConfirmAction({ type: "cancel", athleteName: booking.athlete?.name ?? undefined })}
                    className="bg-danger-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-danger-700"
                  >
                    Cancel
                  </button>
                </>
              )}
              {booking.status === "completed" &&
                (booking.paymentStatus === "deferred" || booking.paymentStatus === "payment_link_sent") && (
                <>
                  <button
                    onClick={() => markPaidMutation.mutate()}
                    disabled={markPaidMutation.isPending}
                    className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
                  >
                    Mark as paid
                  </button>
                  <button
                    onClick={() => paymentRequestMutation.mutate()}
                    disabled={paymentRequestMutation.isPending}
                    className="px-4 py-2 text-sm font-medium text-success-800 bg-success-100 rounded-lg hover:bg-success-200 disabled:opacity-50"
                  >
                    Resend payment link
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* Athlete: Cancel */}
        {isAthlete && (booking.status === "pending" || booking.status === "confirmed") && (
          <div className="px-6 py-5 border-t border-slate-200">
            <button
              onClick={() => setConfirmAction({ type: "athlete-cancel" })}
              className="text-sm font-medium text-danger-600 hover:text-danger-700"
            >
              {booking.status === "pending" ? "Cancel request" : "Cancel booking"}
            </button>
          </div>
        )}

        {/* Session Recap */}
        {booking.status === "completed" && (
          <SessionRecapSection
            bookingId={id}
            isCoach={isCoach}
            existingRecap={booking.coachRecap}
            onSaved={() => {
              queryClient.invalidateQueries({ queryKey: ["booking", id] });
            }}
          />
        )}

        {booking.review && (
          <div className="px-6 py-5 border-t border-slate-200">
            <h2 className="text-lg font-bold text-slate-900 mb-2">Review</h2>
            <div className="flex gap-0.5 text-amber-500 mb-1">
              {Array.from({ length: booking.review.rating }).map((_, i) => (
                <Star key={i} className="w-5 h-5 fill-current" />
              ))}
            </div>
            {booking.review.comment && (
              <p className="text-slate-600 text-sm">{booking.review.comment}</p>
            )}
          </div>
        )}
      </div>

      {confirmAction && confirmAction.type === "needs_stripe" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <h2 id="confirm-title" className="text-lg font-semibold text-slate-900 mb-2">Set up payments first</h2>
            <p className="text-slate-600 text-sm mb-4">
              You need to set up your payment account before you can complete sessions. This lets you receive payments from athletes.
            </p>
            <div className="flex gap-3 justify-end">
              <button type="button" onClick={() => setConfirmAction(null)} className="px-4 py-2 rounded-lg text-slate-700 bg-slate-100 hover:bg-slate-200 font-medium text-sm">
                Back
              </button>
              <Link to="/coach/setup/get-paid" className="px-4 py-2 rounded-lg text-sm font-medium bg-brand-500 text-white hover:bg-brand-600">
                Set up payments
              </Link>
            </div>
          </div>
        </div>
      )}
      {confirmAction && confirmAction.type !== "needs_stripe" && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
        >
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <h2 id="confirm-title" className="text-lg font-semibold text-slate-900 mb-2">
              {confirmAction.type === "complete"
                ? "Mark session complete?"
                : confirmAction.type === "athlete-cancel"
                  ? "Cancel your booking?"
                  : "Cancel booking?"}
            </h2>
            <p className="text-slate-600 text-sm mb-4">
              {confirmAction.type === "complete"
                ? confirmAction.paymentStatus === "deferred"
                  ? "This will mark the session as complete and automatically send a payment link to the athlete."
                  : "This will mark the session as complete."
                : confirmAction.type === "athlete-cancel"
                  ? "This will cancel your booking and free the spot."
                  : `This will cancel the booking${confirmAction.athleteName ? ` with ${confirmAction.athleteName}` : ""}.`}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                className="px-4 py-2 rounded-lg text-slate-700 bg-slate-100 hover:bg-slate-200 font-medium text-sm"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirmAction.type === "athlete-cancel") {
                    updateMutation.mutate({ status: "cancelled" });
                  } else {
                    const status = confirmAction.type === "complete" ? "completed" : "cancelled";
                    updateMutation.mutate({ status });
                  }
                }}
                disabled={updateMutation.isPending}
                className={
                  confirmAction.type === "complete"
                    ? "px-4 py-2 rounded-lg text-sm font-medium bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50"
                    : "px-4 py-2 rounded-lg text-sm font-medium bg-danger-600 text-white hover:bg-danger-700 disabled:opacity-50"
                }
              >
                {confirmAction.type === "complete"
                  ? "Mark complete"
                  : "Yes, cancel"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Session Recap Section ----

/* eslint-disable @typescript-eslint/no-explicit-any */
const SpeechRecognition: (new () => any) | undefined =
  typeof window !== "undefined"
    ? (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
    : undefined;
/* eslint-enable @typescript-eslint/no-explicit-any */

function SessionRecapSection({
  bookingId,
  isCoach,
  existingRecap,
  onSaved,
}: {
  bookingId: string;
  isCoach: boolean;
  existingRecap: string | null;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [rawText, setRawText] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const hasSpeech = !!SpeechRecognition;

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, []);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) recognitionRef.current.stop();
    };
  }, []);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
      return;
    }
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    const baseText = textareaRef.current?.value ?? "";
    const separator = baseText && !baseText.endsWith(" ") ? " " : "";
    let finalTranscript = "";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        finalTranscript += event.results[i][0].transcript + " ";
      }
      setRawText(
        (baseText + separator + finalTranscript).replace(/  +/g, " ")
      );
    };

    recognition.onerror = () => {
      stopListening();
    };
    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [isListening, stopListening]);

  const handleEnhance = async () => {
    if (!rawText.trim()) return;
    setEnhancing(true);
    setError(null);
    try {
      const result = await api<{ recap: string }>(`/bookings/${bookingId}/recap-draft`, {
        method: "POST",
        body: JSON.stringify({ rawText: rawText.trim() }),
      });
      setRawText(result.recap);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to enhance recap");
    } finally {
      setEnhancing(false);
    }
  };

  const handleSave = async () => {
    if (!rawText.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await api(`/bookings/${bookingId}/recap`, {
        method: "POST",
        body: JSON.stringify({ recap: rawText.trim() }),
      });
      setEditing(false);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save recap");
    } finally {
      setSaving(false);
    }
  };

  if (!isCoach) {
    if (!existingRecap) return null;
    return (
      <div className="px-6 py-5 border-t border-slate-200">
        <h2 className="text-lg font-semibold text-slate-900 mb-3">Coach&apos;s session recap</h2>
        <div className="text-slate-600 text-sm whitespace-pre-wrap leading-relaxed">{existingRecap}</div>
      </div>
    );
  }

  if (existingRecap && !editing) {
    return (
      <div className="px-6 py-5 border-t border-slate-200">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-slate-900">Session recap</h2>
          <button
            onClick={() => {
              setRawText(existingRecap);
              setEditing(true);
            }}
            className="text-brand-600 text-sm font-medium hover:underline"
          >
            Edit
          </button>
        </div>
        <div className="text-slate-600 text-sm whitespace-pre-wrap leading-relaxed">{existingRecap}</div>
      </div>
    );
  }

  return (
    <div className="px-6 py-5 border-t border-slate-200">
      <h2 className="text-lg font-semibold text-slate-900 mb-1">
        {existingRecap ? "Edit session recap" : "Add session recap"}
      </h2>
      <p className="text-slate-500 text-sm mb-3">
        Share notes about the session. Use the mic to dictate, then let AI polish it.
      </p>

      {error && (
        <p className="text-danger-600 text-sm mb-2" role="alert">{error}</p>
      )}

      <div className="relative">
        <textarea
          ref={textareaRef}
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          rows={5}
          placeholder="Type or dictate your session notes… e.g. &quot;We worked on backhand technique today. Good progress on footwork. Need to focus on follow-through next time.&quot;"
          className="w-full p-3 pr-12 border border-slate-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 text-sm resize-y"
          disabled={enhancing || saving}
        />
        {hasSpeech && (
          <button
            type="button"
            onClick={toggleListening}
            disabled={enhancing || saving}
            title={isListening ? "Stop dictation" : "Start dictation"}
            className={`absolute right-2 top-2 p-2 rounded-xl transition ${
              isListening
                ? "bg-danger-100 text-danger-600 animate-pulse"
                : "bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700"
            } disabled:opacity-50`}
          >
            <Mic className="w-5 h-5" />
          </button>
        )}
      </div>

      {isListening && (
        <p className="text-danger-600 text-xs mt-1 flex items-center gap-1">
          <span className="w-2 h-2 bg-danger-500 rounded-full animate-pulse" />
          Listening… tap the mic to stop
        </p>
      )}
      {!hasSpeech && (
        <p className="text-slate-400 text-xs mt-1">Speech-to-text is not supported in this browser. Try Chrome or Safari.</p>
      )}

      <div className="flex flex-wrap gap-2 mt-3">
        <button
          type="button"
          onClick={handleEnhance}
          disabled={!rawText.trim() || enhancing || saving}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-50 flex items-center gap-1.5"
        >
          {enhancing ? (
            <>
              <span className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
              Enhancing…
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Enhance with AI
            </>
          )}
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!rawText.trim() || enhancing || saving}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save recap"}
        </button>
        {existingRecap && editing && (
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setRawText("");
              setError(null);
            }}
            className="px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:text-slate-800"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
