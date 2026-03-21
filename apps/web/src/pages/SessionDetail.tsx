import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";
import {
  ArrowLeft,
  Calendar,
  MapPin,
  DollarSign,
  CheckCircle,
  Clock,
  Users,
  Share2,
  Lock,
} from "lucide-react";
import { Avatar } from "@/components/Avatar";

interface Participant {
  id: string;
  athleteProfileId: string;
  name: string | null;
  email?: string;
  status: string;
  amountCents: number | null;
  paymentStatus: string | null;
  attended: boolean;
  lockedPrivate: boolean;
  createdAt: string;
  completedAt: string | null;
  message: string | null;
  coachRecap: string | null;
  review: { rating: number; comment: string } | null;
  isCurrentUser: boolean;
}

interface SessionData {
  slotId: string;
  sessionStatus: string;
  inviteCode: string | null;
  lockedPrivate: boolean;
  maxCapacity: number;
  allowPrivate: boolean;
  startTime: string;
  endTime: string;
  currentPerPersonAmountCents: number | null;
  spotsRemaining: number;
  coach: {
    id: string;
    displayName: string;
    sports: string[];
    stripeOnboardingComplete: boolean;
    billingMode: string;
  };
  location: {
    name: string;
    address: string;
    notes: string | null;
    latitude: number | null;
    longitude: number | null;
  } | null;
  participants: Participant[];
  viewerRole: "coach" | "athlete";
}

