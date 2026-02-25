import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo, useEffect } from "react";
import { useLocation, Navigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useCurrentUser } from "@/hooks/useCurrentUser";

interface BookingsData {
  asAthlete: {
    id: string;
    coach: { id: string; displayName: string; sports: string[] };
    slot: { id: string; startTime: string; endTime: string };
    message: string | null;
    status: string;
    createdAt: string;
    review: { rating: number; comment: string } | null;
  }[];
  asCoach: {
    id: string;
    athlete: { id: string; name: string | null; email: string };
    slot: { id: string; startTime: string; endTime: string };
    message: string | null;
    status: string;
    createdAt: string;
  }[];
}

type TabId = "athlete" | "coach";

function isActive(endTime: string, status: string): boolean {
  if (status === "cancelled" || status === "completed") return false;
  return new Date(endTime) >= new Date();
}

export default function Bookings() {
  const location = useLocation();
  const returnTo = (location.state as { returnTo?: string } | null)?.returnTo;
  const queryClient = useQueryClient();
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [activeTab, setActiveTab] = useState<TabId>("athlete");
  const [showPastAthlete, setShowPastAthlete] = useState(false);
  const [showPastCoach, setShowPastCoach] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [pendingUpdateId, setPendingUpdateId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    type: "cancel" | "complete" | "cancel_request";
    bookingId: string;
    athleteName?: string;
  } | null>(null);

  const { data: currentUser } = useCurrentUser(true);
  const hasCoachProfile = !!currentUser?.coachProfile;

  const { data, isLoading } = useQuery({
    queryKey: ["bookings"],
    queryFn: () => api<BookingsData>("/bookings"),
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      status,
    }: {
      id: string;
      status: "confirmed" | "cancelled" | "completed";
    }) =>
      api<{ status: string }>(`/bookings/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: (data: { status: string }) => {
      setUpdateError(null);
      setPendingUpdateId(null);
      setConfirmAction(null);
      if (data?.status === "completed") setSuccessMessage("Session marked complete. Payment was captured.");
      else if (data?.status === "cancelled") setSuccessMessage("Booking cancelled.");
      else if (data?.status === "confirmed") setSuccessMessage("Booking confirmed.");
      setTimeout(() => setSuccessMessage(null), 5000);
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
    },
    onError: (err: Error) => {
      setUpdateError(err.message ?? "Update failed");
      setPendingUpdateId(null);
      setConfirmAction(null);
    },
  });

  const reviewMutation = useMutation({
    mutationFn: ({
      id,
      rating,
      comment,
    }: {
      id: string;
      rating: number;
      comment: string;
    }) =>
      api(`/bookings/${id}/review`, {
        method: "POST",
        body: JSON.stringify({ rating, comment }),
      }),
    onSuccess: () => {
      setReviewing(null);
      setReviewComment("");
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
    },
  });

  const asAthlete = data?.asAthlete ?? [];
  const asCoach = data?.asCoach ?? [];

  const { athleteUpcoming, athletePast } = useMemo(() => {
    const active = asAthlete
      .filter((b) => isActive(b.slot.endTime, b.status))
      .sort((a, b) => new Date(a.slot.startTime).getTime() - new Date(b.slot.startTime).getTime());
    const past = asAthlete.filter((b) => !isActive(b.slot.endTime, b.status));
    return { athleteUpcoming: active, athletePast: past };
  }, [asAthlete]);

  const { coachUpcoming, coachPast } = useMemo(() => {
    const active = asCoach
      .filter((b) => isActive(b.slot.endTime, b.status))
      .sort((a, b) => new Date(a.slot.startTime).getTime() - new Date(b.slot.startTime).getTime());
    const past = asCoach.filter((b) => !isActive(b.slot.endTime, b.status));
    return { coachUpcoming: active, coachPast: past };
  }, [asCoach]);

  const tabs: { id: TabId; label: string }[] = hasCoachProfile
    ? [
        { id: "coach", label: "As Coach" },
        { id: "athlete", label: "As Athlete" },
      ]
    : [{ id: "athlete", label: "As Athlete" }];

  useEffect(() => {
    if (hasCoachProfile) setActiveTab("coach");
  }, [hasCoachProfile]);

  if (returnTo) {
    return <Navigate to={returnTo} replace />;
  }

  if (isLoading || data === undefined) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12">
        <p className="text-slate-500">
          {isLoading ? "Loading bookings..." : "Unable to load bookings."}
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 sm:py-12">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Bookings</h1>

      {tabs.length > 1 && (
        <div className="flex gap-1 p-1 bg-slate-100 rounded-lg mb-6 sm:mb-8 w-full sm:w-fit">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 sm:flex-none px-4 py-3 sm:py-2 rounded-md text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {activeTab === "athlete" && (
        <section className="mb-10 sm:mb-12">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Active bookings</h2>
          {successMessage && (
            <div className="mb-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm" role="status">
              {successMessage}
            </div>
          )}
          {athleteUpcoming.length === 0 ? (
            <p className="text-slate-500">No active bookings.</p>
          ) : (
            <div className="space-y-5 sm:space-y-4">
              {athleteUpcoming.map((b) => (
                <div
                  key={b.id}
                  className="p-5 sm:p-4 bg-white rounded-xl border border-slate-200"
                >
                <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-start">
                  <div className="min-w-0">
                    <p className="font-medium">{b.coach.displayName}</p>
                    <p className="text-brand-600 text-sm">{b.coach.sports?.length ? b.coach.sports.join(", ") : "—"}</p>
                    <p className="text-slate-500 text-sm mt-1">
                      {new Date(b.slot.startTime).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`self-start px-2.5 py-1 rounded text-sm font-medium ${
                        b.status === "confirmed"
                          ? "bg-emerald-100 text-emerald-700"
                          : b.status === "completed"
                          ? "bg-slate-100 text-slate-700"
                          : b.status === "cancelled"
                          ? "bg-red-100 text-red-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {b.status}
                    </span>
                    {b.status === "pending" && (
                      <button
                        type="button"
                        onClick={() => setConfirmAction({ type: "cancel_request", bookingId: b.id })}
                        disabled={pendingUpdateId != null}
                        className="text-red-600 hover:text-red-700 text-sm font-medium underline disabled:opacity-50"
                      >
                        Cancel request
                      </button>
                    )}
                  </div>
                </div>
                {b.status === "completed" && !b.review && (
                  <div className="mt-4">
                    {reviewing === b.id ? (
                      <div>
                        <div className="flex gap-2 mb-2">
                          {[1, 2, 3, 4, 5].map((r) => (
                            <button
                              key={r}
                              onClick={() => setReviewRating(r)}
                              className={`px-2 py-1 rounded ${
                                r <= reviewRating
                                  ? "bg-amber-400 text-white"
                                  : "bg-slate-200"
                              }`}
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
                          onClick={() =>
                            reviewMutation.mutate({
                              id: b.id,
                              rating: reviewRating,
                              comment: reviewComment,
                            })
                          }
                          className="bg-brand-500 text-white px-3 py-1 rounded text-sm"
                        >
                          Submit Review
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setReviewing(b.id)}
                        className="text-brand-600 text-sm font-medium hover:underline"
                      >
                        Write a review
                      </button>
                    )}
                  </div>
                )}
                </div>
              ))}
            </div>
          )}

          {athletePast.length > 0 && (
            <div className="mt-8">
              <button
                type="button"
                onClick={() => setShowPastAthlete((v) => !v)}
                className="flex items-center gap-2 text-slate-600 hover:text-slate-900 font-medium text-sm mb-4"
              >
                <span>
                  {showPastAthlete ? "Hide" : "Show"} completed or cancelled ({athletePast.length})
                </span>
                <svg
                  className={`w-4 h-4 transition-transform ${showPastAthlete ? "rotate-180" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {showPastAthlete && (
                <div className="space-y-5 sm:space-y-4">
                  {athletePast.map((b) => (
                    <div
                      key={b.id}
                      className="p-5 sm:p-4 bg-white rounded-xl border border-slate-200 opacity-90"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-start">
                        <div className="min-w-0">
                          <p className="font-medium">{b.coach.displayName}</p>
                          <p className="text-brand-600 text-sm">{b.coach.sports?.length ? b.coach.sports.join(", ") : "—"}</p>
                          <p className="text-slate-500 text-sm mt-1">
                            {new Date(b.slot.startTime).toLocaleString()}
                          </p>
                        </div>
                        <span
                          className={`self-start px-2.5 py-1 rounded text-sm font-medium shrink-0 ${
                            b.status === "confirmed"
                              ? "bg-emerald-100 text-emerald-700"
                              : b.status === "completed"
                              ? "bg-slate-100 text-slate-700"
                              : b.status === "cancelled"
                              ? "bg-red-100 text-red-700"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {b.status}
                        </span>
                      </div>
                      {b.status === "completed" && !b.review && (
                        <div className="mt-4">
                          {reviewing === b.id ? (
                            <div>
                              <div className="flex gap-2 mb-2">
                                {[1, 2, 3, 4, 5].map((r) => (
                                  <button
                                    key={r}
                                    onClick={() => setReviewRating(r)}
                                    className={`px-2 py-1 rounded ${
                                      r <= reviewRating
                                        ? "bg-amber-400 text-white"
                                        : "bg-slate-200"
                                    }`}
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
                                onClick={() =>
                                  reviewMutation.mutate({
                                    id: b.id,
                                    rating: reviewRating,
                                    comment: reviewComment,
                                  })
                                }
                                className="bg-brand-500 text-white px-3 py-1 rounded text-sm"
                              >
                                Submit Review
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setReviewing(b.id)}
                              className="text-brand-600 text-sm font-medium hover:underline"
                            >
                              Write a review
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {activeTab === "coach" && (
        <section>
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Active bookings</h2>
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
          {coachUpcoming.length === 0 ? (
            <p className="text-slate-500">No active bookings or pending requests.</p>
          ) : (
            <div className="space-y-5 sm:space-y-4">
              {coachUpcoming.map((b) => (
                <div
                  key={b.id}
                  className="p-5 sm:p-4 bg-white rounded-xl border border-slate-200"
                >
                <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-start">
                  <div className="min-w-0">
                    <p className="font-medium">{b.athlete.name ?? b.athlete.email}</p>
                    <p className="text-slate-500 text-sm mt-0.5">
                      {new Date(b.slot.startTime).toLocaleString()}
                    </p>
                    {b.message != null && b.message.trim() !== "" && (
                      <p className="text-slate-600 text-sm mt-2 whitespace-pre-wrap">{b.message}</p>
                    )}
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-2 shrink-0">
                    <span
                      className={`self-start px-2.5 py-1 rounded text-sm font-medium ${
                        b.status === "confirmed"
                          ? "bg-emerald-100 text-emerald-700"
                          : b.status === "completed"
                          ? "bg-slate-100 text-slate-700"
                          : b.status === "cancelled"
                          ? "bg-red-100 text-red-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {b.status}
                    </span>
                    {b.status === "pending" && (
                      <div className="flex flex-col gap-2 sm:flex-row sm:gap-2">
                        <button
                          onClick={() => {
                            setPendingUpdateId(b.id);
                            updateMutation.mutate({ id: b.id, status: "confirmed" });
                          }}
                          disabled={pendingUpdateId === b.id || updateMutation.isPending}
                          className="bg-emerald-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium min-h-[44px] sm:min-h-0 disabled:opacity-50"
                        >
                          {pendingUpdateId === b.id ? "Accepting…" : "Accept"}
                        </button>
                        <button
                          onClick={() => setConfirmAction({ type: "cancel", bookingId: b.id, athleteName: b.athlete.name ?? undefined })}
                          disabled={pendingUpdateId != null}
                          className="bg-red-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium min-h-[44px] sm:min-h-0 disabled:opacity-50"
                        >
                          Decline
                        </button>
                      </div>
                    )}
                    {b.status === "confirmed" && (
                      <div className="flex flex-col gap-2 sm:flex-row sm:gap-2">
                        <button
                          onClick={() => setConfirmAction({ type: "complete", bookingId: b.id, athleteName: b.athlete.name ?? undefined })}
                          disabled={pendingUpdateId != null}
                          className="bg-brand-500 text-white px-4 py-2.5 rounded-lg text-sm font-medium min-h-[44px] sm:min-h-0 disabled:opacity-50"
                        >
                          Mark complete
                        </button>
                        <button
                          onClick={() => setConfirmAction({ type: "cancel", bookingId: b.id, athleteName: b.athlete.name ?? undefined })}
                          disabled={pendingUpdateId != null}
                          className="bg-red-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium min-h-[44px] sm:min-h-0 disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                </div>
              ))}
            </div>
          )}

          {coachPast.length > 0 && (
            <div className="mt-8">
              <button
                type="button"
                onClick={() => setShowPastCoach((v) => !v)}
                className="flex items-center gap-2 text-slate-600 hover:text-slate-900 font-medium text-sm mb-4"
              >
                <span>
                  {showPastCoach ? "Hide" : "Show"} completed or cancelled ({coachPast.length})
                </span>
                <svg
                  className={`w-4 h-4 transition-transform ${showPastCoach ? "rotate-180" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {showPastCoach && (
                <div className="space-y-5 sm:space-y-4">
                  {coachPast.map((b) => (
                    <div
                      key={b.id}
                      className="p-5 sm:p-4 bg-white rounded-xl border border-slate-200 opacity-90"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between sm:items-start">
                        <div className="min-w-0">
                          <p className="font-medium">{b.athlete.name ?? b.athlete.email}</p>
                          <p className="text-slate-500 text-sm">
                            {new Date(b.slot.startTime).toLocaleString()}
                          </p>
                          {b.message != null && b.message.trim() !== "" && (
                            <p className="text-slate-600 text-sm mt-2 whitespace-pre-wrap">{b.message}</p>
                          )}
                        </div>
                        <span
                          className={`self-start px-2.5 py-1 rounded text-sm font-medium shrink-0 ${
                            b.status === "confirmed"
                              ? "bg-emerald-100 text-emerald-700"
                              : b.status === "completed"
                              ? "bg-slate-100 text-slate-700"
                              : b.status === "cancelled"
                              ? "bg-red-100 text-red-700"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {b.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5">
            <h2 id="confirm-title" className="text-lg font-semibold text-slate-900 mb-2">
              {confirmAction.type === "complete" ? "Mark session complete?" : "Cancel booking?"}
            </h2>
            <p className="text-slate-600 text-sm mb-4">
              {confirmAction.type === "complete"
                ? "This will charge the athlete's card and transfer the session amount to you. This cannot be undone."
                : confirmAction.type === "cancel_request"
                  ? "Your request will be cancelled and the slot will be released."
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
                  setPendingUpdateId(confirmAction.bookingId);
                  updateMutation.mutate({ id: confirmAction.bookingId, status });
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
