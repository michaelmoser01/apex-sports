import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useRef, useCallback, useEffect } from "react";
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
  slot: {
    id: string;
    startTime: string;
    endTime: string;
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
}

export default function BookingDetail() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentJustCompleted, setPaymentJustCompleted] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
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
  const isUpcoming = booking.status === "pending" || booking.status === "confirmed";

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

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="p-6 pb-4">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <h1 className="text-xl font-bold text-slate-900">
              {isAthlete ? booking.coach.displayName : booking.athlete?.name ?? booking.athlete?.email ?? "Athlete"}
            </h1>
            <span
              className={`px-2.5 py-1 rounded-full text-sm font-medium ${
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
              <span className="px-2.5 py-1 rounded-full text-sm font-medium bg-emerald-100 text-emerald-700">
                Paid
              </span>
            )}
          </div>

          {/* Session details */}
          <div className="space-y-2">
            <div className="flex items-start gap-3 text-slate-600">
              <svg className="w-5 h-5 shrink-0 mt-0.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>{slotTime}</span>
            </div>
            {booking.slot.location && (
              <div className="flex items-start gap-3 text-slate-600">
                <svg className="w-5 h-5 shrink-0 mt-0.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
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
            {booking.amountCents != null && (
              <div className="flex items-center gap-3 text-slate-700">
                <svg className="w-5 h-5 shrink-0 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="font-semibold">${(booking.amountCents / 100).toFixed(2)}</span>
              </div>
            )}
          </div>

          {booking.message && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <p className="text-slate-600 text-sm whitespace-pre-wrap">{booking.message}</p>
            </div>
          )}
        </div>

        {/* Athlete: Pay (deferred) or Payment confirmed - only when session complete and payment link sent */}
        {showPaymentSection && (
          <div className={`px-6 py-5 ${needsPayment ? "bg-amber-50 border-y border-amber-200" : ""}`}>
            {paymentJustCompleted || isPaid ? (
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
                <p className="text-emerald-800 font-medium">Payment confirmed</p>
                <p className="text-emerald-700 text-sm mt-0.5">Thank you for your payment.</p>
              </div>
            ) : needsPayment && stripePk ? (
              <div className="p-5 rounded-xl bg-white border-2 border-amber-300 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900 mb-1">Payment due</h2>
                <p className="text-slate-600 text-sm mb-4">
                  Complete your payment of <span className="font-semibold text-slate-900">${(booking.amountCents! / 100).toFixed(2)}</span> for this session.
                </p>
                {paymentError && (
                  <p className="text-red-600 text-sm mb-3" role="alert">
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
              </div>
            ) : null}
          </div>
        )}

        {/* Athlete: Review - inline stars and text */}
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

        {/* Coach: Actions */}
        {isCoach && booking.status !== "cancelled" && (
          <div className="px-6 py-5 border-t border-slate-200">
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
              {booking.status === "completed" &&
                (booking.paymentStatus === "deferred" || booking.paymentStatus === "payment_link_sent") && (
                <button
                  onClick={() => paymentRequestMutation.mutate()}
                  disabled={paymentRequestMutation.isPending}
                  className="px-4 py-2 text-sm font-medium text-emerald-800 bg-emerald-100 rounded-lg hover:bg-emerald-200 disabled:opacity-50"
                >
                  Resend payment link
                </button>
              )}
            </div>
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

  // Athlete view: show saved recap
  if (!isCoach) {
    if (!existingRecap) return null;
    return (
      <div className="px-6 py-5 border-t border-slate-200">
        <h2 className="text-lg font-semibold text-slate-900 mb-3">Coach&apos;s session recap</h2>
        <div className="text-slate-600 text-sm whitespace-pre-wrap leading-relaxed">{existingRecap}</div>
      </div>
    );
  }

  // Coach view: show saved recap or editor
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
        <p className="text-red-600 text-sm mb-2" role="alert">{error}</p>
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
            className={`absolute right-2 top-2 p-2 rounded-lg transition ${
              isListening
                ? "bg-red-100 text-red-600 animate-pulse"
                : "bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700"
            } disabled:opacity-50`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
              <path d="M8.25 4.5a3.75 3.75 0 117.5 0v8.25a3.75 3.75 0 11-7.5 0V4.5z" />
              <path d="M6 10.5a.75.75 0 01.75.75v1.5a5.25 5.25 0 1010.5 0v-1.5a.75.75 0 011.5 0v1.5a6.751 6.751 0 01-6 6.709v2.291h3a.75.75 0 010 1.5h-7.5a.75.75 0 010-1.5h3v-2.291a6.751 6.751 0 01-6-6.709v-1.5A.75.75 0 016 10.5z" />
            </svg>
          </button>
        )}
      </div>

      {isListening && (
        <p className="text-red-600 text-xs mt-1 flex items-center gap-1">
          <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
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
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401z" clipRule="evenodd" />
              </svg>
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
