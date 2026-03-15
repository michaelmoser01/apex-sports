import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements } from "@stripe/react-stripe-js";
import { api } from "@/lib/api";
import { DeferredPaymentForm } from "@/components/DeferredPaymentForm";

const stripePk = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
const stripePromise = stripePk ? loadStripe(stripePk) : null;

interface BookingDetailData {
  id: string;
  viewerRole: "athlete" | "coach";
  coach: { id: string; displayName: string; sports: string[]; userId: string; stripeOnboardingComplete: boolean };
  slot: { id: string; startTime: string; endTime: string };
  athlete?: { id: string; name: string | null; email: string };
  message: string | null;
  status: string;
  amountCents: number | null;
  paymentStatus: string | null;
  createdAt: string;
  completedAt: string | null;
  review: { rating: number; comment: string; createdAt: string } | null;
}

export default function BookingDetail() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentJustCompleted, setPaymentJustCompleted] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [confirmAction, setConfirmAction] = useState<{
    type: "cancel" | "complete" | "needs_stripe";
    athleteName?: string;
    paymentStatus?: string | null;
  } | null>(null);

  const { data: booking, isLoading, isError, error } = useQuery({
    queryKey: ["booking", id],
    queryFn: () => api<BookingDetailData>(`/bookings/${id}`),
    enabled: !!id,
  });

  const updateMutation = useMutation({
    mutationFn: ({ status }: { status: "confirmed" | "cancelled" | "completed" }) =>
      api<{ status: string }>(`/bookings/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: (data) => {
      setUpdateError(null);
      setConfirmAction(null);
      if (data?.status === "completed") setSuccessMessage("Session marked complete.");
      else if (data?.status === "cancelled") setSuccessMessage("Booking cancelled.");
      else if (data?.status === "confirmed") setSuccessMessage("Booking confirmed.");
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
      setReviewing(false);
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
  const isPaid = booking.paymentStatus === "succeeded" || booking.paymentStatus === "authorized";
  const needsPayment =
    isAthlete &&
    !isPaid &&
    (booking.status === "confirmed" || booking.status === "completed") &&
    (booking.paymentStatus === "deferred" || booking.paymentStatus === "payment_link_sent") &&
    (booking.amountCents ?? 0) > 0;
  const canReview = isAthlete && booking.status === "completed" && !booking.review;

  const slotTime = `${new Date(booking.slot.startTime).toLocaleString([], {
    dateStyle: "short",
    timeStyle: "short",
  })}`;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 sm:py-12">
      <Link to="/bookings" className="text-brand-600 hover:text-brand-700 text-sm font-medium mb-4 inline-block">
        ← Back to bookings
      </Link>

      {successMessage && (
        <div className="mb-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm" role="status">
          {successMessage}
        </div>
      )}
      {updateError && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm" role="alert">
          {updateError}
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <h1 className="text-xl font-bold text-slate-900">
            {isAthlete ? booking.coach.displayName : booking.athlete?.name ?? booking.athlete?.email ?? "Athlete"}
          </h1>
          <span
            className={`px-2.5 py-1 rounded text-sm font-medium ${
              booking.status === "confirmed"
                ? "bg-emerald-100 text-emerald-700"
                : booking.status === "completed"
                ? "bg-slate-100 text-slate-700"
                : booking.status === "cancelled"
                ? "bg-red-100 text-red-700"
                : "bg-amber-100 text-amber-700"
            }`}
          >
            {booking.status}
          </span>
          {(booking.paymentStatus === "succeeded" || booking.paymentStatus === "authorized") && (
            <span className="px-2.5 py-1 rounded text-sm font-medium bg-emerald-100 text-emerald-700">
              Paid
            </span>
          )}
        </div>

        <p className="text-slate-600 mb-2">{slotTime}</p>
        {booking.amountCents != null && (
          <p className="text-slate-700 font-medium mb-2">${(booking.amountCents / 100).toFixed(2)}</p>
        )}
        {booking.message && (
          <p className="text-slate-600 text-sm whitespace-pre-wrap mt-2">{booking.message}</p>
        )}

        {/* Athlete: Pay (deferred) or Payment confirmed */}
        {isAthlete && (booking.status === "confirmed" || booking.status === "completed") && (booking.amountCents ?? 0) > 0 && (
          <div className="mt-6 pt-6 border-t border-slate-200">
            {paymentJustCompleted || isPaid ? (
              <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200">
                <p className="text-emerald-800 font-medium">Payment confirmed.</p>
                <p className="text-emerald-700 text-sm mt-0.5">Thank you for your payment.</p>
              </div>
            ) : needsPayment && stripePk ? (
              <>
                <h2 className="text-lg font-semibold text-slate-900 mb-3">Payment due</h2>
                {paymentError && (
                  <p className="text-red-600 text-sm mb-2" role="alert">
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
                      setTimeout(() => setSuccessMessage(null), 5000);
                      queryClient.invalidateQueries({ queryKey: ["booking", id] });
                      queryClient.invalidateQueries({ queryKey: ["bookings"] });
                    }}
                    onError={setPaymentError}
                  />
                </Elements>
              </>
            ) : null}
          </div>
        )}

        {/* Athlete: Review */}
        {canReview && (
          <div className="mt-6 pt-6 border-t border-slate-200">
            {reviewing ? (
              <div>
                <h2 className="text-lg font-semibold text-slate-900 mb-3">Write a review</h2>
                <div className="flex gap-2 mb-2">
                  {[1, 2, 3, 4, 5].map((r) => (
                    <button
                      key={r}
                      onClick={() => setReviewRating(r)}
                      className={`px-2 py-1 rounded ${r <= reviewRating ? "bg-amber-400 text-white" : "bg-slate-200"}`}
                    >
                      ★
                    </button>
                  ))}
                </div>
                <textarea
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  placeholder="Optional comment"
                  className="w-full p-2 border rounded mb-2"
                  rows={2}
                />
                <button
                  onClick={() => reviewMutation.mutate({ rating: reviewRating, comment: reviewComment })}
                  disabled={reviewMutation.isPending}
                  className="bg-brand-500 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                >
                  Submit Review
                </button>
              </div>
            ) : (
              <button
                onClick={() => setReviewing(true)}
                className="text-brand-600 font-medium hover:underline"
              >
                Write a review
              </button>
            )}
          </div>
        )}

        {/* Coach: Actions */}
        {isCoach && booking.status !== "cancelled" && (
          <div className="mt-6 pt-6 border-t border-slate-200">
            <h2 className="text-lg font-semibold text-slate-900 mb-3">Actions</h2>
            <div className="flex flex-wrap gap-3">
              {booking.status === "pending" && (
                <>
                  <button
                    onClick={() => updateMutation.mutate({ status: "confirmed" })}
                    disabled={updateMutation.isPending}
                    className="bg-emerald-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => setConfirmAction({ type: "cancel", athleteName: booking.athlete?.name ?? undefined })}
                    className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700"
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
                    className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700"
                  >
                    Cancel
                  </button>
                </>
              )}
              {(booking.status === "confirmed" || booking.status === "completed") &&
                (booking.paymentStatus === "deferred" || booking.paymentStatus === "payment_link_sent") && (
                <button
                  onClick={() => paymentRequestMutation.mutate()}
                  disabled={paymentRequestMutation.isPending}
                  className="px-4 py-2 text-sm font-medium text-emerald-800 bg-emerald-100 rounded-lg hover:bg-emerald-200 disabled:opacity-50"
                >
                  {booking.paymentStatus === "payment_link_sent" ? "Resend payment link" : "Send payment link"}
                </button>
              )}
            </div>
          </div>
        )}

        {booking.review && (
          <div className="mt-6 pt-6 border-t border-slate-200">
            <h2 className="text-lg font-semibold text-slate-900 mb-2">Review</h2>
            <div className="flex gap-1 text-amber-500 mb-1">
              {Array.from({ length: booking.review.rating }).map((_, i) => (
                <span key={i}>★</span>
              ))}
            </div>
            {booking.review.comment && (
              <p className="text-slate-600 text-sm">{booking.review.comment}</p>
            )}
          </div>
        )}
      </div>

      {confirmAction && confirmAction.type === "needs_stripe" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5">
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
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
        >
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5">
            <h2 id="confirm-title" className="text-lg font-semibold text-slate-900 mb-2">
              {confirmAction.type === "complete" ? "Mark session complete?" : "Cancel booking?"}
            </h2>
            <p className="text-slate-600 text-sm mb-4">
              {confirmAction.type === "complete"
                ? confirmAction.paymentStatus === "authorized" || confirmAction.paymentStatus === "pending_authorization"
                  ? "This will charge the athlete's card and transfer the session amount to you. This cannot be undone."
                  : confirmAction.paymentStatus === "deferred"
                    ? "This will mark the session as complete and automatically send a payment link to the athlete."
                    : "This will mark the session as complete."
                : `This will cancel the booking${confirmAction.athleteName ? ` with ${confirmAction.athleteName}` : ""}. Any payment hold will be released.`}
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
                  const status = confirmAction.type === "complete" ? "completed" : "cancelled";
                  updateMutation.mutate({ status });
                }}
                disabled={updateMutation.isPending}
                className={
                  confirmAction.type === "complete"
                    ? "px-4 py-2 rounded-lg text-sm font-medium bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50"
                    : "px-4 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                }
              >
                {confirmAction.type === "complete" ? "Mark complete" : "Yes, cancel"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