export default function SessionDetail() {
  const { slotId } = useParams<{ slotId: string }>();
  const queryClient = useQueryClient();

  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    type: "complete" | "cancel-session";
  } | null>(null);
  const [attendanceOverrides, setAttendanceOverrides] = useState<Record<string, boolean>>({});

  const { data: session, isLoading, isError, error } = useQuery({
    queryKey: ["session", slotId],
    queryFn: () => api<SessionData>(`/sessions/${slotId}`),
    enabled: !!slotId,
  });

  const confirmMutation = useMutation({
    mutationFn: ({ bookingId, status }: { bookingId: string; status: "confirmed" | "cancelled" }) =>
      api<{ status: string }>(`/bookings/${bookingId}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: (data) => {
      if (data?.status === "confirmed") setSuccessMessage("Participant confirmed.");
      else if (data?.status === "cancelled") setSuccessMessage("Participant removed.");
      setTimeout(() => setSuccessMessage(null), 5000);
      queryClient.invalidateQueries({ queryKey: ["session", slotId] });
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
    },
    onError: (err: Error) => setUpdateError(err.message ?? "Update failed"),
  });

  const completeMutation = useMutation({
    mutationFn: (attendance: { bookingId: string; attended: boolean }[]) =>
      api(`/sessions/${slotId}/complete`, {
        method: "POST",
        body: JSON.stringify({ attendance }),
      }),
    onSuccess: () => {
      setSuccessMessage("Session marked complete.");
      setConfirmAction(null);
      setTimeout(() => setSuccessMessage(null), 5000);
      queryClient.invalidateQueries({ queryKey: ["session", slotId] });
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
    },
    onError: (err: Error) => {
      setUpdateError(err.message ?? "Failed to complete session");
      setConfirmAction(null);
    },
  });

  const cancelSessionMutation = useMutation({
    mutationFn: () =>
      api(`/sessions/${slotId}/cancel`, { method: "POST" }),
    onSuccess: () => {
      setSuccessMessage("Session cancelled.");
      setConfirmAction(null);
      setTimeout(() => setSuccessMessage(null), 5000);
      queryClient.invalidateQueries({ queryKey: ["session", slotId] });
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
    },
    onError: (err: Error) => {
      setUpdateError(err.message ?? "Failed to cancel session");
      setConfirmAction(null);
    },
  });

  const markPaidMutation = useMutation({
    mutationFn: (bookingId: string) =>
      api(`/bookings/${bookingId}/mark-paid`, { method: "POST" }),
    onSuccess: () => {
      setSuccessMessage("Payment marked as received.");
      setTimeout(() => setSuccessMessage(null), 5000);
      queryClient.invalidateQueries({ queryKey: ["session", slotId] });
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
    },
  });

  const paymentRequestMutation = useMutation({
    mutationFn: (bookingId: string) =>
      api(`/bookings/${bookingId}/payment-request`, { method: "POST" }),
    onSuccess: () => {
      setSuccessMessage("Payment link sent.");
      setTimeout(() => setSuccessMessage(null), 5000);
      queryClient.invalidateQueries({ queryKey: ["session", slotId] });
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
    },
  });

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-slate-200 rounded w-48" />
          <div className="h-48 bg-slate-200 rounded" />
        </div>
      </div>
    );
  }

  if (isError || !session) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <Link to="/bookings" className="text-brand-500 hover:text-brand-600 text-sm font-medium flex items-center gap-1 mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to bookings
        </Link>
        <div className="p-4 bg-danger-50 border border-danger-200 rounded-xl text-danger-700">
          Something went wrong loading this session.{" "}
          {(error as Error)?.message && <span className="block mt-1 text-sm">{(error as Error).message}</span>}
        </div>
      </div>
    );
  }

  const activeParticipants = session.participants.filter((p) => p.status !== "cancelled");

  const slotStart = new Date(session.startTime);
  const slotEnd = new Date(session.endTime);
  const dateStr = slotStart.toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  const frontendUrl = window.location.origin;
  const shareUrl = session.inviteCode
    ? `${frontendUrl}/group/${session.inviteCode}`
    : `${frontendUrl}/coaches/${session.coach.id}/book?slotId=${session.slotId}`;

  const statusBadge = (status: string) => {
    const cls =
      status === "confirmed" ? "bg-success-100 text-success-700 ring-success-600/10"
      : status === "completed" ? "bg-slate-100 text-slate-700 ring-slate-600/10"
      : status === "cancelled" ? "bg-danger-100 text-danger-700 ring-danger-600/10"
      : status === "available" ? "bg-brand-100 text-brand-700 ring-brand-600/10"
      : "bg-amber-100 text-amber-700 ring-amber-600/10";
    return (
      <span className={`px-3 py-1 rounded-full text-xs font-semibold ring-1 ${cls}`}>
        {status}
      </span>
    );
  };

  return (
    <div className="max-w-3xl mx-auto pb-20">
      <div className="px-6 pt-6 pb-4">
        <Link to="/bookings" className="text-brand-500 hover:text-brand-600 text-sm font-medium flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Back to bookings
        </Link>
      </div>

      {successMessage && (
        <div className="mx-6 mb-4 p-3 bg-success-50 border border-success-200 rounded-xl text-success-700 text-sm font-medium">
          {successMessage}
        </div>
      )}
      {updateError && (
        <div className="mx-6 mb-4 p-3 bg-danger-50 border border-danger-200 rounded-xl text-danger-700 text-sm font-medium">
          {updateError}
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-card mx-4 sm:mx-6 overflow-hidden border border-slate-200/60">
        {/* Progress bar */}
        <div className="h-1 bg-slate-100">
          <div
            className={`h-full transition-all duration-500 ${
              session.sessionStatus === "completed"
                ? "w-full bg-success-500"
                : session.sessionStatus === "confirmed"
                ? "w-2/3 bg-brand-500"
                : session.sessionStatus === "cancelled"
                ? "w-full bg-danger-400"
                : session.sessionStatus === "available"
                ? "w-0"
                : "w-1/3 bg-amber-400"
            }`}
          />
        </div>

        {/* Header */}
        <div className="px-6 pt-5 pb-4">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
              Session &middot; {dateStr}
            </h1>
            {statusBadge(session.sessionStatus)}
            {session.lockedPrivate && (
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-violet-100 text-violet-700 ring-1 ring-violet-600/10">
                Private
              </span>
            )}
          </div>

          {/* Timeline */}
          <div className="flex items-center gap-2 text-xs font-medium mt-3">
            <span className={`flex items-center gap-1 ${session.sessionStatus !== "available" ? "text-brand-600" : "text-slate-400"}`}>
              <Clock className="w-3.5 h-3.5" /> Requested
            </span>
            <span className="flex-1 h-px bg-slate-200" />
            <span className={`flex items-center gap-1 ${session.sessionStatus === "confirmed" || session.sessionStatus === "completed" ? "text-brand-600" : "text-slate-400"}`}>
              <CheckCircle className="w-3.5 h-3.5" /> Confirmed
            </span>
            <span className="flex-1 h-px bg-slate-200" />
            <span className={`flex items-center gap-1 ${session.sessionStatus === "completed" ? "text-success-600" : "text-slate-400"}`}>
              <CheckCircle className="w-3.5 h-3.5" /> Complete
            </span>
          </div>
        </div>

        {/* Session details */}
        <div className="px-6 py-4 border-t border-slate-100 space-y-3">
          <div className="flex items-center gap-3 text-slate-700">
            <Calendar className="w-5 h-5 shrink-0 text-slate-400" />
            <span>{slotStart.toLocaleDateString([], { dateStyle: "medium" })}, {slotStart.toLocaleTimeString([], { timeStyle: "short" })} – {slotEnd.toLocaleTimeString([], { timeStyle: "short" })}</span>
          </div>
          {session.currentPerPersonAmountCents != null && (
            <div className="flex items-center gap-3 text-slate-700">
              <DollarSign className="w-5 h-5 shrink-0 text-slate-400" />
              <span className="font-semibold">
                ${(session.currentPerPersonAmountCents / 100).toFixed(2)}
                <span className="text-sm font-normal text-slate-500 ml-1">per person</span>
              </span>
            </div>
          )}
          {session.location && (
            <div className="flex items-start gap-3 text-slate-700">
              <MapPin className="w-5 h-5 shrink-0 text-slate-400 mt-0.5" />
              <div>
                <p className="font-medium">{session.location.name}</p>
                <p className="text-sm text-slate-500">{session.location.address}</p>
                {session.location.notes && <p className="text-sm text-slate-500 italic">{session.location.notes}</p>}
              </div>
            </div>
          )}
        </div>

        {/* Locked Private callout */}
        {session.lockedPrivate && (
          <div className="mx-6 mb-4 p-4 rounded-xl bg-violet-50 border border-violet-200 flex gap-3">
            <Lock className="w-5 h-5 text-violet-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-violet-800">Private session</p>
              <p className="text-sm text-violet-700 mt-0.5">
                This slot is locked as a private 1-on-1 session. No other athletes can join.
              </p>
            </div>
          </div>
        )}

        {/* Participants */}
        <div className="px-6 pt-4 pb-2 border-t border-slate-200">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <Users className="w-5 h-5 text-slate-400" />
              Session Participants ({activeParticipants.length})
            </h2>
            {session.spotsRemaining > 0 && session.sessionStatus !== "cancelled" && session.sessionStatus !== "completed" && (
              <button
                type="button"
                onClick={() => { navigator.clipboard.writeText(shareUrl); setSuccessMessage("Link copied!"); setTimeout(() => setSuccessMessage(null), 3000); }}
                className="flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
              >
                <Share2 className="w-4 h-4" /> Share session
              </button>
            )}
          </div>
          {session.spotsRemaining > 0 && session.sessionStatus !== "cancelled" && session.sessionStatus !== "completed" && (
            <p className="text-xs text-brand-600 mb-3">
              {session.spotsRemaining} {session.spotsRemaining === 1 ? "spot" : "spots"} remaining — share to drop the per-person price
            </p>
          )}

          <div className="space-y-2 mb-4">
            {session.participants.map((p) => {
              const isCancelled = p.status === "cancelled";
              const isPaid = p.paymentStatus === "succeeded" || p.paymentStatus === "authorized" || p.paymentStatus === "paid_offline";
              const needsPayment = session.sessionStatus === "completed" &&
                (p.paymentStatus === "deferred" || p.paymentStatus === "payment_link_sent");

              return (
                <div
                  key={p.id}
                  className={`flex items-center gap-3 p-3 rounded-xl border transition ${
                    isCancelled ? "border-slate-200 bg-slate-50 opacity-60" : "border-slate-200 bg-white"
                  }`}
                >
                  <Avatar displayName={p.name ?? "?"} src={null} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-slate-900 truncate">{p.name ?? p.email ?? "Athlete"}</p>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className={
                        p.status === "confirmed" ? "text-success-600 font-medium"
                        : p.status === "completed" ? "text-slate-600 font-medium"
                        : p.status === "cancelled" ? "text-danger-600 font-medium"
                        : "text-amber-600 font-medium"
                      }>{p.status}</span>
                      {p.paymentStatus && <span>&middot; {p.paymentStatus === "paid_offline" ? "paid (offline)" : p.paymentStatus}</span>}
                    </div>
                  </div>

                  {/* Inline actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {/* Pending: confirm / decline */}
                    {p.status === "pending" && session.sessionStatus !== "completed" && (
                      <>
                        <button
                          type="button"
                          onClick={() => confirmMutation.mutate({ bookingId: p.id, status: "confirmed" })}
                          disabled={confirmMutation.isPending}
                          className="px-2.5 py-1 text-xs font-medium bg-success-100 text-success-700 rounded-lg hover:bg-success-200 disabled:opacity-50"
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          onClick={() => confirmMutation.mutate({ bookingId: p.id, status: "cancelled" })}
                          disabled={confirmMutation.isPending}
                          className="px-2.5 py-1 text-xs font-medium text-danger-600 hover:text-danger-700"
                        >
                          Decline
                        </button>
                      </>
                    )}
                    {/* Confirmed: remove + attendance */}
                    {p.status === "confirmed" && session.sessionStatus === "confirmed" && (
                      <>
                        <button
                          type="button"
                          onClick={() => confirmMutation.mutate({ bookingId: p.id, status: "cancelled" })}
                          disabled={confirmMutation.isPending}
                          className="px-2.5 py-1 text-xs font-medium text-danger-600 bg-danger-50 rounded-lg hover:bg-danger-100 disabled:opacity-50"
                        >
                          Remove
                        </button>
                        <div className="flex items-center gap-1 text-xs">
                          <label className="flex items-center gap-1 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={attendanceOverrides[p.id] ?? p.attended}
                              onChange={(e) => setAttendanceOverrides((prev) => ({ ...prev, [p.id]: e.target.checked }))}
                              className="rounded border-slate-300"
                            />
                            Attended
                          </label>
                        </div>
                      </>
                    )}
                    {/* Completed: payment actions */}
                    {needsPayment && (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => markPaidMutation.mutate(p.id)}
                          disabled={markPaidMutation.isPending}
                          className="px-2.5 py-1 text-xs font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50"
                        >
                          Mark paid
                        </button>
                        <button
                          type="button"
                          onClick={() => paymentRequestMutation.mutate(p.id)}
                          disabled={paymentRequestMutation.isPending}
                          className="px-2.5 py-1 text-xs font-medium text-amber-700 bg-amber-50 rounded-lg hover:bg-amber-100 disabled:opacity-50"
                        >
                          Send link
                        </button>
                      </div>
                    )}
                    {isPaid && (
                      <span className="px-2 py-0.5 text-xs font-medium bg-success-100 text-success-700 rounded-full">
                        {p.paymentStatus === "paid_offline" ? "Paid (offline)" : "Paid"}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Session-level actions */}
        {session.sessionStatus !== "cancelled" && session.sessionStatus !== "available" && session.sessionStatus !== "completed" && (
          <div className="px-6 py-5 border-t border-slate-200">
            <h2 className="text-lg font-semibold text-slate-900 mb-3">Actions</h2>
            <div className="flex flex-wrap gap-3">
              {session.sessionStatus === "confirmed" && (
                <button
                  onClick={() => setConfirmAction({ type: "complete" })}
                  disabled={completeMutation.isPending}
                  className="bg-brand-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-brand-600 disabled:opacity-50"
                >
                  Mark complete
                </button>
              )}
              {activeParticipants.length > 0 && (
                <button
                  onClick={() => setConfirmAction({ type: "cancel-session" })}
                  className="bg-danger-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-danger-700"
                >
                  Cancel session
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Confirmation modal */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-2">
              {confirmAction.type === "complete" ? "Mark session complete?" : "Cancel entire session?"}
            </h2>
            <p className="text-slate-600 text-sm mb-4">
              {confirmAction.type === "complete"
                ? "This will complete the session for all attended participants and trigger payment processing."
                : "This will cancel all participants and free the slot. Any payment holds will be released."}
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
                  if (confirmAction.type === "cancel-session") {
                    cancelSessionMutation.mutate();
                  } else {
                    const attendance = activeParticipants.map((p) => ({
                      bookingId: p.id,
                      attended: attendanceOverrides[p.id] ?? p.attended,
                    }));
                    completeMutation.mutate(attendance);
                  }
                }}
                disabled={completeMutation.isPending || cancelSessionMutation.isPending}
                className={
                  confirmAction.type === "complete"
                    ? "px-4 py-2 rounded-lg text-sm font-medium bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50"
                    : "px-4 py-2 rounded-lg text-sm font-medium bg-danger-600 text-white hover:bg-danger-700 disabled:opacity-50"
                }
              >
                {confirmAction.type === "complete" ? "Mark complete" : "Yes, cancel session"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
